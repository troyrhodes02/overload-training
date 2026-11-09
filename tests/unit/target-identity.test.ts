/**
 * OVE-111 — database target identity. Adversarial: Production and the
 * development project share the Supabase pooler hostname, so identity must
 * come from the project ref, every source must agree, a hosted target needs an
 * explicit ref confirmation, and Production is refused unless a tool's runbook
 * sanctions an explicit two-part opt-in.
 */
import {
  PRODUCTION_PROJECT_REFS,
  identifyDatabaseUrl,
  identifySupabaseUrl,
  isProductionRef,
  mentionsProductionRef,
} from "@/lib/env/supabase-identity";
import {
  TARGET_MARKER_SQL,
  TargetRefused,
  assertOperatorTarget,
  describeTarget,
  targetMarker,
  targetMarkerSetupSql,
  verifyTargetMarker,
  type OperatorTargetOptions,
  type VerifiedTarget,
} from "../../scripts/operator/target-identity";

const PROD = "ycxvdiklpefyhdclxyau";
const DEV = "abcdefghijklmnopqrst";
const OTHER = "zyxwvutsrqponmlkjihg";
const POOLER_HOST = "aws-0-us-east-1.pooler.supabase.com";
const SECRET = "s3cret-P4ss";

const pooled = (ref: string, port = 6543) =>
  `postgresql://postgres.${ref}:${SECRET}@${POOLER_HOST}:${port}/postgres`;
const direct = (ref: string) =>
  `postgresql://postgres:${SECRET}@db.${ref}.supabase.co:5432/postgres`;
const api = (ref: string) => `https://${ref}.supabase.co`;
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_API = "http://127.0.0.1:54321";

/** A complete, consistent hosted environment for `ref`. */
const hostedEnv = (ref: string) => ({
  DATABASE_URL: pooled(ref),
  DIRECT_URL: pooled(ref, 5432),
  NEXT_PUBLIC_SUPABASE_URL: api(ref),
});
const localEnv = () => ({
  DATABASE_URL: LOCAL_DB,
  DIRECT_URL: LOCAL_DB,
  NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
});

