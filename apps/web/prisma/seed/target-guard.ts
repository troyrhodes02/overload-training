/**
 * Refuses to run the catalog import unless its targets — the database
 * (DATABASE_URL, cross-checked with DIRECT_URL when set) and Storage
 * (NEXT_PUBLIC_SUPABASE_URL + service-role key) — are provably the SAME
 * environment, and a hosted project is explicitly confirmed by REF (OVE-111;
 * originally spec D29).
 *
 * Confirmation used to be the database HOST. Through Supabase's shared pooler,
 * Production and the development project have the same host, so a host is no
 * longer accepted (OVERLOAD_IMPORT_CONFIRM_HOST is refused outright). Rules,
 * via scripts/operator/target-identity.ts:
 *
 *   - local stack (database AND Storage local): runs without confirmation;
 *   - a hosted project: `--confirm-ref <its ref>` on the command line (or
 *     OVERLOAD_IMPORT_CONFIRM_REF=<its ref>), then the database identity
 *     marker is verified before any write (seed.ts);
 *   - PRODUCTION: additionally the explicit `--production` COMMAND-LINE FLAG.
 *     There is no environment-variable form of the production opt-in (a
 *     variable can linger in a shell; a flag is typed per run), and the
 *     retired OVERLOAD_IMPORT_PRODUCTION is refused if set. The library was
 *     imported into Production by the Library & Gyms runbook; a re-run is a
 *     deliberate, runbook-driven human step only.
 *
 * Run hosted imports directly so the flags arrive (npm drops options after
 * `--` in PowerShell):  npx tsx prisma/seed.ts --confirm-ref <ref>
 */
import {
  CONFIRM_HOST_RETIRED,
  TargetRefused,
  assertOperatorTarget,
  type VerifiedTarget,
} from "../../scripts/operator/target-identity";

export type SeedArgs = {
  confirmRef: string | undefined;
  production: boolean;
  unexpected: string[];
};

export function parseSeedArgs(argv: string[]): SeedArgs {
  let confirmRef: string | undefined;
  let production = false;
  const unexpected: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--production") production = true;
    else if (arg === "--confirm-ref" && i + 1 < argv.length)
      confirmRef = argv[++i];
    else unexpected.push(arg);
  }
  return { confirmRef, production, unexpected };
}

export function assertImportTargetAllowed(
  env: Record<string, string | undefined>,
  argv: string[] = [],
): { host: string; remote: boolean; target: VerifiedTarget } {
  const args = parseSeedArgs(argv);
  if (args.unexpected.includes("--confirm-host")) {
    throw new TargetRefused(`Refusing: ${CONFIRM_HOST_RETIRED}`);
  }
  if (args.unexpected.length > 0) {
    throw new TargetRefused(
      `Refusing: unexpected argument(s): ${args.unexpected.join(" ")}. Accepted: --confirm-ref <ref>, --production.`,
    );
  }
  if (env.OVERLOAD_IMPORT_CONFIRM_HOST) {
    throw new TargetRefused(
      "Refusing: OVERLOAD_IMPORT_CONFIRM_HOST is no longer accepted: Production and the development project share the pooler " +
        "hostname. Unset it and pass --confirm-ref <project ref> instead.",
    );
  }
  if (env.OVERLOAD_IMPORT_PRODUCTION !== undefined) {
    throw new TargetRefused(
      "Refusing: OVERLOAD_IMPORT_PRODUCTION is not accepted: the production opt-in is the explicit --production command-line flag only. Unset it.",
    );
  }
  const flagRef = args.confirmRef?.trim();
  const envRef = env.OVERLOAD_IMPORT_CONFIRM_REF?.trim();
  if (flagRef && envRef && flagRef.toLowerCase() !== envRef.toLowerCase()) {
    throw new TargetRefused(
      "Refusing: --confirm-ref and OVERLOAD_IMPORT_CONFIRM_REF disagree. Pass one confirmation.",
    );
  }
  const target = assertOperatorTarget({
    env,
    uses: ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    confirmRef: flagRef || envRef,
    production: "explicit-opt-in",
    productionOptIn: args.production,
  });
  return { host: target.host, remote: target.kind === "hosted", target };
}
