/**
 * Operator target-identity guard (OVE-111). Every operator tool that connects
 * to a database runs this BEFORE opening a connection.
 *
 * The problem it closes: remote writes used to be gated on `--confirm-host`,
 * but through Supabase's shared pooler, Production and the development project
 * have the SAME hostname (`aws-0-<region>.pooler.supabase.com`). A hostname is
 * therefore never accepted as confirmation. Identity comes from the project ref
 * (src/lib/env/supabase-identity.ts), and:
 *
 *  1. Every set DATABASE_URL / DIRECT_URL / NEXT_PUBLIC_SUPABASE_URL is
 *     identified, and they must all agree: all local, or all the SAME hosted
 *     project. Unknown, ambiguous, or mixed identities are refused.
 *  2. A hosted target must be cross-checked by two independent sources: a
 *     database URL AND NEXT_PUBLIC_SUPABASE_URL.
 *  3. A hosted target needs `--confirm-ref <ref>` naming exactly that project.
 *  4. Production (`ycxvdiklpefyhdclxyau`, or any variable merely mentioning
 *     it) is refused. Tools whose runbooks sanction a deliberate production
 *     run use policy "explicit-opt-in", which additionally requires
 *     `--production` AND `--confirm-ref <the production ref>`; development
 *     tools use "refuse" and have no production path at all.
 *  5. A hosted non-production target must carry the database identity marker
 *     (verifyTargetMarker) — proof read from the connected database itself,
 *     independent of how the URLs parse.
 *
 * Messages carry variable names, project refs, and hostnames only — never a
 * connection string, password, or key.
 */
import {
  PRODUCTION_PROJECT_REFS,
  identifyDatabaseUrl,
  identifySupabaseUrl,
  isProductionRef,
  mentionsProductionRef,
  type TargetIdentity,
} from "../../src/lib/env/supabase-identity";

export { PRODUCTION_PROJECT_REFS };

/** Variables that are identified and must agree with each other. */
export const COMPARED_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;
export type TargetVar = (typeof COMPARED_VARS)[number];

/** Further names screened for a Production ref (never used to connect). */
export const SCREENED_VARS = [
  "SUPABASE_URL",
  "DEMO_SUPABASE_URL",
  "DEMO_APP_URL",
] as const;

const DATABASE_VARS = new Set<string>(["DATABASE_URL", "DIRECT_URL"]);

export type ProductionPolicy = "refuse" | "explicit-opt-in";

export type OperatorTargetOptions = {
  env: Record<string, string | undefined>;
  /** The variables this tool connects with; each must be set. */
  uses: readonly TargetVar[];
  /** The tool's `--confirm-ref` value. */
  confirmRef?: string;
  /** Default "refuse": the tool has no production path. */
  production?: ProductionPolicy;
  /** The tool's `--production` flag (only meaningful with "explicit-opt-in"). */
  productionOptIn?: boolean;
  /** Default true: the local Supabase CLI stack needs no confirmation. */
  allowLocal?: boolean;
};

export type VerifiedTarget =
  | { kind: "local"; host: string }
  | { kind: "hosted"; ref: string; host: string; production: boolean };

export class TargetRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetRefused";
  }
}

const refuse = (message: string): never => {
  throw new TargetRefused(message);
};

const EXPORT_HINT =
  "Export DATABASE_URL, DIRECT_URL and NEXT_PUBLIC_SUPABASE_URL for the SAME project in this shell (values already exported win over .env).";

function identify(name: TargetVar, raw: string): TargetIdentity {
  return DATABASE_VARS.has(name)
    ? identifyDatabaseUrl(raw)
    : identifySupabaseUrl(raw);
}

/**
 * Decide whether this tool may connect to the configured target. Throws
 * TargetRefused (before any connection) unless every rule above holds.
 */
