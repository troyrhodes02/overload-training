import { defineConfig } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Browser-level proofs for Foundation: the auth redirect and the absence of a
 * registration surface. Runs against a production build started locally.
 *
 * Dummy public Supabase values let the app boot; the unauthenticated paths
 * under test never require a real Supabase backend (no session cookie → no user
 * → redirect). No real Supabase project is contacted.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: BASE_URL,
    // Use the system-installed Google Chrome so CI/dev don't need Playwright's
    // bundled browser download. Override with PLAYWRIGHT_CHANNEL if needed.
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
