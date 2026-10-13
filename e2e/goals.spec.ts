import { test, expect } from "@playwright/test";

/** Goals — the auth boundary of every Goals route. */
const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";

test.describe("goal routes require authentication", () => {
  for (const route of [
    "/goals",
    "/goals/new",
    `/goals/new/${ID}`,
    `/goals/${ID}`,
    "/goals/history",
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