export function assertOperatorTarget(
  opts: OperatorTargetOptions,
): VerifiedTarget {
  const { env } = opts;
  const policy = opts.production ?? "refuse";
  const allowLocal = opts.allowLocal ?? true;
  const optIn = opts.productionOptIn === true;
  const confirm = opts.confirmRef?.trim().toLowerCase() || undefined;

  // 1. Catch-all screen: any mention of a Production ref, in any variable.
  const productionNamedBy: string[] = [];
  for (const name of [...COMPARED_VARS, ...SCREENED_VARS]) {
    if (mentionsProductionRef(env[name])) productionNamedBy.push(name);
  }

  // 2. The variables this tool connects with must exist.
  for (const name of opts.uses) {
    if (!env[name]) refuse(`${name} is not set. ${EXPORT_HINT}`);
  }

  // 3. Identify every compared variable that is set; unknown is a refusal.
  const ids: { name: TargetVar; id: TargetIdentity }[] = [];
  for (const name of COMPARED_VARS) {
    const raw = env[name];
    if (!raw) continue;
    const id = identify(name, raw);
    if (id.kind === "unknown") {
      refuse(
        `Refusing: ${name} ${id.reason}. Its project cannot be identified.`,
      );
    }
    ids.push({ name, id });
  }

  const local = ids.filter((x) => x.id.kind === "local");
  const hosted = ids.filter((x) => x.id.kind === "supabase");
  if (local.length > 0 && hosted.length > 0) {
    refuse(
      `Refusing: ${local.map((x) => x.name).join(", ")} ${local.length === 1 ? "is" : "are"} local but ` +
        `${hosted.map((x) => x.name).join(", ")} ${hosted.length === 1 ? "is" : "are"} hosted — different environments. ${EXPORT_HINT}`,
    );
  }

  // 4a. Local target.
  if (hosted.length === 0) {
    if (productionNamedBy.length > 0) {
      refuse(
        `Refusing: ${productionNamedBy.join(", ")} names the PRODUCTION project while the database is local. Unset it.`,
      );
    }
    if (!allowLocal)
      refuse("Refusing: this tool does not run against a local database.");
    if (optIn)
      refuse(
        "Refusing: --production was given but the target is the local stack.",
      );
    if (confirm) {
      refuse(
        `Refusing: --confirm-ref ${confirm} was given but the target is the local stack. Check which environment you exported.`,
      );
    }
    const first = local[0]?.id;
    return {
      kind: "local",
      host: first && first.kind === "local" ? first.host : "localhost",
    };
  }

  // 4b. Hosted target: one project, cross-checked by a database URL AND the API URL.
  const refs = new Set(
    hosted.map((x) => (x.id.kind === "supabase" ? x.id.ref : "")),
  );
  if (refs.size !== 1) {
    refuse(
      `Refusing: the variables name different projects (${hosted
        .map((x) => `${x.name} → ${x.id.kind === "supabase" ? x.id.ref : "?"}`)
        .join(", ")}). ${EXPORT_HINT}`,
    );
  }
  const ref = [...refs][0];
  if (!hosted.some((x) => DATABASE_VARS.has(x.name))) {
    refuse(
      "Refusing: a hosted target needs a database URL (DATABASE_URL or DIRECT_URL).",
    );
  }
  if (!hosted.some((x) => x.name === "NEXT_PUBLIC_SUPABASE_URL")) {
    refuse(
      "Refusing: a hosted target must be cross-checked against NEXT_PUBLIC_SUPABASE_URL for the same project. " +
        EXPORT_HINT,
    );
  }
  const dbEntry = hosted.find((x) => DATABASE_VARS.has(x.name))!;
  const host = dbEntry.id.kind === "supabase" ? dbEntry.id.host : "";

  const production = isProductionRef(ref) || productionNamedBy.length > 0;
  if (production) {
    if (policy === "refuse") {
      refuse(
        `Refusing: ${productionNamedBy.join(", ") || "the target"} names the PRODUCTION project (${PRODUCTION_PROJECT_REFS.join(", ")}). ` +
          "This tool never runs against Production; there is no override.",
      );
    }
    if (!isProductionRef(ref)) {
      refuse(
        `Refusing: ${productionNamedBy.join(", ")} names PRODUCTION but the database is project ${ref}. Inconsistent environment.`,
      );
    }
    if (!optIn || !isProductionRef(confirm)) {
      refuse(
        "Refusing: the target is the PRODUCTION project. A deliberate, runbook-driven production run needs BOTH --production " +
          `and --confirm-ref ${ref}, after a fresh backup. A hostname is never confirmation.`,
      );
    }
    return { kind: "hosted", ref, host, production: true };
  }

  if (optIn) {
    refuse(
      `Refusing: --production was given but the target is project ${ref}, not Production.`,
    );
  }
  if (!confirm) {
    refuse(
      `Refusing: the target is hosted project ${ref} (via ${host}). Re-run with --confirm-ref ${ref} to confirm it explicitly. ` +
        "A shared pooler hostname is never sufficient confirmation.",
    );
  }
  if (confirm !== ref) {
    refuse(
      `Refusing: --confirm-ref ${confirm} does not match the configured project ${ref}. Nothing was opened.`,
    );
  }
  return { kind: "hosted", ref, host, production: false };
}