const guard = (
  env: Record<string, string | undefined>,
  extra: Partial<OperatorTargetOptions> = {},
) =>
  assertOperatorTarget({
    env,
    uses: ["DATABASE_URL", "DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    ...extra,
  });

/** Runs fn, expects a TargetRefused, and returns its message. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TargetRefused);
    return (error as Error).message;
  }
  throw new Error("expected a TargetRefused, but the guard allowed the target");
}

describe("identifying a database URL", () => {
  it("knows the production ref", () => {
    expect(PRODUCTION_PROJECT_REFS).toContain(PROD);
    expect(isProductionRef(PROD.toUpperCase())).toBe(true);
    expect(isProductionRef(DEV)).toBe(false);
  });

  it("reads a pooler connection's project from its USERNAME, not the shared host", () => {
    const prod = identifyDatabaseUrl(pooled(PROD));
    const dev = identifyDatabaseUrl(pooled(DEV));
    expect(prod).toMatchObject({
      kind: "supabase",
      ref: PROD,
      via: "pooler-username",
    });
    expect(dev).toMatchObject({
      kind: "supabase",
      ref: DEV,
      via: "pooler-username",
    });
    // Same hostname, different projects.
    expect(prod.kind === "supabase" && prod.host).toBe(POOLER_HOST);
    expect(dev.kind === "supabase" && dev.host).toBe(POOLER_HOST);
  });

  it("reads a direct connection's project from its project-specific host", () => {
    expect(identifyDatabaseUrl(direct(DEV))).toMatchObject({
      kind: "supabase",
      ref: DEV,
      via: "direct-host",
    });
  });

  it("refuses to identify a pooler URL that carries no ref in its username", () => {
    const id = identifyDatabaseUrl(
      `postgresql://postgres:${SECRET}@${POOLER_HOST}:6543/postgres`,
    );
    expect(id.kind).toBe("unknown");
  });

  it.each([
    [
      "username and host disagree",
      `postgresql://postgres.${PROD}:pw@db.${DEV}.supabase.co:5432/postgres`,
    ],
    [
      "malformed username ref",
      `postgresql://postgres.short:pw@${POOLER_HOST}:6543/postgres`,
    ],
    [
      "loopback host with a hosted ref (tunnel)",
      `postgresql://postgres.${PROD}:pw@127.0.0.1:6543/postgres`,
    ],
    [
      "an unrecognized supabase host",
      `postgresql://postgres:pw@weird.host.supabase.co:5432/postgres`,
    ],
    [
      "a remote non-supabase host",
      "postgresql://user:pw@db.example.com:5432/postgres",
    ],
    ["a non-postgres URL", "https://example.com"],
    ["garbage", "not a url"],
  ])("returns unknown for %s", (_why, url) => {
    expect(identifyDatabaseUrl(url).kind).toBe("unknown");
  });

  it("identifies the local stack", () => {
    expect(identifyDatabaseUrl(LOCAL_DB)).toEqual({
      kind: "local",
      host: "127.0.0.1",
    });
  });

  it("identifies a Supabase API URL by its project host", () => {
    expect(identifySupabaseUrl(api(DEV))).toMatchObject({
      kind: "supabase",
      ref: DEV,
    });
    expect(identifySupabaseUrl(LOCAL_API)).toMatchObject({ kind: "local" });
    expect(identifySupabaseUrl("https://auth.example.com").kind).toBe(
      "unknown",
    );
  });

  it("catches the production ref anywhere, in any case", () => {
    expect(
      mentionsProductionRef(`postgresql://x:y@h/${PROD.toUpperCase()}`),
    ).toBe(true);
    expect(mentionsProductionRef(pooled(DEV))).toBe(false);
  });
});

describe("operator guard — same pooler hostname, different projects", () => {
  it("does not accept the shared pooler hostname as confirmation", () => {
    const msg = refusal(() =>
      guard(hostedEnv(DEV), { confirmRef: POOLER_HOST }),
    );
    expect(msg).toMatch(/does not match/);
  });

  it("tells production and development apart although both use the same host", () => {
    expect(guard(hostedEnv(DEV), { confirmRef: DEV })).toEqual({
      kind: "hosted",
      ref: DEV,
      host: POOLER_HOST,
      production: false,
    });
    expect(() => guard(hostedEnv(PROD), { confirmRef: PROD })).toThrow(
      /PRODUCTION/,
    );
  });

  it("refuses a pooler URL with no ref in its username, even beside a confirmed dev API URL", () => {
    const env = {
      ...hostedEnv(DEV),
      DATABASE_URL: `postgresql://postgres:${SECRET}@${POOLER_HOST}:6543/postgres`,
    };
    expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
      /cannot be identified/,
    );
  });

  it("refuses a production DATABASE_URL hidden behind development confirmation", () => {
    const env = { ...hostedEnv(DEV), DATABASE_URL: pooled(PROD) };
    expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
      /PRODUCTION|different projects/,
    );
  });
});

describe("operator guard — production reference in the connection username", () => {
  it.each([
    ["DATABASE_URL", pooled(PROD)],
    ["DIRECT_URL", pooled(PROD, 5432)],
  ])(
    "refuses %s = postgres.<production ref> under the default policy",
    (name, url) => {
      const env = { ...hostedEnv(DEV), [name]: url };
      expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
        /PRODUCTION|different/,
      );
    },
  );

  it("refuses a production ref in the username even when the host is loopback", () => {
    const env = {
      ...localEnv(),
      DATABASE_URL: `postgresql://postgres.${PROD}:pw@127.0.0.1:6543/postgres`,
    };
    expect(() => guard(env)).toThrow(TargetRefused);
  });

  it("refuses production under 'refuse' even with --production and the exact ref", () => {
    const msg = refusal(() =>
      guard(hostedEnv(PROD), {
        confirmRef: PROD,
        production: "refuse",
        productionOptIn: true,
      }),
    );
    expect(msg).toMatch(/no override/);
  });

  it("refuses a screened variable that names production while the database is local", () => {
    expect(() => guard({ ...localEnv(), SUPABASE_URL: api(PROD) })).toThrow(
      /PRODUCTION/,
    );
  });

  it("refuses production confirmation for a non-production target", () => {
    expect(() => guard(hostedEnv(DEV), { confirmRef: PROD })).toThrow(
      TargetRefused,
    );
  });
});

describe("operator guard — mismatched database and Supabase identities", () => {
  it.each([
    ["DATABASE_URL", pooled(OTHER)],
    ["DIRECT_URL", direct(OTHER)],
    ["NEXT_PUBLIC_SUPABASE_URL", api(OTHER)],
  ])("refuses when %s names a different project", (name, url) => {
    const env = { ...hostedEnv(DEV), [name]: url };
    expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
      /different projects/,
    );
  });

  it("refuses a mix of local and hosted (rows and images in different places)", () => {
    const env = { ...hostedEnv(DEV), NEXT_PUBLIC_SUPABASE_URL: LOCAL_API };
    expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
      /different environments/,
    );
  });

  it("refuses a hosted target that cannot be cross-checked against NEXT_PUBLIC_SUPABASE_URL", () => {
    const env = { DIRECT_URL: pooled(DEV, 5432) };
    const msg = refusal(() =>
      assertOperatorTarget({ env, uses: ["DIRECT_URL"], confirmRef: DEV }),
    );
    expect(msg).toMatch(/cross-checked/);
  });

  it("refuses an ambiguous identity (username and host disagree)", () => {
    const env = {
      ...hostedEnv(DEV),
      DIRECT_URL: `postgresql://postgres.${OTHER}:pw@db.${DEV}.supabase.co:5432/postgres`,
    };
    expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
      /cannot be identified/,
    );
  });

  it("refuses a missing variable the tool connects with", () => {
    const { DIRECT_URL: _omit, ...env } = hostedEnv(DEV);
    void _omit;
    expect(refusal(() => guard(env, { confirmRef: DEV }))).toMatch(
      /DIRECT_URL is not set/,
    );
  });
});

describe("operator guard — explicit confirmation", () => {
  it("refuses a hosted development target without --confirm-ref", () => {
    const msg = refusal(() => guard(hostedEnv(DEV)));
    expect(msg).toMatch(/--confirm-ref abcdefghijklmnopqrst/);
    expect(msg).toMatch(/never sufficient/);
  });

  it("refuses a confirmation that names another project", () => {
    expect(refusal(() => guard(hostedEnv(DEV), { confirmRef: OTHER }))).toMatch(
      /does not match/,
    );
  });

  it("refuses --confirm-ref when the target is actually local (wrong shell?)", () => {
    expect(() => guard(localEnv(), { confirmRef: DEV })).toThrow(/local stack/);
  });

  it("refuses --production for a non-production target", () => {
    expect(() =>
      guard(hostedEnv(DEV), {
        confirmRef: DEV,
        production: "explicit-opt-in",
        productionOptIn: true,
      }),
    ).toThrow(/not Production/);
  });

  it.each([
    ["no flags", {}],
    ["only --production", { productionOptIn: true }],
    ["only --confirm-ref", { confirmRef: PROD }],
  ])(
    "production under 'explicit-opt-in' still refuses with %s",
    (_why, extra) => {
      expect(() =>
        guard(hostedEnv(PROD), { production: "explicit-opt-in", ...extra }),
      ).toThrow(/PRODUCTION/);
    },
  );

  it("production under 'explicit-opt-in' needs BOTH --production and the exact ref", () => {
    expect(
      guard(hostedEnv(PROD), {
        production: "explicit-opt-in",
        productionOptIn: true,
        confirmRef: PROD,
      }),
    ).toMatchObject({ kind: "hosted", ref: PROD, production: true });
  });
});

describe("operator guard — valid targets", () => {
  it("accepts the local stack without confirmation", () => {
    expect(guard(localEnv())).toEqual({ kind: "local", host: "127.0.0.1" });
  });

  it("refuses local when a tool disallows it", () => {
    expect(() => guard(localEnv(), { allowLocal: false })).toThrow(/local/);
  });

  it("accepts the confirmed development project (pooler and direct forms, any letter case)", () => {
    const env = { ...hostedEnv(DEV), DIRECT_URL: direct(DEV) };
    expect(guard(env, { confirmRef: ` ${DEV.toUpperCase()} ` })).toMatchObject({
      kind: "hosted",
      ref: DEV,
      production: false,
    });
  });

  it("describes the target without credentials", () => {
    const t = guard(hostedEnv(DEV), { confirmRef: DEV });
    expect(describeTarget(t)).toContain(DEV);
    expect(describeTarget(t)).not.toContain(SECRET);
  });
});

describe("no credential ever appears in a refusal", () => {
  const cases: [string, () => unknown][] = [
    ["unconfirmed", () => guard(hostedEnv(DEV))],
    ["production", () => guard(hostedEnv(PROD), { confirmRef: PROD })],
    [
      "mismatch",
      () =>
        guard(
          { ...hostedEnv(DEV), DATABASE_URL: pooled(OTHER) },
          { confirmRef: DEV },
        ),
    ],
    [
      "unknown host",
      () =>
        guard(
          {
            ...hostedEnv(DEV),
            DIRECT_URL: `postgresql://u:${SECRET}@db.example.com/x`,
          },
          { confirmRef: DEV },
        ),
    ],
  ];
  it.each(cases)("%s", (_why, fn) => {
    const msg = refusal(fn);
    expect(msg).not.toContain(SECRET);
    expect(msg).not.toMatch(/postgres(ql)?:\/\//);
  });
});

describe("the real overload-dev project (vdxrmfadikwzodjljbdi)", () => {
  const OVERLOAD_DEV = "vdxrmfadikwzodjljbdi";
  const env = hostedEnv(OVERLOAD_DEV);

  it("is a valid ref and is not Production", () => {
    expect(isProductionRef(OVERLOAD_DEV)).toBe(false);
    expect(identifyDatabaseUrl(env.DATABASE_URL)).toMatchObject({
      kind: "supabase",
      ref: OVERLOAD_DEV,
    });
  });

  it("is refused without explicit confirmation, or with a host or another ref", () => {
    expect(() => guard(env)).toThrow(/--confirm-ref vdxrmfadikwzodjljbdi/);
    expect(() => guard(env, { confirmRef: POOLER_HOST })).toThrow(
      TargetRefused,
    );
    expect(() => guard(env, { confirmRef: PROD })).toThrow(TargetRefused);
  });

  it("is usable only after explicit confirmation AND its identity marker", async () => {
    const target = guard(env, { confirmRef: OVERLOAD_DEV });
    expect(target).toMatchObject({
      kind: "hosted",
      ref: OVERLOAD_DEV,
      production: false,
    });
    // Confirmed, but the connected database lacks / mismatches the marker: refused.
    await expect(verifyTargetMarker(target, async () => [])).rejects.toThrow(
      TargetRefused,
    );
    await expect(
      verifyTargetMarker(target, async () => [{ marker: targetMarker(PROD) }]),
    ).rejects.toThrow(TargetRefused);
    await expect(
      verifyTargetMarker(target, async () => [{ marker: targetMarker(DEV) }]),
    ).rejects.toThrow(TargetRefused);
    // Only the exact marker for this project verifies.
    await expect(
      verifyTargetMarker(target, async () => [
        { marker: targetMarker(OVERLOAD_DEV) },
      ]),
    ).resolves.toBe("verified");
  });

  it("can never be reached by a development tool while any variable names Production", () => {
    expect(() =>
      guard(
        { ...env, DIRECT_URL: pooled(PROD, 5432) },
        { confirmRef: OVERLOAD_DEV },
      ),
    ).toThrow(TargetRefused);
  });
});

describe("database identity marker", () => {
  const dev: VerifiedTarget = {
    kind: "hosted",
    ref: DEV,
    host: POOLER_HOST,
    production: false,
  };
  const rows = (marker: string | null) => async () => [{ marker }];

  it("is a read-only catalog query", () => {
    expect(TARGET_MARKER_SQL).toMatch(/^SELECT /);
    expect(TARGET_MARKER_SQL).not.toMatch(
      /insert|update|delete|create|comment|drop|alter/i,
    );
  });

  it("verifies the exact marker for the confirmed ref", async () => {
    await expect(
      verifyTargetMarker(dev, rows(targetMarker(DEV))),
    ).resolves.toBe("verified");
  });

  it("refuses when the marker is absent, and prints the one-time setup", async () => {
    await expect(verifyTargetMarker(dev, async () => [])).rejects.toThrow(
      targetMarkerSetupSql(DEV),
    );
    await expect(verifyTargetMarker(dev, rows(null))).rejects.toThrow(
      TargetRefused,
    );
  });

  it("refuses a marker for another project or one naming production", async () => {
    await expect(
      verifyTargetMarker(dev, rows(targetMarker(OTHER))),
    ).rejects.toThrow(/does not match/);
    await expect(
      verifyTargetMarker(dev, rows(targetMarker(PROD))),
    ).rejects.toThrow(/PRODUCTION/);
  });

  it("refuses when the marker cannot be read", async () => {
    await expect(
      verifyTargetMarker(dev, async () => {
        throw new Error(`connection to ${pooled(DEV)} failed`);
      }),
    ).rejects.toThrow(/could not read/);
  });

  it("never echoes the connection error (which may carry a URL)", async () => {
    try {
      await verifyTargetMarker(dev, async () => {
        throw new Error(`connection to ${pooled(DEV)} failed`);
      });
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
    }
  });

  it("needs no marker for the local stack or a deliberate production opt-in", async () => {
    const never = async () => {
      throw new Error("must not query");
    };
    await expect(
      verifyTargetMarker({ kind: "local", host: "127.0.0.1" }, never),
    ).resolves.toBe("not-required");
    await expect(
      verifyTargetMarker(
        { kind: "hosted", ref: PROD, host: POOLER_HOST, production: true },
        never,
      ),
    ).resolves.toBe("not-required");
  });
});
