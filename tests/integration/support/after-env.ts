import { truncateAll, disconnectTestPrisma } from "./db";

// Reset the throwaway database between tests so each test starts clean.
beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await disconnectTestPrisma();
});
