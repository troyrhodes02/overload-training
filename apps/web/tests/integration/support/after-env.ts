import { truncateAll, disconnectTestPrisma } from "./db";

// Dev/preview posture: paid checkout is enabled (the kill switch is on), so the
// billing suites exercise the live-like path. A test that needs it off toggles
// it locally and restores it.
process.env.STRIPE_BILLING_ENABLED = "true";

// Integration tests never reach Stripe. Account deletion's default billing
// adapter (OVE-122) reads STRIPE_SECRET_KEY; with it unset the adapter reports
// "not configured" instead of calling Stripe. Suites that exercise the cancel
// pass a stub explicitly.
delete process.env.STRIPE_SECRET_KEY;

// Reset the throwaway database between tests so each test starts clean.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await disconnectTestPrisma();
});
