import { test, expect } from "@playwright/test";

test.describe("authentication boundary", () => {
  test("unauthenticated visit to a protected route redirects to /login", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("login page shows email + password and NO registration affordance", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    // No sign-up / register / create-account link anywhere on the login screen.
    await expect(
      page.getByRole("link", { name: /sign ?up|register|create account/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/create an account|don't have an account/i),
    ).toHaveCount(0);
  });

  test("there is no public registration surface (/register, /signup)", async ({
    page,
  }) => {
    // The app has no registration route. An unauthenticated request for one is
    // bounced to /login by the proxy — it never renders a sign-up form.
    for (const route of ["/register", "/signup"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("button", { name: /create account|sign ?up/i }),
      ).toHaveCount(0);
    }
  });
});
