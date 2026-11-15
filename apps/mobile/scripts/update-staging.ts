/**
 * `npm run mobile:update:staging [-- --message "…"]` (from the repository root)
 *
 * Publishes an iOS over-the-air update to the `staging` channel only, from a
 * clean, pushed commit, and only when a staging development build has the
 * same runtime fingerprint (scripts/update-staging-plan.ts). Node >= 22.18
 * runs it with type stripping.
 *
 * It lives at the root on purpose: the mobile package.json's `scripts` are
 * part of the native fingerprint, so editing them would cut the installed
 * builds off from every update.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planStagingUpdate,
  receivingBuilds,
  type BuildSummary,
} from "./update-staging-plan.ts";

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, {
    cwd: mobileDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
const git = (...args: string[]) => sh("git", args);

function refuse(problems: string[]): never {
  console.error(`Staging update refused:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const plan = planStagingUpdate(
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
  "eas",
  [
    "env:exec",
    "development",
    "node scripts/check-update-env.ts",
    "--non-interactive",
  ],
  { cwd: mobileDir, stdio: ["ignore", "inherit", "inherit"] },
);
if (envCheck.status !== 0) {
  refuse(["The EAS development environment check failed (above)."]);
}

const runtime = (
  JSON.parse(
    sh("npx", ["expo-updates", "fingerprint:generate", "--platform", "ios"]),
  ) as { hash: string }
).hash;
const builds = (
  JSON.parse(
    sh("eas", [
      "build:list",
      "--platform",
      "ios",
      "--limit",
      "20",
      "--json",
      "--non-interactive",
    ]),
  ) as {
    status: string;
    buildProfile?: string;
    channel?: string;
    updateChannel?: { name?: string };
    runtime?: { version?: string };
    runtimeVersion?: string;
  }[]
).map((b): BuildSummary => ({
  status: b.status,
  buildProfile: b.buildProfile ?? null,
  channel: b.channel ?? b.updateChannel?.name ?? null,
  runtimeVersion: b.runtimeVersion ?? b.runtime?.version ?? null,
}));
const receivers = receivingBuilds(runtime, builds);
if (receivers.length === 0) {
  refuse([
    `No finished staging development build has runtime ${runtime.slice(0, 10)}. ` +
      "A native change needs a new build (runbook §7), not an update.",
  ]);
}
console.log(
  `Runtime ${runtime.slice(0, 10)}: ${receivers.length} staging development build(s) can receive this update.`,
);

const run = spawnSync("eas", plan.args, {
  cwd: mobileDir,
  stdio: "inherit",
  env: { ...process.env, ...plan.env },
});
process.exit(run.status ?? 1);
