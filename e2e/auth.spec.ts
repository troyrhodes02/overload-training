import { test, expect } from "@playwright/test";

test.describe("authentication boundary", () => {
  test("unauthenticated visit to a protected route redirects to /login", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("settings needs an auth session", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("login shows email, password, recovery, and the invite-only signup link", async ({
    page,
  }) => {
    // Accounts (Pitch 9, spec R17) supersedes Foundation's "no registration
    // affordance": signup exists, but only behind a server-checked invite code.
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
    await expect(
      page.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup");
  });

  test("the forgot link carries the typed email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("will@example.com");
    await expect(
      page.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password?email=will%40example.com");
  });

  test("an unknown notice is ignored; the deletion notice is plain", async ({
    page,
  }) => {
    await page.goto("/login?notice=deleted");
    await expect(page.getByText("Your account was deleted.")).toBeVisible();
    await page.goto("/login?notice=<b>hi</b>");
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("signup is closed when no invite code is configured", async ({
    page,
  }) => {
    // The e2e server sets no OVERLOAD_INVITE_CODE: production's default.
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

  test("recovery pages are reachable signed out; reset needs a recovery session", async ({
    page,
  }) => {
    await page.goto("/forgot-password?email=will%40example.com");
    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue("will@example.com");
    await page.goto("/forgot-password?link=expired");
    await expect(
      page.getByText("That reset link has expired or was already used."),
    ).toBeVisible();
    // Opened directly, with no recovery auth session.
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: "This link has expired" }),
    ).toBeVisible();
    await expect(page.getByLabel("New password")).toHaveCount(0);
  });

  test("a confirm link without a valid token goes back to the request form", async ({
    page,
  }) => {
    await page.goto("/auth/confirm?type=signup&token_hash=x");
    await expect(page).toHaveURL(/\/forgot-password\?link=expired$/);
  });

  test("there is no other registration surface (/register)", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/login$/);
  });
});
