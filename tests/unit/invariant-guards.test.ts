import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/**
 * The account-deletion module (Accounts, Pitch 9): the ONE sanctioned
 * destroyer of logged history (CLAUDE.md). Every "never deleted" guard below
 * exempts exactly this file, and only for deletes.
 */
const ACCOUNT_DELETION = "src/lib/accounts/deletion.ts";
const relPath = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
const notDeletion = (f: string) => relPath(f) !== ACCOUNT_DELETION;

describe("logged-history write guard", () => {
  it("has no LoggedSet write outside lib/logging/logged-sets.ts", () => {
    const offenders: string[] = [];
    // Any receiver: the raw client, account.db, or a (scoped) transaction.
    const writeRe =
      /\.\s*loggedSet\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany)\b/;
    const createOrUpdateRe =
      /\.\s*loggedSet\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert)\b/;
    for (const file of walk(SRC)) {
      const rel = relPath(file);
      if (rel === "src/lib/logging/logged-sets.ts") continue;
      const contents = fs.readFileSync(file, "utf8");
      // Account deletion may DELETE logged sets — never create or alter one.
      const re = rel === ACCOUNT_DELETION ? createOrUpdateRe : writeRe;
      if (re.test(contents)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("account deletion deletes only through the account-scoped client, in one transaction", () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, ACCOUNT_DELETION), "utf8");
    // No raw client, no raw SQL, no single-row deletes: only scoped deleteMany.
    expect(src).not.toMatch(/@\/lib\/db["']|\$executeRaw|\$queryRaw/);
    expect(src).not.toMatch(/\.\s*delete\s*\(/);
    expect(src).toMatch(/account\.db\.\$transaction\(/);
    // It only ever deletes: no create, update, or upsert of any model.
    expect(src).not.toMatch(
      /\.\s*(create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert)\s*\(/,
    );
  });

  it("no code outside the deletion module deletes a Profile or any logged-history row", () => {
    // (Plan authoring deleting a draft session/slot/planned cardio, and the
    // library un-starring a favorite, are their own reviewed paths.)
    const del =
      /\.\s*(profile|loggedExercise|loggedSession|missedDayResolution|gymExerciseBaseline|mesocycle)\s*\.\s*(delete|deleteMany)\s*\(/;
    const offenders = walk(SRC)
      .filter(notDeletion)
      .filter((f) => del.test(fs.readFileSync(f, "utf8")))
      .map(relPath);
    expect(offenders).toEqual([]);
  });
});

describe("progression is derived, never stored (Progressive Overload Engine)", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
  const read = (f: string) => fs.readFileSync(f, "utf8");
  const PROGRESSION = path.join(SRC, "lib", "progression");

  it("schema.prisma declares no progression-tag / e1RM / recommendation column", () => {
    // Strip comment lines first — the schema legitimately *mentions* these names
    // in comments ("No progressionTag column and no e1RM column").
    const schema = read(path.join(REPO_ROOT, "prisma", "schema.prisma"))
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
    expect(schema).not.toMatch(
      /progressionTag|needsDeload|isStalled|latestE1rm|nextWeight|suggestedWeight/i,
    );
    expect(schema).not.toMatch(/\be1rm\b|one_rep_max|estimated_one_rep_max/i);
    // No new progression/trend table.
    expect(schema).not.toMatch(
      /model\s+(Progression|Trend|E1rm|ReactiveTag)\b/i,
    );
  });

  it("defines estimateOneRepMax exactly once (no second e1RM formula)", () => {
    const defs = walk(SRC).filter((f) =>
      /export function estimateOneRepMax/.test(read(f)),
    );
    expect(defs.map(rel)).toEqual(["src/lib/progression/e1rm.ts"]);
    // No Epley arithmetic (`reps / 30`) anywhere else.
    const epley = walk(SRC)
      .filter((f) => rel(f) !== "src/lib/progression/e1rm.ts")
      .filter((f) => /\breps\s*\/\s*30\b/.test(read(f)));
    expect(epley.map(rel)).toEqual([]);
  });

  it("the e1RM module has no Prisma/React/chart/server-only import (Goals reuse)", () => {
    const src = read(path.join(PROGRESSION, "e1rm.ts"));
    expect(src).not.toMatch(
      /from\s+["'](@prisma\/client|react|recharts|@\/lib\/db|server-only)/,
    );
  });

  it("progression modules never write the database (engine is read-only)", () => {
    if (!fs.existsSync(PROGRESSION)) return;
    const writeRe =
      /\b(prisma|tx|t)\s*\.\s*\w+\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const baselineWrite =
      /gymExerciseBaseline\s*\.\s*(create|update|upsert|delete)/;
    const offenders = walk(PROGRESSION).filter((f) => {
      const src = read(f);
      return writeRe.test(src) || baselineWrite.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("introduces no cron / scheduler / queue dependency", () => {
    const pkg = JSON.parse(read(path.join(REPO_ROOT, "package.json")));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const banned = [
      "cron",
      "node-cron",
      "node-schedule",
      "bullmq",
      "bull",
      "bee-queue",
      "agenda",
      "@vercel/cron",
    ];
    expect(banned.filter((b) => b in deps)).toEqual([]);
  });
});

describe("exercise and gym write guards (Library & Gyms Setup)", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");

  it("never hard-deletes an Exercise or Gym outside the account-deletion module", () => {
    const hardDelete = /\.\s*(exercise|gym)\s*\.\s*(delete|deleteMany)\s*\(/;
    const offenders = walk(SRC)
      .filter(notDeletion)
      .filter((f) => hardDelete.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("writes Exercise rows only through src/lib/exercises/exercises.ts", () => {
    const write =
      /\.\s*exercise\s*\.\s*(create|createMany|update|updateMany|upsert)\s*\(/;
    const offenders = walk(SRC)
      .filter((f) => rel(f) !== "src/lib/exercises/exercises.ts")
      .filter((f) => write.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe("secret hygiene", () => {
  const dbSecretRe =
    /NEXT_PUBLIC_[A-Z0-9_]*(DATABASE_URL|DIRECT_URL|SERVICE_ROLE|SERVICE_KEY|INVITE|SMTP|SECRET)/;

  it("references no NEXT_PUBLIC_ database/service-role secret in source", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const contents = fs.readFileSync(file, "utf8");
      if (dbSecretRe.test(contents))
        offenders.push(path.relative(REPO_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it("the .env.example never prefixes a DB/service-role secret with NEXT_PUBLIC_", () => {
    const envExample = fs.readFileSync(
      path.join(REPO_ROOT, ".env.example"),
      "utf8",
    );
    expect(dbSecretRe.test(envExample)).toBe(false);
  });
});

describe("seed imports the exercise catalog only (spec D37)", () => {
  // Library & Gyms Setup introduces the seed (CLAUDE.md: free-exercise-db is
  // "imported once by a Prisma seed script"). Foundation's intent — no demo or
  // training data — is preserved: the seed writes Exercise rows (and Storage
  // objects) only, and never user preference or archive state.
  const seedFiles = [
    path.join(REPO_ROOT, "prisma", "seed.ts"),
    ...walk(path.join(REPO_ROOT, "prisma", "seed")),
  ];

  it("the seed entry point and its modules exist", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "prisma", "seed.ts"))).toBe(true);
    expect(seedFiles.length).toBeGreaterThan(1);
  });

  it("writes no model other than Exercise", () => {
    const otherWrite =
      /\.\s*(mesocycle|session|sessionExercise|gym|gymExerciseBaseline|loggedSession|loggedExercise|loggedSet|goal|cardioLog)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const offenders = seedFiles.filter((f) =>
      otherWrite.test(fs.readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("never deletes exercises and never writes favorites or archive state", () => {
    for (const f of seedFiles) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).not.toMatch(/exercise\s*\.\s*(delete|deleteMany|upsert)\b/);
      expect(src).not.toMatch(/isFavorite\s*:/);
      expect(src).not.toMatch(/deletedAt\s*:/);
      expect(src).not.toMatch(/isCustom\s*:\s*true/);
    }
  });
});

describe("free-exercise-db is an ingest dependency, never a runtime one", () => {
  it("no application source references the source dataset or its host", () => {
    const offenders = walk(SRC).filter((f) =>
      /raw\.githubusercontent|yuhonas|from\s+["'][^"']*(prisma\/seed|exercises\.json)/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(offenders.map((f) => path.relative(REPO_ROOT, f))).toEqual([]);
  });

  it("only the auth-admin facade references the service-role key (Accounts R4)", () => {
    // Library & Gyms kept the key out of src/ entirely. Accounts needs it on
    // the server for exactly two auth operations (create a signed-up user,
    // delete an account's identity), so it is allowed in ONE server-only file.
    const offenders = walk(SRC)
      .filter((f) =>
        /SUPABASE_SERVICE_ROLE_KEY|service_role|serviceRole/.test(
          fs.readFileSync(f, "utf8"),
        ),
      )
      .map((f) => path.relative(REPO_ROOT, f).replace(/\\/g, "/"));
    expect(offenders).toEqual(["src/lib/supabase/admin.ts"]);
  });
});

describe("accounts: secrets and sanctioned capabilities (Accounts spec §14.7)", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
  const read = (f: string) => fs.readFileSync(f, "utf8");
  const ADMIN = "src/lib/supabase/admin.ts";
  const GATE = "src/lib/accounts/signup-gate.ts";
  const USERNAMES = "src/lib/data/usernames.ts";

  it("the admin facade, the signup switch, and the username check are server-only modules", () => {
    for (const file of [ADMIN, GATE, USERNAMES]) {
      expect([file, read(path.join(REPO_ROOT, file))]).toEqual([
        file,
        expect.stringMatching(/^import "server-only";/),
      ]);
    }
  });

  it("the admin facade is imported only by signup and account deletion", () => {
    const importers = walk(SRC)
      .filter((f) => /["']@\/lib\/supabase\/admin["']/.test(read(f)))
      .map(rel)
      .sort();
    for (const file of importers) {
      expect([
        "src/lib/accounts/deletion.ts",
        "src/lib/accounts/signup.ts",
      ]).toContain(file);
    }
    expect(importers).toContain("src/lib/accounts/signup.ts");
  });

  it("only the signup gate reads the signup switch (OVE-50)", () => {
    const readers = walk(SRC)
      .filter((f) => /OVERLOAD_SIGNUP_OPEN/.test(read(f)))
      .map(rel);
    expect(readers).toEqual([GATE]);
  });

  it("the invite gate is gone: nothing reads an invite code", () => {
    const readers = walk(SRC)
      .filter((f) => /OVERLOAD_INVITE_CODE|inviteCode/.test(read(f)))
      .map(rel);
    expect(readers).toEqual([]);
  });

  it("only signup asks whether a username is free (the one cross-account question)", () => {
    const callers = walk(SRC)
      .filter((f) => rel(f) !== USERNAMES)
      .filter((f) =>
        /isUsernameAvailable|@\/lib\/data\/usernames/.test(read(f)),
      )
      .map(rel);
    expect(callers).toEqual(["src/lib/accounts/signup.ts"]);
  });

  it("only signup establishes a new account's profile", () => {
    const callers = walk(SRC)
      .filter((f) => !rel(f).startsWith("src/lib/data/"))
      .filter((f) => /\bestablishProfile\b/.test(read(f)))
      .map(rel);
    expect(callers).toEqual(["src/lib/accounts/signup.ts"]);
  });

  it("no client component imports the admin facade or the signup gate", () => {
    const offenders = walk(SRC)
      .filter((f) => /^["']use client["']/m.test(read(f)))
      .filter((f) =>
        /@\/lib\/(supabase\/admin|accounts\/(signup-gate|signup|deletion))["']/.test(
          read(f).replace(/import type[^;]+;/g, ""),
        ),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("no seed data in migrations", () => {
  it("the initial migration contains no INSERT (no seeding during migrate)", () => {
    const migration = fs.readFileSync(
      path.join(REPO_ROOT, "prisma", "migrations", "0_init", "migration.sql"),
      "utf8",
    );
    expect(/\bINSERT\s+INTO\b/i.test(migration)).toBe(false);
  });
});

describe("migration safety (every migration after 0_init)", () => {
  const migrationsDir = path.join(REPO_ROOT, "prisma", "migrations");
  const later = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "0_init")
    .map((d) => ({
      name: d.name,
      sql: fs
        .readFileSync(path.join(migrationsDir, d.name, "migration.sql"), "utf8")
        // Ignore comment lines; only executable SQL matters.
        .replace(/^\s*--.*$/gm, ""),
    }));

  it("finds every migration after 0_init", () => {
    expect(later.map((m) => m.name)).toEqual(
      expect.arrayContaining([
        "1_library_gyms_setup",
        "2_mesocycle_draft_status",
        "3_split_mesocycle_builder",
      ]),
    );
  });

  it.each(later.map((m) => [m.name, m.sql]))(
    "%s drops/renames nothing, inserts nothing, cascades nothing, and adds no RLS policy",
    (_name, sql) => {
      expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA)\b/i);
      expect(sql).not.toMatch(/\bRENAME\b/i);
      expect(sql).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(sql).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(sql).not.toMatch(/ON\s+DELETE\s+CASCADE/i);
      expect(sql).not.toMatch(/\bCREATE\s+POLICY\b/i);
      expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    },
  );

  it.each(later.map((m) => [m.name, m.sql]))(
    "%s enables RLS on every table it creates",
    (_name, sql) => {
      const created = [...sql.matchAll(/CREATE\s+TABLE\s+"([^"]+)"/gi)].map(
        (m) => m[1],
      );
      for (const table of created) {
        expect(sql).toMatch(
          new RegExp(
            `ALTER\\s+TABLE\\s+"${table}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
            "i",
          ),
        );
      }
    },
  );
});

describe("goals measure, never program (Goals, Pitch 6)", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
  const read = (f: string) => fs.readFileSync(f, "utf8");
  const GOALS = path.join(SRC, "lib", "goals");
  const goalModel = () => {
    const schema = read(path.join(REPO_ROOT, "prisma", "schema.prisma"))
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l) && !/^\s*\/\/\//.test(l))
      .join("\n");
    const start = schema.indexOf("model Goal {");
    return schema.slice(start, schema.indexOf("\n}", start));
  };

  it("writes Goal rows only in src/lib/goals/goals.ts", () => {
    const write =
      /\.\s*goal\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const offenders = walk(SRC)
      .filter((f) => rel(f) !== "src/lib/goals/goals.ts")
      .filter(notDeletion)
      .filter((f) => write.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("never deletes a goal outside account deletion (archive only)", () => {
    const del = /\.\s*goal\s*\.\s*(delete|deleteMany)\s*\(/;
    expect(
      walk(SRC)
        .filter(notDeletion)
        .filter((f) => del.test(read(f)))
        .map(rel),
    ).toEqual([]);
  });

  it("goal modules never write logged history, baselines, the plan, exercises, or gyms", () => {
    const write =
      /\.\s*(loggedSet|loggedExercise|loggedSession|gymExerciseBaseline|session|sessionExercise|mesocycle|exercise|gym|missedDayResolution|cardioLog)\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
    const goalCode = [
      ...walk(GOALS),
      ...walk(path.join(SRC, "app", "(app)", "goals")),
      ...walk(path.join(SRC, "components", "goals")),
    ];
    expect(goalCode.length).toBeGreaterThan(0);
    expect(goalCode.filter((f) => write.test(read(f))).map(rel)).toEqual([]);
  });

  it("goal progress never reads gym baselines (a baseline is not demonstrated strength)", () => {
    const offenders = walk(GOALS).filter((f) =>
      /gymExerciseBaseline|lib\/gyms\/baselines|currentWorkingWeight/.test(
        read(f),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("goal math reuses the canonical estimator and defines no formula of its own", () => {
    const progress = read(path.join(GOALS, "progress.ts"));
    expect(progress).toMatch(
      /import\s*\{[^}]*estimateOneRepMax[^}]*\}\s*from\s*["']@\/lib\/progression\/e1rm["']/,
    );
    for (const f of walk(GOALS)) {
      expect(read(f)).not.toMatch(
        /\breps\s*\/\s*30\b|\/\s*30\s*\)|1\s*\+\s*\w+\s*\/\s*30/,
      );
      expect(read(f)).not.toMatch(/function\s+estimateOneRepMax/);
    }
  });

  it("the Goal model stores target, context, and lifecycle only — no progress, e1RM, or date target", () => {
    const m = goalModel();
    expect(m).not.toBe("");
    expect(m).not.toMatch(
      /progress|percent|e1rm|oneRep|bestE1rm|currentE1rm|targetE1rm|targetDate|deadline|dueDate|dueOn|targetOn|pace/i,
    );
    expect(m).toMatch(/targetWeightLbs/);
    expect(m).toMatch(/targetReps/);
    expect(m).toMatch(/gymId/);
    expect(m).toMatch(/archiveReason/);
  });

  it("goal UI computes no goal math (DTOs arrive derived)", () => {
    const ui = [
      ...walk(path.join(SRC, "components", "goals")),
      ...walk(path.join(SRC, "app", "(app)", "goals")),
    ];
    const offenders = ui.filter((f) =>
      /estimateOneRepMax|sessionE1rm|computeGoalProgress|goalTargetE1rm/.test(
        read(f),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("goal code carries no dates, pacing, feasibility, gamification, or cardio", () => {
    const goalCode = [
      ...walk(GOALS),
      ...walk(path.join(SRC, "app", "(app)", "goals")),
      ...walk(path.join(SRC, "components", "goals")),
    ];
    const forbidden =
      /deadline|due\s?date|target\s?date|targetOn|on track|behind pace|pacing|feasib|projected|confetti|streak|\bXP\b|achievement|level.?up|cardio/i;
    // Code and copy only — doc comments legitimately name what is excluded.
    const code = (f: string) =>
      read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    expect(goalCode.filter((f) => forbidden.test(code(f))).map(rel)).toEqual(
      [],
    );
  });

  it("no goal is ever created except by the lifter's create action", () => {
    // The only goal.create call is inside createGoal, which only the
    // createGoalAction server action calls — completion never spawns a goal.
    const creators = walk(SRC).filter((f) =>
      /\.\s*goal\s*\.\s*(create|createMany|upsert)\s*\(/.test(read(f)),
    );
    expect(creators.map(rel)).toEqual(["src/lib/goals/goals.ts"]);
    const callers = walk(SRC).filter(
      (f) =>
        rel(f) !== "src/lib/goals/goals.ts" && /\bcreateGoal\(/.test(read(f)),
    );
    expect(callers.map(rel)).toEqual(["src/app/(app)/goals/actions.ts"]);
  });

  it("adds no gamification, notification, or scheduling dependency", () => {
    const pkg = JSON.parse(read(path.join(REPO_ROOT, "package.json")));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(
      deps.filter((d) =>
        /confetti|canvas-confetti|party|fireworks|howler|use-sound|web-push|novu|onesignal|cron|schedule/i.test(
          d,
        ),
      ),
    ).toEqual([]);
  });
});

describe("cardio is recorded, never interpreted (Cardio Logging, Pitch 7)", () => {
  const rel = (f: string) => path.relative(REPO_ROOT, f).replace(/\\/g, "/");
  const read = (f: string) => fs.readFileSync(f, "utf8");
  const schemaModel = (name: string) => {
    const schema = read(path.join(REPO_ROOT, "prisma", "schema.prisma"))
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l))
      .join("\n");
    const start = schema.indexOf(`model ${name} {`);
    return start < 0 ? "" : schema.slice(start, schema.indexOf("\n}", start));
  };

  it("never deletes a cardio log outside account deletion (correction only, R33)", () => {
    const del = /\.\s*cardioLog\s*\.\s*(delete|deleteMany)\s*\(/;
    expect(
      walk(SRC)
        .filter(notDeletion)
        .filter((f) => del.test(read(f)))
        .map(rel),
    ).toEqual([]);
  });

  it("cardio models hold type + minutes only — no metric, gym, tag, or e1RM column", () => {
    for (const name of ["PlannedCardio", "CardioLog"]) {
      const m = schemaModel(name);
      expect(m).not.toBe("");
      expect(m).toMatch(/\btype\b/);
      expect(m).toMatch(/durationMin/);
      expect(m).not.toMatch(
        /distance|pace|speed|incline|resistance|watt|calor|heart|\bhr\b|zone|cadence|step|elevation|gps|route|latitude|longitude|rpe|rir|note|gym|exercise|session|tag|progress|deload|e1rm|trend|goal|streak/i,
      );
    }
  });

  it("planned cardio belongs to the day, never to a Session or SessionExercise", () => {
    expect(schemaModel("PlannedCardio")).not.toMatch(/sessionId|\bSession\b/);
    expect(schemaModel("SessionExercise")).not.toMatch(/cardio/i);
    expect(schemaModel("Session")).not.toMatch(/cardio/i);
  });

  it("cardio code never reaches progression, e1RM, goals, gym baselines, or strength history", () => {
    const cardioCode = [
      ...walk(path.join(SRC, "lib", "cardio")),
      ...walk(path.join(SRC, "components", "cardio")),
    ];
    expect(cardioCode.length).toBeGreaterThan(3);
    const forbidden =
      /estimateOneRepMax|sessionE1rm|lib\/progression|lib\/goals|reconcileGoal|isGymVariable|gymExerciseBaseline|lib\/gyms|\bloggedSet\b|\.loggedSet\b|\.loggedExercise\b|\.sessionExercise\b|\.exercise\s*\.|\.goal\s*\./;
    const code = (f: string) =>
      read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    expect(cardioCode.filter((f) => forbidden.test(code(f))).map(rel)).toEqual(
      [],
    );
  });

  it("the strength engine and goals never know cardio exists (R42–R45)", () => {
    const strength = [
      ...walk(path.join(SRC, "lib", "progression")),
      ...walk(path.join(SRC, "components", "progression")),
      ...walk(path.join(SRC, "lib", "goals")),
      ...walk(path.join(SRC, "lib", "gyms")),
      path.join(SRC, "lib", "logging", "logged-sets.ts"),
      path.join(SRC, "lib", "logging", "schedule.ts"),
      path.join(SRC, "lib", "logging", "missed-days.ts"),
    ];
    expect(strength.filter((f) => /cardio/i.test(read(f))).map(rel)).toEqual(
      [],
    );
  });

  it("writes cardio logs only in the cardio write module", () => {
    const write =
      /\.\s*cardioLog\s*\.\s*(create|createMany|update|updateMany|upsert)\s*\(/;
    expect(
      walk(SRC)
        .filter((f) => write.test(read(f)))
        .map(rel),
    ).toEqual(["src/lib/cardio/cardio-logs.ts"]);
  });

  it("adds no timer, health, wearable, or GPS dependency", () => {
    const pkg = JSON.parse(read(path.join(REPO_ROOT, "package.json")));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(
      deps.filter((d) =>
        /healthkit|apple-?health|strava|garmin|fitbit|wearable|stopwatch|timer|geolocation|gps/i.test(
          d,
        ),
      ),
    ).toEqual([]);
  });
});
