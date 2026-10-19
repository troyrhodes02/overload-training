/**
 * Multi-User Foundation — Stage 2: ASSIGN (spec §11 "Operator: ownership
 * backfill", R15, R16). Operator tooling: never imported by `src/`, no route,
 * no browser surface.
 *
 * Assigns every pre-ownership row to ONE explicitly named account, after
 * migration 9_account_ownership_expand and before 10_account_ownership_enforce:
 *   - creates that account's profile with the operator-supplied IANA zone,
 *   - sets user_id on every unowned row of every owned table (and on custom
 *     exercises; library exercises stay ownerless),
 *   - copies the legacy exercises.is_favorite flags into exercise_favorites.
 *
 * Preservation rules (CLAUDE.md → Operator tasks): the account is named by
 * email and confirmed before anything is written; the dry run changes
 * nothing; execution is one transaction; nothing is deleted, overwritten, or
 * merged — the only values written are the new owner column and the two new
 * tables. Before committing, every table's row count AND a checksum of every
 * row's values (excluding user_id) must be identical to before, or the whole
 * transaction rolls back.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { isValidTimeZone } from "@/lib/plan/calendar";

export const EXPAND_MIGRATION = "9_account_ownership_expand";
export const ENFORCE_MIGRATION = "10_account_ownership_enforce";

/**
 * Every owned table that existed before ownership (everything that can hold
 * legacy rows). `exercises` is handled separately (custom rows only); the two
 * tables created by migration 9 start empty. A unit test keeps this list in
 * lockstep with the schema.
 */
export const LEGACY_OWNED_TABLES = [
  "mesocycles",
  "sessions",
  "session_exercises",
  "gyms",
  "gym_exercise_baselines",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "missed_day_resolutions",
  "goals",
  "planned_cardio",
  "cardio_logs",
] as const;

/** Tables whose rows must be value-identical before and after. */
export const PRESERVED_TABLES = [...LEGACY_OWNED_TABLES, "exercises"] as const;

type Raw = Pick<PrismaClient, "$queryRawUnsafe" | "$executeRawUnsafe">;
type RawTx = Pick<
  Prisma.TransactionClient,
  "$queryRawUnsafe" | "$executeRawUnsafe"
>;

export type BackfillInput = { email: string; timeZone: string };

export type TableReport = {
  total: number;
  unowned: number;
  ownedByOther: number;
};

export type BackfillPlan = {
  /** Every reason the backfill must not run. Empty ⇒ safe to execute. */
  refusals: string[];
  account: { userId: string; email: string } | null;
  authUserCount: number;
  timeZone: string;
  profile: "create" | "exists" | "exists-other-zone";
  tables: Record<(typeof LEGACY_OWNED_TABLES)[number], TableReport>;
  customExercises: TableReport;
  library: { total: number; archived: number; owned: number };
  favoritesToCopy: number;
  otherProfiles: number;
};

export type BackfillResult = {
  plan: BackfillPlan;
  before: Record<string, { count: number; checksum: string }>;
  after: Record<string, { count: number; checksum: string }>;
  assigned: Record<string, number>;
  favoritesCopied: number;
  profileCreated: boolean;
};

export class BackfillRefused extends Error {
  constructor(readonly refusals: string[]) {
    super(`Ownership backfill refused:\n  - ${refusals.join("\n  - ")}`);
    this.name = "BackfillRefused";
  }
}

function n(value: unknown): number {
  return Number(value ?? 0);
}

async function scalar(db: Raw | RawTx, sql: string, ...params: unknown[]) {
  const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
    sql,
    ...params,
  );
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

