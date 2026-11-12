import { test, expect } from "@playwright/test";

/**
 * Library & Gyms Setup — the auth boundary of the new Exercise Library routes.
 * (Authenticated flows need a real Supabase Auth backend, which this suite
 * deliberately never contacts; their logic is covered by integration tests.)
 */
test.describe("exercise library routes require authentication", () => {
  for (const route of [
    "/exercises",
    "/exercises?view=favorites&muscle=back&q=row",
    "/exercises/new",
    "/exercises/3f2c1d1e-8a7b-4c6d-9e0f-112233445566",
  ]) {
    test(`unauthenticated ${route} redirects to /login`, async ({ page }) => {
      await page.goto(route);
      // The proxy keeps any query string on the redirect; the path is what matters.
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(
        page.getByRole("button", { name: /sign in/i }),
      ).toBeVisible();
    });
  }
});
