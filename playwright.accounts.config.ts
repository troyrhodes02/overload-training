import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";
import { E2E_ADMIN_ID } from "./e2e/accounts/support/admin-id";

/**
 * Accounts lifecycle e2e (Pitch 9, spec §14.8; OVE-50): open self-signup,
 * isolation between two new accounts, sign out/in, Settings, and account
 * deletion — in a real browser against the
 * LOCAL Supabase CLI stack only.
 *
 * Every Supabase/DB value is taken from `npx supabase status` and forced on
 * the server, so the repository `.env` (which may hold production values) is
 * never used; the config refuses to run against anything but 127.0.0.1. The
 * spec creates temporary accounts and removes them; nothing that existed
 * before is touched.
 *
 * Run: `npm run test:e2e:accounts` (needs `npx supabase start`).
 */

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;

function localStack(): Record<string, string> {
  const out = execSync("npx supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const env: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const stack = localStack();
const LOCAL = {
  NEXT_PUBLIC_SUPABASE_URL: stack.API_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: stack.ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY ?? "",
  DATABASE_URL: stack.DB_URL ?? "",
  DIRECT_URL: stack.DB_URL ?? "",
};
for (const [name, value] of Object.entries(LOCAL)) {
  if (!value) throw new Error(`Local Supabase stack not running (${name}).`);
  if (!/^(https?|postgresql):\/\/[^/]*127\.0\.0\.1[:/]/.test(value)) {
    if (name.endsWith("_KEY")) continue;
    throw new Error(`Refusing: ${name} is not the local stack.`);
  }
}
// The spec reads these (admin cleanup) from its own process.
Object.assign(process.env, LOCAL);

export default defineConfig({
  testDir: "./e2e/accounts",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      ...LOCAL,
      OVERLOAD_SIGNUP_OPEN: "true",
      // Admin Center & Feedback: the one e2e admin (created by the admin suite).
      OVERLOAD_ADMIN_USER_IDS: E2E_ADMIN_ID,
    },
  },
});