/** One line for an operator's console, without credentials. */
export function describeTarget(t: VerifiedTarget): string {
  if (t.kind === "local") return `local stack (${t.host})`;
  return t.production
    ? `PRODUCTION project ${t.ref} (via ${t.host})`
    : `hosted project ${t.ref} (via ${t.host}) — confirmed`;
}

// ---------------------------------------------------------------------------
// Database identity marker — independent proof from the connected database.
//
// Set ONCE on the development project, in its SQL editor (no table, so no RLS
// surface; the schema is not exposed by the Data API):
//
//   CREATE SCHEMA IF NOT EXISTS overload_target;
//   COMMENT ON SCHEMA overload_target IS 'overload-target:<dev ref>';
//
// Production never carries it. A hosted non-production target without the
// exact marker for its own ref is refused before anything is written.
// ---------------------------------------------------------------------------

export const TARGET_MARKER_SCHEMA = "overload_target";

export function targetMarker(ref: string): string {
  return `overload-target:${ref.trim().toLowerCase()}`;
}

/** The one-time setup statement, for an operator to paste into the dev SQL editor. */
export function targetMarkerSetupSql(ref: string): string {
  return (
    `CREATE SCHEMA IF NOT EXISTS ${TARGET_MARKER_SCHEMA};\n` +
    `COMMENT ON SCHEMA ${TARGET_MARKER_SCHEMA} IS '${targetMarker(ref)}';`
  );
}

/** Read-only. Returns zero rows when the marker schema does not exist. */
export const TARGET_MARKER_SQL =
  "SELECT pg_catalog.obj_description(n.oid, 'pg_namespace') AS marker " +
  `FROM pg_catalog.pg_namespace n WHERE n.nspname = '${TARGET_MARKER_SCHEMA}'`;

export type MarkerQuery = (sql: string) => Promise<{ marker: string | null }[]>;

/**
 * Verify the connected database is the confirmed target. Local targets and the
 * deliberate production opt-in need no marker ("not-required"); a hosted
 * non-production target must carry exactly `overload-target:<its ref>`.
 */
export async function verifyTargetMarker(
  target: VerifiedTarget,
  query: MarkerQuery,
): Promise<"verified" | "not-required"> {
  if (target.kind === "local" || target.production) return "not-required";
  let rows: { marker: string | null }[];
  try {
    rows = await query(TARGET_MARKER_SQL);
  } catch {
    return refuse(
      "Refusing: could not read the database identity marker. Nothing was written.",
    );
  }
  const marker = rows[0]?.marker?.trim().toLowerCase() ?? null;
  if (rows.length !== 1 || !marker) {
    return refuse(
      `Refusing: project ${target.ref} has no database identity marker. Set it once in that project's SQL editor:\n` +
        targetMarkerSetupSql(target.ref),
    );
  }
  if (mentionsProductionRef(marker)) {
    return refuse(
      "Refusing: the connected database's identity marker names PRODUCTION.",
    );
  }
  if (marker !== targetMarker(target.ref)) {
    return refuse(
      `Refusing: the connected database's identity marker does not match project ${target.ref}. Nothing was written.`,
    );
  }
  return "verified";
}

// ---------------------------------------------------------------------------
// Shared CLI flag handling.
// ---------------------------------------------------------------------------

/** Flags every guarded CLI accepts. `--confirm-host` is retired and refused. */
export const TARGET_VALUE_FLAGS = ["--confirm-ref"] as const;
export const TARGET_BOOLEAN_FLAGS = ["--production"] as const;

export const CONFIRM_HOST_RETIRED =
  "--confirm-host is no longer accepted: Production and the development project share the pooler hostname. " +
  "Use --confirm-ref <project ref> instead.";
