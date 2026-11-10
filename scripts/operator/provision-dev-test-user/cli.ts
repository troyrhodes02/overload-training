/**
 * Provision the reusable development test account (staging).
 *
 *   # Export the DEVELOPMENT values in this shell first (never from .env):
 *   #   DATABASE_URL  DIRECT_URL  NEXT_PUBLIC_SUPABASE_URL  SUPABASE_SERVICE_ROLE_KEY
 *   npx tsx scripts/operator/provision-dev-test-user/cli.ts \
 *     --confirm-ref vdxrmfadikwzodjljbdi            # DRY RUN (default), writes nothing
 *   … --execute                                      # creates; password -> a 0600 file
 *   … --email <addr> --username <name>               # optional overrides
 *
 * Refuses Production under every circumstance (policy "refuse", no override),
 * accepts only the development ref, cross-checks DATABASE_URL, DIRECT_URL,
 * NEXT_PUBLIC_SUPABASE_URL and the service-role key, and verifies the database
 * identity marker before writing. Never loads .env. The generated password is
 * written ONLY to a git-ignored, owner-only file outside the repository and is
 * never printed. An existing account is reused and its password is not reset.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  verifyTargetMarker,
  type VerifiedTarget,
} from "../target-identity";
import {
  isProductionRef,
  mentionsProductionRef,
} from "../../../src/lib/env/supabase-identity";
import {
  DEFAULT_TEST_EMAIL,
  DEFAULT_TEST_USERNAME,
  DEFAULT_TIME_ZONE,
  DEV_PROJECT_REF,
  ProvisionRefused,
  executeProvision,
  formatPlan,
  generatePassword,
  planProvision,
  type AuthAdmin,
} from "./provision";

const VALUE_FLAGS = new Set(["--confirm-ref", "--email", "--username"]);
export const CREDENTIALS_DIR = path.join(os.homedir(), ".overload-dev");
export const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "test-user.txt");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function parseArgs(argv: string[]) {
  const values: Record<string, string> = {};
  let execute = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--execute") execute = true;
    else if (VALUE_FLAGS.has(arg) && i + 1 < argv.length)
      values[arg] = argv[++i];
    else unexpected.push(arg);
  }
  return {
    confirmRef: values["--confirm-ref"],
    email: (values["--email"] ?? DEFAULT_TEST_EMAIL).trim().toLowerCase(),
    username: (values["--username"] ?? DEFAULT_TEST_USERNAME)
      .trim()
      .toLowerCase(),
    execute,
    unexpected,
  };
}

/** The project ref inside a legacy service-role JWT, or null if not a JWT. */
export function serviceKeyRef(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { ref?: unknown };
    return typeof claims.ref === "string" ? claims.ref.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * All pre-connection checks. Throws before anything is opened. Development
 * project only: Production is refused (policy "refuse"), and any ref other
 * than DEV_PROJECT_REF is refused even if it is a different non-production one.
 */
export function guardProvisionTarget(
  env: Record<string, string | undefined>,
  args: { confirmRef?: string },
): VerifiedTarget {
  const target = assertOperatorTarget({
    env,
    uses: ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    confirmRef: args.confirmRef,
    production: "refuse",
    allowLocal: false,
  });
  if (target.kind !== "hosted" || target.ref !== DEV_PROJECT_REF) {
    throw new TargetRefused(
      `Refusing: this tool writes only to the development project ${DEV_PROJECT_REF}.`,
    );
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new TargetRefused("SUPABASE_SERVICE_ROLE_KEY is not set.");
  if (mentionsProductionRef(key) || isProductionRef(serviceKeyRef(key))) {
    throw new TargetRefused(
      "Refusing: SUPABASE_SERVICE_ROLE_KEY names the PRODUCTION project.",
    );
  }
  const keyRef = serviceKeyRef(key);
  if (keyRef && keyRef !== DEV_PROJECT_REF) {
    throw new TargetRefused(
      `Refusing: SUPABASE_SERVICE_ROLE_KEY belongs to project ${keyRef}, not ${DEV_PROJECT_REF}.`,
    );
  }
  return target;
}

function supabaseAdmin(url: string, key: string): AuthAdmin {
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
  return {
    async findUserIdByEmail(email) {
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.listUsers({ page, perPage: 1000 });
        if (error)
          throw new Error(
            `Auth user lookup failed (${error.code ?? "unknown"}).`,
          );
        const hit = data.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) return hit.id;
        if (data.users.length < 1000) return null;
      }
      return null;
    },
    async createConfirmedUser({ email, password }) {
      const { data, error } = await admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Error(
          `Auth user creation failed (${error?.code ?? "unknown"}).`,
        );
      return { id: data.user.id };
    },
    async deleteUser(id) {
      const { error } = await admin.deleteUser(id);
      if (error)
        throw new Error(
          `Auth user cleanup failed (${error.code ?? "unknown"}).`,
        );
    },
  };
}

/** Owner-only file outside the repo. Created with 0600 and never overwritten. */
export function writeCredentialsFile(
  email: string,
  password: string,
  file = CREDENTIALS_FILE,
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `EMAIL=${email}\nPASSWORD=${password}\n`, {
    mode: 0o600,
    flag: "wx",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.unexpected.includes("--confirm-host")) fail(CONFIRM_HOST_RETIRED);
  if (args.unexpected.length > 0)
    fail(`Unexpected argument(s): ${args.unexpected.join(" ")}`);

  let target: VerifiedTarget;
  try {
    target = guardProvisionTarget(process.env, args);
  } catch (error) {
    if (error instanceof TargetRefused) fail(error.message);
    throw error;
  }

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
  });
  try {
    await verifyTargetMarker(target, (sql) => db.$queryRawUnsafe(sql));
    const auth = supabaseAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const input = {
      email: args.email,
      username: args.username,
      timeZone: DEFAULT_TIME_ZONE,
    };
    console.log(
      `Overload dev test account — ${args.execute ? "EXECUTE" : "DRY RUN (no changes)"}  target=${describeTarget(target)}`,
    );
    const plan = await planProvision(db, auth, input);
    console.log(formatPlan(plan));
    if (!args.execute) {
      console.log("\nNothing written. Re-run with --execute to provision.");
      return;
    }
    if (plan.authUser === "will-create" && fs.existsSync(CREDENTIALS_FILE)) {
      fail(
        `\nRefusing: ${CREDENTIALS_FILE} already exists and would be overwritten. Move it aside first. Nothing was changed.`,
      );
    }
    // The password is written to its file BEFORE the Auth user exists, so it
    // can never be lost; if provisioning then fails, the file is removed.
    let wroteFile = false;
    let result;
    try {
      result = await executeProvision(db, auth, input, () => {
        const password = generatePassword();
        writeCredentialsFile(args.email, password);
        wroteFile = true;
        return password;
      });
    } catch (error) {
      if (wroteFile) fs.rmSync(CREDENTIALS_FILE, { force: true });
      throw error;
    }
    console.log(
      `\nAccount ${result.status}. profile=${result.profile} pro-comp=${result.proComp}`,
    );
    if (result.password) {
      console.log(
        `Password saved (owner-only) to ${CREDENTIALS_FILE}. View it with: cat ${CREDENTIALS_FILE}`,
      );
    } else {
      console.log(
        "The account already existed: its password was NOT changed. To reset it deliberately, see docs/technical/staging-environment.md.",
      );
    }
  } catch (error) {
    if (error instanceof TargetRefused || error instanceof ProvisionRefused)
      fail(`\n${error.message}`);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
