/**
 * `npm run mobile:update:production -- --message "…"` (from the repository
 * root; Pitch 21l runbook §8). A HUMAN step: never run by a pipeline run.
 *
 * Publishes an iOS over-the-air update to the `production` channel only, from
 * a clean commit on origin/main, with the Production environment forced, and
 * only when a finished Production build has the same runtime fingerprint
 * (scripts/update-production-plan.ts). Node >= 22.18 runs it with type
 * stripping.
 *
 * It lives at the root on purpose: the mobile package.json's `scripts` are
 * part of the native fingerprint, so editing them would cut the installed
 * builds off from every update.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planProductionUpdate,
  PRODUCTION,
  receivingProductionBuilds,
  type ProductionBuildSummary,
} from "./update-production-plan.ts";

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, {
    cwd: mobileDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
const git = (...args: string[]) => sh("git", args);
// EAS CLI through npx, so no global `eas` is needed. `--yes` skips npx's
// install prompt; eas.json's `cli.version` still gates the version it runs.
const eas = (args: string[]): [string, string[]] => [
  "npx",
  ["--yes", "eas-cli", ...args],
];

function refuse(problems: string[]): never {
  console.error(`Production update refused:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const plan = planProductionUpdate(
  {
    status: git("status", "--porcelain"),
    remoteBranches: git("branch", "-r", "--contains", "HEAD"),
    sha: git("rev-parse", "HEAD"),
    subject: git("log", "-1", "--format=%s"),
  },
  process.argv.slice(2),
);
if (!plan.ok) refuse(plan.problems);

// The bundle's public values come from the EAS environment; require them.
const envCheck = spawnSync(
  ...eas([
    "env:exec",
    "production",
    "node scripts/check-production-env.ts",
    "--non-interactive",
  ]),
  { cwd: mobileDir, stdio: ["ignore", "inherit", "inherit"] },
);
if (envCheck.status !== 0) {
  refuse(["The EAS production environment check failed (above)."]);
}

// The runtime of the Production target, evaluated as Production.
const runtime = (
  JSON.parse(
    execFileSync(
      "npx",
      ["expo-updates", "fingerprint:generate", "--platform", "ios"],
      {
        cwd: mobileDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, ...plan.env },
      },
    ),
  ) as { hash: string }
).hash;
const builds = (
  JSON.parse(
    sh(
      ...eas([
        "build:list",
        "--platform",
        "ios",
        "--limit",
        "20",
        "--json",
        "--non-interactive",
      ]),
    ),
  ) as {
    status: string;
    buildProfile?: string;
    channel?: string;
    updateChannel?: { name?: string };
    runtime?: { version?: string };
    runtimeVersion?: string;
  }[]
).map((b): ProductionBuildSummary => ({
  status: b.status,
  buildProfile: b.buildProfile ?? null,
  channel: b.channel ?? b.updateChannel?.name ?? null,
  runtimeVersion: b.runtimeVersion ?? b.runtime?.version ?? null,
}));
const receivers = receivingProductionBuilds(runtime, builds);
if (receivers.length === 0) {
  refuse([
    `No finished ${PRODUCTION.profile} build has runtime ${runtime.slice(0, 10)}. ` +
      "A native change needs a new build (runbook §8), not an update.",
  ]);
}
console.log(
  `Runtime ${runtime.slice(0, 10)}: ${receivers.length} Production build(s) can receive this update.`,
);

const run = spawnSync(...eas(plan.args), {
  cwd: mobileDir,
  stdio: "inherit",
  env: { ...process.env, ...plan.env },
});
process.exit(run.status ?? 1);
