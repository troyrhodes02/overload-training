import { test, expect } from "@playwright/test";

/** Library & Gyms Setup — the auth boundary of the Gym Management routes. */
test.describe("gym routes require authentication", () => {
  for (const route of ["/gyms", "/gyms/new"]) {
    test(`unauthenticated ${route} redirects to /login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(
        page.getByRole("button", { name: /sign in/i }),
      ).toBeVisible();
    });
  }
});
