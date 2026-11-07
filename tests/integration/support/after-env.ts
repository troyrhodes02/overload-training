import { truncateAll, disconnectTestPrisma } from "./db";

// Dev/preview posture: paid checkout is enabled (the kill switch is on), so the
// billing suites exercise the live-like path. A test that needs it off toggles
// it locally and restores it.
process.env.STRIPE_BILLING_ENABLED = "true";

// Reset the throwaway database between tests so each test starts clean.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await disconnectTestPrisma();
});
