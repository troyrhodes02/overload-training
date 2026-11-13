jest.mock("@/lib/db", () => ({ prisma: {} }));

import fs from "node:fs";
import path from "node:path";
import { ACCOUNT_DELETION_ORDER } from "@/lib/accounts/deletion";
import {
  argsProblem,
  assertQaEnvironment,
  parseArgs,
} from "../../scripts/qa-fixture/cli";
import {
  ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR,
  QA_CARDIO_LOGS,
  QA_GOALS,
  QA_PERFORMANCES,
  QA_RIR,
  QA_SESSIONS,
  QA_SKIPPED,
  expectedCounts,
  qaOccurrences,
  qaWorkouts,
} from "../../scripts/qa-fixture/fixture";
import { QA_RESET_MODELS, isQaTestEmail } from "../../scripts/qa-fixture/qa";
import { TargetRefused } from "../../scripts/operator/target-identity";

/**
 * OVE-173 — the QA fixture's fail-closed rules and fixture shape. The tool
 * runs only on the development project, only for an explicitly named account
 * on a reserved test-email domain, and every write needs a confirmation bound
 * to that account. The reset is pinned as the only destroyer of logged history
 * outside the account-deletion module.
 */

const DEV = "vdxrmfadikwzodjljbdi";
const PROD = "ycxvdiklpefyhdclxyau";
const OTHER = "abcdefghijklmnopqrst";
const USER = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";

const hostedEnv = (ref: string) => ({
  DATABASE_URL: `postgresql://postgres.${ref}:pw@${POOLER}:6543/postgres`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
});

const parse = (s: string) => parseArgs(s.split(" ").filter(Boolean));

describe("arguments: explicit target, read-only by default, target-bound confirmations", () => {
  const base = `--user-id ${USER} --confirm-ref ${DEV}`;

  it("accepts the three commands as dry runs", () => {
    for (const cmd of ["seed", "reset", "verify"]) {
      const a = parse(`${cmd} ${base}`);
      expect(argsProblem(a)).toBeNull();
      expect(a.execute).toBe(false);
    }
  });

  it("refuses an unknown command, a missing account, or a malformed id", () => {
    expect(argsProblem(parse(`wipe ${base}`))).toMatch(
      /one of: seed, reset, verify/,
    );
    expect(argsProblem(parse(`reset --confirm-ref ${DEV}`))).toMatch(
      /--user-id/,
    );
    expect(
      argsProblem(parse(`reset --user-id me --confirm-ref ${DEV}`)),
    ).toMatch(/--user-id/);
  });

  it("requires the development project ref, and only that ref", () => {
    expect(argsProblem(parse(`verify --user-id ${USER}`))).toMatch(
      /--confirm-ref/,
    );
    expect(
      argsProblem(parse(`verify --user-id ${USER} --confirm-ref ${PROD}`)),
    ).toMatch(/development project/);
    expect(
      argsProblem(parse(`verify --user-id ${USER} --confirm-ref ${OTHER}`)),
    ).toMatch(/development project/);
  });

  it("seed --execute needs --confirm-user equal to --user-id", () => {
    expect(argsProblem(parse(`seed ${base} --execute`))).toMatch(
      /--confirm-user/,
    );
    expect(
      argsProblem(
        parse(
          `seed ${base} --execute --confirm-user a0000000-0000-4000-8000-000000000001`,
        ),
      ),
    ).toMatch(/--confirm-user/);
    expect(
      argsProblem(parse(`seed ${base} --execute --confirm-user ${USER}`)),
    ).toBeNull();
  });

  it("reset --execute needs --confirm-destroy equal to --user-id; nothing else counts", () => {
    expect(argsProblem(parse(`reset ${base} --execute`))).toMatch(
      /--confirm-destroy/,
    );
    expect(
      argsProblem(parse(`reset ${base} --execute --confirm-user ${USER}`)),
    ).toMatch(/--confirm-destroy/);
    expect(
      argsProblem(parse(`reset ${base} --execute --confirm-destroy ${USER}`)),
    ).toBeNull();
  });

  it("has no --force, --production, or override flag", () => {
    for (const flag of ["--force", "--production", "--yes", "--skip-checks"]) {
      expect(argsProblem(parse(`reset ${base} ${flag}`))).toMatch(
        /Unexpected argument/,
      );
    }
  });

  it("verify is read-only: --execute is refused", () => {
    expect(argsProblem(parse(`verify ${base} --execute`))).toMatch(/read-only/);
  });
});

