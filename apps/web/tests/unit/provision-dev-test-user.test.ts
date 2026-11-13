/**
 * Development test-account provisioning: target safeguards, idempotency,
 * partial-failure compensation, password handling, and the absence of any
 * billing or Production side effect.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  guardProvisionTarget,
  parseArgs,
  serviceKeyRef,
  writeCredentialsFile,
} from "../../scripts/operator/provision-dev-test-user/cli";
import {
  DEFAULT_TEST_EMAIL,
  DEV_PROJECT_REF,
  ProvisionRefused,
  executeProvision,
  generatePassword,
  planProvision,
  type AuthAdmin,
} from "../../scripts/operator/provision-dev-test-user/provision";
import {
  TargetRefused,
  verifyTargetMarker,
} from "../../scripts/operator/target-identity";

const PROD = "ycxvdiklpefyhdclxyau";
const OTHER = "abcdefghijklmnopqrst";
const POOLER = "aws-0-us-east-1.pooler.supabase.com";
const jwt = (ref: string) =>
  `h.${Buffer.from(JSON.stringify({ ref, role: "service_role" })).toString("base64url")}.s`;

const envFor = (ref: string, key = jwt(ref)) => ({
  DATABASE_URL: `postgresql://postgres.${ref}:pw@${POOLER}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres.${ref}:pw@${POOLER}:5432/postgres`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: key,
});
const dev = envFor(DEV_PROJECT_REF);

describe("target guard", () => {
  it("accepts the confirmed development project", () => {
    expect(guardProvisionTarget(dev, { confirmRef: DEV_PROJECT_REF })).toEqual(
      expect.objectContaining({ kind: "hosted", ref: DEV_PROJECT_REF }),
    );
  });

  it("requires --confirm-ref and rejects a wrong one", () => {
    expect(() => guardProvisionTarget(dev, {})).toThrow(/--confirm-ref/);
    expect(() => guardProvisionTarget(dev, { confirmRef: OTHER })).toThrow(
      /does not match/,
    );
  });

  it("refuses Production with every combination of flags", () => {
    const prod = envFor(PROD);
    for (const confirmRef of [undefined, PROD, DEV_PROJECT_REF]) {
      expect(() => guardProvisionTarget(prod, { confirmRef })).toThrow(
        TargetRefused,
      );
    }
    expect(() => guardProvisionTarget(prod, { confirmRef: PROD })).toThrow(
      /PRODUCTION/,
    );
  });

  it("refuses any single variable naming Production", () => {
    for (const name of [
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ] as const) {
      const mixed = { ...dev, [name]: envFor(PROD)[name] };
      expect(() =>
        guardProvisionTarget(mixed, { confirmRef: DEV_PROJECT_REF }),
      ).toThrow(TargetRefused);
    }
  });

  it("refuses a service-role key for another or the Production project", () => {
    expect(() =>
      guardProvisionTarget(envFor(DEV_PROJECT_REF, jwt(PROD)), {
        confirmRef: DEV_PROJECT_REF,
      }),
    ).toThrow(/PRODUCTION/);
    expect(() =>
      guardProvisionTarget(envFor(DEV_PROJECT_REF, jwt(OTHER)), {
        confirmRef: DEV_PROJECT_REF,
      }),
    ).toThrow(/belongs to project/);
    expect(() =>
      guardProvisionTarget(envFor(DEV_PROJECT_REF, ""), {
        confirmRef: DEV_PROJECT_REF,
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY is not set/);
  });

  it("refuses a different non-production project and the local stack", () => {
    expect(() =>
      guardProvisionTarget(envFor(OTHER), { confirmRef: OTHER }),
    ).toThrow(/only to the development project/);
    expect(() =>
      guardProvisionTarget(
        {
          DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          SUPABASE_SERVICE_ROLE_KEY: "x",
        },
        {},
      ),
    ).toThrow(TargetRefused);
  });

  it("requires every variable", () => {
    for (const name of [
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ] as const) {
      const { [name]: _omit, ...rest } = dev;
      void _omit;
      expect(() =>
        guardProvisionTarget(rest, { confirmRef: DEV_PROJECT_REF }),
      ).toThrow(TargetRefused);
    }
  });

  it("serviceKeyRef reads a JWT ref and ignores opaque keys", () => {
    expect(serviceKeyRef(jwt(DEV_PROJECT_REF))).toBe(DEV_PROJECT_REF);
    expect(serviceKeyRef("sb_secret_abc")).toBeNull();
  });
});

describe("identity marker", () => {
  const target = {
    kind: "hosted" as const,
    ref: DEV_PROJECT_REF,
    host: POOLER,
    production: false,
  };
  it("is verified only when it matches the development ref", async () => {
    await expect(
      verifyTargetMarker(target, async () => [
        { marker: `overload-target:${DEV_PROJECT_REF}` },
      ]),
    ).resolves.toBe("verified");
  });
  it("refuses a missing, mismatched, or Production marker", async () => {
    await expect(verifyTargetMarker(target, async () => [])).rejects.toThrow(
      /no database identity marker/,
    );
    await expect(
      verifyTargetMarker(target, async () => [
        { marker: `overload-target:${OTHER}` },
      ]),
    ).rejects.toThrow(/does not match/);
    await expect(
      verifyTargetMarker(target, async () => [
        { marker: `overload-target:${PROD}` },
      ]),
    ).rejects.toThrow(/PRODUCTION/);
  });
});

describe("args", () => {
  it("defaults to a dry run with a non-routable development email", () => {
    const a = parseArgs(["--confirm-ref", DEV_PROJECT_REF]);
    expect(a.execute).toBe(false);
    expect(a.email).toBe(DEFAULT_TEST_EMAIL);
    expect(DEFAULT_TEST_EMAIL.endsWith("@example.com")).toBe(true);
  });
  it("has no password-reset or production flag", () => {
    expect(parseArgs(["--production", "--reset-password"]).unexpected).toEqual([
      "--production",
      "--reset-password",
    ]);
  });
});

// ---- in-memory fakes -------------------------------------------------------

function fakeWorld(
  opts: { failProfile?: boolean; usernameTakenBy?: string } = {},
) {
  const w = {
    authUsers: new Map<string, string>(), // email -> id
    profiles: new Map<
      string,
      { username: string; emailVerifiedAt: Date | null }
    >(),
    tours: new Set<string>(),
    entitlements: [] as Record<string, unknown>[],
    createCalls: [] as { email: string; password: string }[],
    deleted: [] as string[],
  };
  if (opts.usernameTakenBy)
    w.profiles.set(opts.usernameTakenBy, {
      username: "staging_tester",
      emailVerifiedAt: null,
    });
  const auth: AuthAdmin = {
    async findUserIdByEmail(e) {
      return w.authUsers.get(e) ?? null;
    },
    async createConfirmedUser(i) {
      w.createCalls.push(i);
      const id = `uid-${w.authUsers.size + 1}`;
      w.authUsers.set(i.email, id);
      return { id };
    },
    async deleteUser(id) {
      w.deleted.push(id);
      for (const [e, v] of w.authUsers) if (v === id) w.authUsers.delete(e);
    },
  };
  const snapshot = () => ({
    profiles: new Map(w.profiles),
    tours: new Set(w.tours),
    entitlements: [...w.entitlements],
  });
  const db = {
    profile: {
      findUnique: async ({
        where,
      }: {
        where: { userId?: string; username?: string };
      }) => {
        if (where.userId)
          return w.profiles.has(where.userId) ? { userId: where.userId } : null;
        const hit = [...w.profiles].find(
          ([, p]) => p.username === where.username,
        );
        return hit ? { userId: hit[0] } : null;
      },
      create: async ({
        data,
      }: {
        data: { userId: string; username: string; emailVerifiedAt: Date };
      }) => {
        if (opts.failProfile) throw new Error("boom");
        w.profiles.set(data.userId, {
          username: data.username,
          emailVerifiedAt: data.emailVerifiedAt,
        });
      },
    },
    tourProgress: {
      createMany: async ({ data }: { data: { userId: string }[] }) => {
        for (const d of data) w.tours.add(d.userId);
      },
    },
    entitlement: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; source: string };
      }) =>
        w.entitlements.find(
          (e) =>
            e.userId === where.userId &&
            e.source === where.source &&
            !e.revokedAt,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        w.entitlements.push(data);
      },
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const before = snapshot();
      try {
        return await fn(db);
      } catch (e) {
        w.profiles = before.profiles;
        w.tours = before.tours;
        w.entitlements = before.entitlements;
        throw e;
      }
    },
  };
  return { w, auth, db: db as never };
}

const input = {
  email: DEFAULT_TEST_EMAIL,
  username: "staging_tester",
  timeZone: "America/Chicago",
};

describe("provisioning", () => {
  it("creates the auth user, profile, tour row, and a comp Pro entitlement", async () => {
    const { w, auth, db } = fakeWorld();
    const r = await executeProvision(
      db,
      auth,
      input,
      () => "Pw-for-test-1234567890",
    );
    expect(r).toMatchObject({
      status: "created",
      profile: "created",
      proComp: "granted",
    });
    expect(r.password).toBe("Pw-for-test-1234567890");
    expect(w.createCalls).toEqual([
      { email: input.email, password: "Pw-for-test-1234567890" },
    ]);
    const uid = r.userId;
    expect(w.profiles.get(uid)?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(w.tours.has(uid)).toBe(true);
    expect(w.entitlements).toEqual([
      expect.objectContaining({
        userId: uid,
        source: "comp",
        plan: "pro",
        compReason: "tester",
        endsAt: null,
      }),
    ]);
  });

  it("creates only comp entitlement data: no billing, subscription, or Stripe fields", async () => {
    const { w, auth, db } = fakeWorld();
    await executeProvision(db, auth, input);
    const keys = Object.keys(w.entitlements[0]).join(",");
    expect(keys).not.toMatch(/stripe|subscription|billing|price/i);
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../scripts/operator/provision-dev-test-user/provision.ts",
      ),
      "utf8",
    );
    expect(src).not.toMatch(
      /billingAccount|stripe\.|anthropic|sendMail|resend|trial/i,
    );
  });

  it("is idempotent: a second run reuses the account and never resets the password", async () => {
    const { w, auth, db } = fakeWorld();
    const first = await executeProvision(db, auth, input);
    const second = await executeProvision(db, auth, input);
    expect(second).toMatchObject({
      status: "already-existed",
      userId: first.userId,
      profile: "existed",
      proComp: "already-active",
    });
    expect(second.password).toBeUndefined();
    expect(w.createCalls).toHaveLength(1);
    expect(w.profiles.size).toBe(1);
    expect(w.entitlements).toHaveLength(1);
  });

  it("repairs a half-provisioned existing user without touching its password", async () => {
    const { w, auth, db } = fakeWorld();
    w.authUsers.set(input.email, "pre-existing");
    const r = await executeProvision(db, auth, input);
    expect(r).toMatchObject({
      status: "already-existed",
      profile: "created",
      proComp: "granted",
    });
    expect(w.createCalls).toHaveLength(0);
    expect(r.password).toBeUndefined();
    expect(w.deleted).toEqual([]);
  });

  it("removes an auth user it created if the database step fails, leaving nothing", async () => {
    const { w, auth, db } = fakeWorld({ failProfile: true });
    await expect(executeProvision(db, auth, input)).rejects.toThrow("boom");
    expect(w.authUsers.size).toBe(0);
    expect(w.profiles.size).toBe(0);
    expect(w.entitlements).toHaveLength(0);
  });

  it("never deletes a pre-existing auth user when its database step fails", async () => {
    const { w, auth, db } = fakeWorld({ failProfile: true });
    w.authUsers.set(input.email, "pre-existing");
    await expect(executeProvision(db, auth, input)).rejects.toThrow("boom");
    expect(w.deleted).toEqual([]);
    expect(w.authUsers.has(input.email)).toBe(true);
  });

  it("refuses a username held by another account and cleans up", async () => {
    const { w, auth, db } = fakeWorld({ usernameTakenBy: "someone-else" });
    await expect(executeProvision(db, auth, input)).rejects.toBeInstanceOf(
      ProvisionRefused,
    );
    expect(w.authUsers.size).toBe(0);
  });

  it("plans without writing anything", async () => {
    const { w, auth, db } = fakeWorld();
    const plan = await planProvision(db, auth, input);
    expect(plan).toMatchObject({
      authUser: "will-create",
      proComp: "will-grant",
    });
    expect(w.createCalls).toHaveLength(0);
    await executeProvision(db, auth, input);
    expect(await planProvision(db, auth, input)).toMatchObject({
      authUser: "exists",
      profile: "exists",
      proComp: "active",
    });
  });
});

describe("password handling", () => {
  it("is long, varied, and unique per call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(28);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[-_.!@#%*+=?]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
    expect(() => generatePassword(8)).toThrow(ProvisionRefused);
  });

  it("uses the CSPRNG, not Math.random", () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../scripts/operator/provision-dev-test-user/provision.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/randomInt/);
    expect(src).not.toMatch(/Math\.random/);
  });

  it("is never printed or logged by the CLI", () => {
    const src = fs
      .readFileSync(
        path.join(
          __dirname,
          "../../scripts/operator/provision-dev-test-user/cli.ts",
        ),
        "utf8",
      )
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const logs = src.split("\n").filter((l) => /console\./.test(l));
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toMatch(/\$\{[^}]*password[^}]*\}|result\.password/i);
    }
  });

  it("writes an owner-only file, refuses to overwrite it, and keeps it out of the repo", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-"));
    const file = path.join(dir, "sub", "test-user.txt");
    writeCredentialsFile("a@example.com", "secret", file);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    expect(() => writeCredentialsFile("a@example.com", "other", file)).toThrow(
      /EEXIST/,
    );
    expect(fs.readFileSync(file, "utf8")).toContain("PASSWORD=secret");
    fs.rmSync(dir, { recursive: true });
  });
});