async function appliedMigrations(db: Raw | RawTx): Promise<Set<string>> {
  const exists = await scalar(
    db,
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL`,
  );
  if (!exists) return new Set();
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  return new Set(rows.map((r) => r.migration_name));
}

/** Read-only. Everything the operator needs to decide, and every refusal. */
export async function planOwnershipBackfill(
  db: Raw | RawTx,
  input: BackfillInput,
): Promise<BackfillPlan> {
  const refusals: string[] = [];
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!email) refusals.push("No target account email was given (--email).");
  if (!isValidTimeZone(input.timeZone)) {
    refusals.push(
      `"${String(input.timeZone)}" is not a valid IANA timezone (--time-zone, e.g. America/Chicago).`,
    );
  }

  const applied = await appliedMigrations(db);
  if (!applied.has(EXPAND_MIGRATION)) {
    refusals.push(
      `Migration ${EXPAND_MIGRATION} is not applied; apply Stage 1 first.`,
    );
  }
  if (applied.has(ENFORCE_MIGRATION)) {
    refusals.push(
      `Migration ${ENFORCE_MIGRATION} is already applied; there is nothing to backfill.`,
    );
  }

  let account: BackfillPlan["account"] = null;
  let authUserCount = 0;
  const hasAuth = await scalar(
    db,
    `SELECT to_regclass('auth.users') IS NOT NULL`,
  );
  if (!hasAuth) {
    refusals.push(
      "auth.users does not exist: this is not a Supabase database.",
    );
  } else {
    authUserCount = n(await scalar(db, `SELECT count(*)::int FROM auth.users`));
    if (email) {
      const matches = await db.$queryRawUnsafe<{ id: string; email: string }[]>(
        `SELECT id::text AS id, email::text AS email FROM auth.users
          WHERE lower(email) = lower($1)`,
        email,
      );
      if (matches.length !== 1) {
        refusals.push(
          matches.length === 0
            ? `No account has the email ${email}.`
            : `More than one account matches ${email}.`,
        );
      } else {
        account = { userId: matches[0].id, email: matches[0].email };
      }
    }
    if (authUserCount !== 1) {
      refusals.push(
        `Expected exactly one account in auth.users (the original single-user account), found ${authUserCount}. ` +
          "Pre-ownership rows can only be attributed safely while one account exists.",
      );
    }
  }

  const empty = (): TableReport => ({ total: 0, unowned: 0, ownedByOther: 0 });
  const tables = Object.fromEntries(
    LEGACY_OWNED_TABLES.map((t) => [t, empty()]),
  ) as BackfillPlan["tables"];
  let customExercises = empty();
  const library = { total: 0, archived: 0, owned: 0 };
  let favoritesToCopy = 0;
  let profile: BackfillPlan["profile"] = "create";
  let otherProfiles = 0;

  if (applied.has(EXPAND_MIGRATION)) {
    const owner = account?.userId ?? null;
    for (const table of LEGACY_OWNED_TABLES) {
      const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE user_id IS NULL)::int AS unowned,
                count(*) FILTER (WHERE user_id IS NOT NULL
                                   AND user_id IS DISTINCT FROM $1::uuid)::int AS other
           FROM "${table}"`,
        owner,
      );
      tables[table] = {
        total: n(rows[0].total),
        unowned: n(rows[0].unowned),
        ownedByOther: n(rows[0].other),
      };
    }
    const ex = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT count(*) FILTER (WHERE is_custom)::int AS custom_total,
              count(*) FILTER (WHERE is_custom AND user_id IS NULL)::int AS custom_unowned,
              count(*) FILTER (WHERE is_custom AND user_id IS NOT NULL
                                 AND user_id IS DISTINCT FROM $1::uuid)::int AS custom_other,
              count(*) FILTER (WHERE NOT is_custom)::int AS lib_total,
              count(*) FILTER (WHERE NOT is_custom AND deleted_at IS NOT NULL)::int AS lib_archived,
              count(*) FILTER (WHERE NOT is_custom AND user_id IS NOT NULL)::int AS lib_owned,
              count(*) FILTER (WHERE is_favorite)::int AS favorites
         FROM "exercises"`,
      owner,
    );
    customExercises = {
      total: n(ex[0].custom_total),
      unowned: n(ex[0].custom_unowned),
      ownedByOther: n(ex[0].custom_other),
    };
    library.total = n(ex[0].lib_total);
    library.archived = n(ex[0].lib_archived);
    library.owned = n(ex[0].lib_owned);
    favoritesToCopy = n(
      await scalar(
        db,
        `SELECT count(*)::int FROM "exercises" e
          WHERE e.is_favorite
            AND NOT EXISTS (SELECT 1 FROM "exercise_favorites" f
                             WHERE f.exercise_id = e.id AND f.user_id = $1::uuid)`,
        owner,
      ),
    );

    otherProfiles = n(
      await scalar(
        db,
        `SELECT count(*)::int FROM "profiles" WHERE user_id IS DISTINCT FROM $1::uuid`,
        owner,
      ),
    );
    if (owner) {
      const zone = await scalar(
        db,
        `SELECT time_zone FROM "profiles" WHERE user_id = $1::uuid`,
        owner,
      );
      if (zone !== undefined) {
        profile = zone === input.timeZone ? "exists" : "exists-other-zone";
      }
    }

    const foreign = LEGACY_OWNED_TABLES.filter(
      (t) => tables[t].ownedByOther > 0,
    );
    if (foreign.length > 0 || customExercises.ownedByOther > 0) {
      refusals.push(
        `Some rows already belong to a different account (${[
          ...foreign,
          ...(customExercises.ownedByOther > 0 ? ["exercises"] : []),
        ].join(", ")}); this database is not a pre-ownership database.`,
      );
    }
    if (library.owned > 0) {
      refusals.push(
        `${library.owned} library exercise(s) have an owner; library rows must stay shared.`,
      );
    }
    if (otherProfiles > 0) {
      refusals.push(
        `${otherProfiles} profile(s) for other accounts already exist; refusing to guess the owner of legacy rows.`,
      );
    }
    if (profile === "exists-other-zone") {
      refusals.push(
        "The account already has a profile with a different timezone; refusing to overwrite it.",
      );
    }
  }

  return {
    refusals,
    account,
    authUserCount,
    timeZone: input.timeZone,
    profile,
    tables,
    customExercises,
    library,
    favoritesToCopy,
    otherProfiles,
  };
}

/**
 * Row count and a checksum of every row's values EXCLUDING user_id, so the
 * only change the backfill may make — the owner column — is invisible to it.
 * Raw UPDATEs do not touch updated_at (Prisma sets it client-side), so the
 * checksum covers timestamps too.
 */
export async function tableFingerprints(
  db: Raw | RawTx,
): Promise<Record<string, { count: number; checksum: string }>> {
  const out: Record<string, { count: number; checksum: string }> = {};
  for (const table of PRESERVED_TABLES) {
    const rows = await db.$queryRawUnsafe<
      { count: number; checksum: string }[]
    >(
      `SELECT count(*)::int AS count,
              md5(coalesce(string_agg((to_jsonb(t) - 'user_id')::text, '|'
                                      ORDER BY t.id), '')) AS checksum
         FROM "${table}" t`,
    );
    out[table] = { count: n(rows[0].count), checksum: rows[0].checksum };
  }
  return out;
}

/**
 * Executes the backfill in ONE transaction. Re-plans inside the transaction
 * (so nothing changed between the dry run and now), writes, verifies, and
 * commits only if every check holds. Idempotent: with nothing left to assign
 * it changes nothing.
 */
export async function executeOwnershipBackfill(
  db: PrismaClient,
  input: BackfillInput,
): Promise<BackfillResult> {
  return db.$transaction(
    async (tx) => {
      const plan = await planOwnershipBackfill(tx, input);
      if (plan.refusals.length > 0 || !plan.account) {
        throw new BackfillRefused(
          plan.refusals.length > 0
            ? plan.refusals
            : ["No target account resolved."],
        );
      }
      const owner = plan.account.userId;
      const before = await tableFingerprints(tx);

      let profileCreated = false;
      if (plan.profile === "create") {
        await tx.$executeRawUnsafe(
          `INSERT INTO "profiles" (user_id, time_zone, created_at, updated_at)
           VALUES ($1::uuid, $2, now(), now())`,
          owner,
          input.timeZone,
        );
        profileCreated = true;
      }

      const assigned: Record<string, number> = {};
      for (const table of LEGACY_OWNED_TABLES) {
        assigned[table] = await tx.$executeRawUnsafe(
          `UPDATE "${table}" SET user_id = $1::uuid WHERE user_id IS NULL`,
          owner,
        );
      }
      assigned.exercises = await tx.$executeRawUnsafe(
        `UPDATE "exercises" SET user_id = $1::uuid
          WHERE is_custom AND user_id IS NULL`,
        owner,
      );
      const favoritesCopied = await tx.$executeRawUnsafe(
        `INSERT INTO "exercise_favorites" (user_id, exercise_id, created_at)
         SELECT $1::uuid, e.id, now() FROM "exercises" e
          WHERE e.is_favorite
         ON CONFLICT (user_id, exercise_id) DO NOTHING`,
        owner,
      );

      const after = await tableFingerprints(tx);
      const problems: string[] = [];
      for (const table of PRESERVED_TABLES) {
        if (before[table].count !== after[table].count) {
          problems.push(
            `${table}: row count changed ${before[table].count} → ${after[table].count}`,
          );
        }
        if (before[table].checksum !== after[table].checksum) {
          problems.push(`${table}: row values changed`);
        }
      }
      const verify = await planOwnershipBackfill(tx, input);
      for (const table of LEGACY_OWNED_TABLES) {
        if (verify.tables[table].unowned !== 0) {
          problems.push(
            `${table}: ${verify.tables[table].unowned} row(s) still unowned`,
          );
        }
      }
      if (verify.customExercises.unowned !== 0) {
        problems.push("exercises: custom exercise(s) still unowned");
      }
      if (verify.library.owned !== 0) {
        problems.push("exercises: a library exercise was given an owner");
      }
      if (verify.favoritesToCopy !== 0) {
        problems.push("exercise_favorites: favorites not fully copied");
      }
      if (verify.profile !== "exists") {
        problems.push("profiles: the account's profile is missing or wrong");
      }
      if (problems.length > 0) {
        // Throwing rolls the whole transaction back: nothing is left partial.
        throw new BackfillRefused(problems);
      }

      return {
        plan,
        before,
        after,
        assigned,
        favoritesCopied,
        profileCreated,
      };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
}

/** Human-readable dry-run report (no secrets: host and counts only). */
export function formatPlan(plan: BackfillPlan, host: string): string {
  const lines = [
    `Target database host : ${host}`,
    `Target account       : ${
      plan.account
        ? `${plan.account.email} → account ${plan.account.userId} (${plan.authUserCount} account(s) in auth)`
        : `(not resolved; ${plan.authUserCount} account(s) in auth)`
    }`,
    `Profile timezone     : ${plan.timeZone} (${plan.profile})`,
    "",
    "Rows without an owner (will be assigned to this account):",
  ];
  for (const [table, r] of Object.entries(plan.tables)) {
    lines.push(
      `  ${table.padEnd(24)} ${String(r.unowned).padStart(7)} of ${r.total}`,
    );
  }
  lines.push(
    `  ${"custom exercises".padEnd(24)} ${String(plan.customExercises.unowned).padStart(7)} of ${plan.customExercises.total}`,
    `  ${"favorites to copy".padEnd(24)} ${String(plan.favoritesToCopy).padStart(7)}`,
    `Library exercises (stay shared, unchanged): ${plan.library.total} (archived: ${plan.library.archived})`,
  );
  if (plan.refusals.length > 0) {
    lines.push("", "REFUSED:", ...plan.refusals.map((r) => `  - ${r}`));
  }
  return lines.join("\n");
}
