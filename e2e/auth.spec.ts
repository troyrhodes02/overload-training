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
    // Recovery exists again (PA4, over the now-wired email provider): the login
    // screen points to it, carrying the typed email.
    await expect(
      page.getByRole("link", { name: /forgot password/i }),
    ).toHaveAttribute("href", /\/forgot-password/);
    await expect(
      page.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup");
    // And a quiet "Need help?" link to support.
    await expect(
      page.getByRole("link", { name: /need help/i }),
    ).toHaveAttribute("href", "/support");
  });

  test("the password-updated notice renders on login", async ({ page }) => {
    await page.goto("/login?notice=password-updated");
    await expect(
      page.getByText("Password updated. Sign in with your new password."),
    ).toBeVisible();
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

  test("the recovery surfaces render without a session (PA4)", async ({
    page,
  }) => {
    // /forgot-password is public and shows the request form.
    await page.goto("/forgot-password");
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send reset link/i }),
    ).toBeVisible();

    // Arriving from an expired link shows the neutral notice above the form.
    await page.goto("/forgot-password?link=expired");
    await expect(
      page.getByText(/that reset link has expired or was already used/i),
    ).toBeVisible();

    // /reset-password opened directly (no recovery session) shows the
    // expired-link card rather than the form.
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(
      page.getByRole("heading", { name: "This link has expired" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /send a new link/i }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  test("there is no other registration surface (/register)", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/login$/);
  });
});
