import { test, expect } from "@playwright/test";

test.describe("authentication boundary", () => {
  test("unauthenticated visit to a protected route redirects to /login", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("settings and account deletion need an auth session", async ({
    page,
  }) => {
    for (const route of ["/settings", "/settings/delete-account"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("login shows email, password, and the signup link", async ({ page }) => {
    // Accounts (Pitch 9, spec R17) supersedes Foundation's "no registration
    // affordance": signup exists (OVE-50: open, behind the server's switch).
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    // No password reset: it needs an email provider, which Overload doesn't have.
    await expect(page.getByRole("link", { name: /forgot/i })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup");
  });

  test("an unknown notice is ignored; the deletion notice is plain", async ({
    page,
  }) => {
    await page.goto("/login?notice=deleted");
    await expect(page.getByText("Your account was deleted.")).toBeVisible();
    await page.goto("/login?notice=<b>hi</b>");
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("signup is closed unless the signup switch is on", async ({ page }) => {
    // The e2e server leaves OVERLOAD_SIGNUP_OPEN unset: production's default.
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup$/);
    await expect(
      page.getByRole("heading", { name: "Signup isn't open" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create account/i }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Invite code")).toHaveCount(0);
  });

  test("there is no password-reset surface", async ({ page }) => {
    for (const route of [
      "/forgot-password",
      "/reset-password",
      "/auth/confirm?type=recovery&token_hash=x",
    ]) {
      await page.goto(route);
      // The proxy keeps the query string on its redirect.
      await expect(page).toHaveURL(/\/login(\?.*)?$/);
    }
  });

  test("there is no other registration surface (/register)", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/login$/);
  });
});
