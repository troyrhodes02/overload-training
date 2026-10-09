import { test, expect } from "@playwright/test";

/** Split & Mesocycle Builder — the auth boundary of every Plan route. */
const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";

test.describe("plan routes require authentication", () => {
  for (const route of [
    "/plan",
    "/plan/new",
    `/plan/${ID}`,
    `/plan/${ID}/details`,
  ]) {
    test(`unauthenticated ${route} redirects to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(
        page.getByRole("button", { name: /sign in/i }),
      ).toBeVisible();
    });
  }
});
