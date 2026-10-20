import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * The whole Accounts lifecycle against the LOCAL Supabase stack (spec §14.8;
 * pitch §7). Serial: each step builds on the last. Only temporary accounts
 * are created, and every one is deleted (through the app, with an admin
 * sweep as a fallback).
 */

test.describe.configure({ mode: "serial" });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const INVITE = process.env.E2E_INVITE_CODE ?? "";
if (!/^http:\/\/127\.0\.0\.1:/.test(URL_)) {
  throw new Error(
    "The Accounts lifecycle suite runs against the local stack only.",
  );
}
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = () =>
  createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const stamp = Date.now();
const A = { email: `e2e-${stamp}-a@example.test`, password: "first-pass-123" };
const B = { email: `e2e-${stamp}-b@example.test`, password: "second-pass-456" };
const A_GYM = `A Gym ${stamp}`;

async function userExists(email: string): Promise<boolean> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.some((u) => u.email === email);
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  const { error } = await anon().auth.signInWithPassword({ email, password });
  return !error;
}

async function signUp(page: Page, who: typeof A, inviteCode = INVITE) {
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill(inviteCode);
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill(who === A ? "Alpha" : "Bravo");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  expectSuccess = true,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the auth session to be set before navigating anywhere else.
  if (expectSuccess) await expect(page).toHaveURL(/\/$/);
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ timezoneId: "America/Denver" });
  return ctx.newPage();
}

test.afterAll(async ({ browser }) => {
  // Fallback for a failed run: remove any account still present through the
  // app's own deletion flow (never a bare identity delete, which would orphan
  // its rows in the local database).
  for (const who of [A, B]) {
    if (!(await userExists(who.email))) continue;
    if (!(await canSignIn(who.email, who.password))) continue;
    const page = await newPage(browser);
    await signIn(page, who.email, who.password);
    await page.goto("/settings/delete-account");
    await page.getByLabel("Password", { exact: true }).fill(who.password);
    await page
      .getByRole("button", { name: "Delete account permanently" })
      .click();
    await expect(page).toHaveURL(/\/login\?notice=deleted$/);
  }
});

test("a wrong invite code is rejected and creates nothing", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signUp(page, A, "not-the-invite-code");
  await expect(page.getByText("That invite code isn't valid.")).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
  expect(await userExists(A.email)).toBe(false);
});

test("a valid invite creates the account and lands on an empty Today", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signUp(page, A);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("No active plan.")).toBeVisible();
  expect(await userExists(A.email)).toBe(true);
  // A gym only A owns, for the isolation check.
  await page.goto("/gyms/new");
  await page.getByLabel("Name").fill(A_GYM);
  await page.getByRole("button", { name: /add gym/i }).click();
  await expect(page.getByText(A_GYM)).toBeVisible();
  // The same email can't sign up twice (only revealed after a valid code).
  const again = await newPage(browser);
  await signUp(again, A);
  await expect(
    again.getByText("An account with this email already exists."),
  ).toBeVisible();
});

test("a second account sees none of the first account's data", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signUp(page, B);
  await expect(page.getByText("No active plan.")).toBeVisible();
  await page.goto("/gyms");
  await expect(page.getByText("No gyms yet.")).toBeVisible();
  await expect(page.getByText(A_GYM)).toHaveCount(0);
});

test("sign out ends access; signing back in returns the same account", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signIn(page, A.email, A.password);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/gyms");
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page, A.email, A.password);
  await page.goto("/gyms");
  await expect(page.getByText(A_GYM)).toBeVisible();
  // One message for a wrong password and an unknown email (signed out).
  const signedOut = await newPage(browser);
  await signIn(signedOut, A.email, "wrong-password-1", false);
  await expect(signedOut.getByText("Wrong email or password.")).toBeVisible();
  await signIn(signedOut, "nobody-" + A.email, "whatever-1", false);
  await expect(signedOut.getByText("Wrong email or password.")).toBeVisible();
});

test("Settings edits the name and timezone of this account only", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signIn(page, A.email, A.password);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel("First name")).toHaveValue("Test");
  // The browser's zone was captured at signup.
  await expect(page.getByLabel("Timezone")).toHaveValue("America/Denver");
  await page.getByLabel("First name").fill("Alex");
  await page.getByLabel("Timezone").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name")).toHaveValue("Alex");
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Berlin");

  const b = await newPage(browser);
  await signIn(b, B.email, B.password);
  await b.goto("/settings");
  await expect(b.getByLabel("First name")).toHaveValue("Test");
  await expect(b.getByLabel("Last name")).toHaveValue("Bravo");
});

test("deletion needs the password and removes only this account", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await signIn(page, A.email, A.password);
  await page.goto("/settings/delete-account");
  await expect(
    page.getByRole("main").getByRole("listitem").filter({ hasText: "Gyms" }),
  ).toContainText("1");
  const confirm = page.getByRole("button", {
    name: "Delete account permanently",
  });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Password", { exact: true }).fill("not-my-password");
  await confirm.click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();
  expect(await userExists(A.email)).toBe(true);

  await page.getByLabel("Password", { exact: true }).fill(A.password);
  await confirm.click();
  await expect(page).toHaveURL(/\/login\?notice=deleted$/);
  await expect(page.getByText("Your account was deleted.")).toBeVisible();
  expect(await userExists(A.email)).toBe(false);
  expect(await canSignIn(A.email, A.password)).toBe(false);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);

  // B is untouched and can still sign in; then B deletes itself (cleanup).
  const b = await newPage(browser);
  await signIn(b, B.email, B.password);
  await expect(b).toHaveURL(/\/$/);
  await b.goto("/settings/delete-account");
  await expect(
    b.getByText("Your account has no training data yet."),
  ).toBeVisible();
  await b.getByLabel("Password", { exact: true }).fill(B.password);
  await b.getByRole("button", { name: "Delete account permanently" }).click();
  await expect(b).toHaveURL(/\/login\?notice=deleted$/);
  expect(await userExists(B.email)).toBe(false);
});