describe("environment: the development project, cross-checked, Production never", () => {
  it("accepts the confirmed development project", () => {
    const t = assertQaEnvironment(hostedEnv(DEV), DEV);
    expect(t).toMatchObject({ kind: "hosted", ref: DEV, production: false });
  });

  it("refuses Production with no override, even when its ref is confirmed", () => {
    expect(() => assertQaEnvironment(hostedEnv(PROD), PROD)).toThrow(
      TargetRefused,
    );
    expect(() => assertQaEnvironment(hostedEnv(PROD), DEV)).toThrow(
      TargetRefused,
    );
  });

  it("refuses any variable that merely mentions Production", () => {
    expect(() =>
      assertQaEnvironment(
        { ...hostedEnv(DEV), SUPABASE_URL: `https://${PROD}.supabase.co` },
        DEV,
      ),
    ).toThrow(TargetRefused);
  });

  it("refuses another hosted project, mixed projects, and the local stack", () => {
    expect(() => assertQaEnvironment(hostedEnv(OTHER), OTHER)).toThrow(
      TargetRefused,
    );
    expect(() =>
      assertQaEnvironment(
        {
          ...hostedEnv(DEV),
          NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER}.supabase.co`,
        },
        DEV,
      ),
    ).toThrow(TargetRefused);
    expect(() =>
      assertQaEnvironment(
        {
          DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        },
        DEV,
      ),
    ).toThrow(TargetRefused);
  });

  it("refuses when a required variable is missing (no fallback)", () => {
    expect(() =>
      assertQaEnvironment({ DATABASE_URL: hostedEnv(DEV).DATABASE_URL }, DEV),
    ).toThrow(TargetRefused);
    expect(() => assertQaEnvironment({}, DEV)).toThrow(TargetRefused);
  });

  it("never echoes a credential in a refusal", () => {
    try {
      assertQaEnvironment(hostedEnv(PROD), PROD);
    } catch (e) {
      expect(String(e)).not.toContain("pw@");
    }
  });
});

describe("the designated account must be a test account", () => {
  it("accepts reserved test domains only", () => {
    for (const email of [
      "overload-staging-tester@example.com",
      "qa@example.org",
      "qa@sub.example.net",
      "qa@overload.test",
      "qa@app.localhost",
    ]) {
      expect([email, isQaTestEmail(email)]).toEqual([email, true]);
    }
    for (const email of [
      "lifter@gmail.com",
      "owner@icloud.com",
      "qa@example.com.evil.io",
      "qa@notexample.com",
      "qa@test.com",
    ]) {
      expect([email, isQaTestEmail(email)]).toEqual([email, false]);
    }
  });
});

describe("fixture shape (deterministic, synthetic)", () => {
  it("is the same every time", () => {
    expect(qaOccurrences()).toEqual(qaOccurrences());
    expect(expectedCounts()).toEqual(expectedCounts());
  });

  it("has a performance for every trained week of every slot, one rep count per set", () => {
    for (const w of qaWorkouts()) {
      const session = QA_SESSIONS.find((s) => s.key === w.session)!;
      for (const slot of session.slots) {
        const perf = QA_PERFORMANCES[slot.ex][w.weekIndex];
        expect([slot.ex, w.weekIndex, perf?.[1].length]).toEqual([
          slot.ex,
          w.weekIndex,
          slot.sets,
        ]);
      }
    }
    for (const [ex, weeks] of Object.entries(QA_RIR)) {
      const slot = QA_SESSIONS.flatMap((s) => s.slots).find(
        (s) => s.ex === ex,
      )!;
      for (const rir of weeks!) expect(rir.length).toBe(slot.sets);
    }
  });

  it("every occurrence is before the anchor; the anchor itself is Upper A, not logged", () => {
    expect(qaOccurrences().every((o) => o.daysBeforeAnchor > 0)).toBe(true);
    const upperA = QA_SESSIONS.find((s) => s.key === "upperA")!;
    expect(upperA.dayOffset).toBe(0);
    expect(ACTIVE_BLOCK_START_DAYS_BEFORE_ANCHOR % 7).toBe(0);
  });

  it("exactly one occurrence is skipped, and it is in the active block", () => {
    const skipped = qaOccurrences().filter((o) => o.skipped);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      block: QA_SKIPPED.block,
      session: QA_SKIPPED.session,
    });
  });

  it("cardio logs fall on planned days of the trained weeks only", () => {
    for (const c of QA_CARDIO_LOGS) {
      expect(c.week).toBeGreaterThanOrEqual(1);
      expect(c.week).toBeLessThanOrEqual(3);
    }
  });

  it("goals cover active, gym-scoped, reached, and archived", () => {
    expect(QA_GOALS.filter((g) => g.gym !== null)).toHaveLength(1);
    expect(QA_GOALS.filter((g) => "then" in g)).toHaveLength(1);
  });
});

describe("the reset is the only other destroyer of logged history", () => {
  const WEB = path.resolve(__dirname, "..", "..");
  const walk = (dir: string, acc: string[] = []): string[] => {
    if (!fs.existsSync(dir)) return acc;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (/\.(ts|tsx|mjs|cjs|js)$/.test(e.name)) acc.push(full);
    }
    return acc;
  };
  const rel = (f: string) => path.relative(WEB, f).replace(/\\/g, "/");
  const code = (f: string) =>
    fs
      .readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const files = [
    ...walk(path.join(WEB, "src")),
    ...walk(path.join(WEB, "scripts")),
    ...walk(path.join(WEB, "prisma")),
  ];

  it("deletes LoggedSet rows only in the deletion module and the QA reset", () => {
    const destroyers = files
      .filter((f) => /\.\s*loggedSet\s*\.\s*delete(Many)?\s*\(/.test(code(f)))
      .map(rel)
      .sort();
    expect(destroyers).toEqual(
      ["scripts/qa-fixture/qa.ts", "src/lib/accounts/deletion.ts"].sort(),
    );
  });

  it("deletes in the deletion module's own dependency order (a subsequence of it)", () => {
    const order = ACCOUNT_DELETION_ORDER as readonly string[];
    const positions = QA_RESET_MODELS.map((m) => order.indexOf(m));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Never the account itself, its billing mirror, or its entitlements.
    for (const kept of [
      "Profile",
      "BillingAccount",
      "Entitlement",
      "Feedback",
    ]) {
      expect(QA_RESET_MODELS as readonly string[]).not.toContain(kept);
    }
  });

  it("the QA module reaches data only through the account-scoped client", () => {
    const qa = code(path.join(WEB, "scripts/qa-fixture/qa.ts"));
    expect(qa).not.toMatch(
      /@\/lib\/db|new\s+PrismaClient|\$executeRaw|\$queryRaw/,
    );
    expect(qa).toMatch(/account\.db\.\$transaction/);
    expect(qa.match(/assertQaTestEmail\(target\.email\)/g)).toHaveLength(2);
  });

  it("application code never imports the QA fixture", () => {
    const importers = walk(path.join(WEB, "src"))
      .filter((f) => /qa-fixture/.test(code(f)))
      .map(rel);
    expect(importers).toEqual([]);
  });
});
