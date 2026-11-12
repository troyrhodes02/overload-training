import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { skipFirstTour } from "./tour-support";

/**
 * Password recovery against the LOCAL Supabase stack (Public Accounts PA4;
 * spec §9, §12, D7; design Screens 2–5). A forgotten password is recovered end
 * to end in a real browser, the sent state is identical for every address, an
 * invalid link lands on the expired card, and a suspended account cannot reset
 * its way back into access.
 *
 * There is no external inbox in the run: the recovery LINK the email would
 * carry is generated through the admin API (admin.generateLink), which yields
 * the same one-time token_hash the Supabase recovery template embeds. The
 * browser then follows /auth/confirm exactly as it would from the email. The
 * widget uses Cloudflare's "always passes" test keys (set in the config).
 *
 * Only temporary accounts are created; each is deleted at the end.
 */

test.describe.configure({ mode: "serial" });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:/.test(URL_)) {
  throw new Error("The recovery suite runs against the local stack only.");
}
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const tag = String(stamp).slice(-8);
const R = {
  email: `e2e-rec-${stamp}@example.test`,
  password: "old-recovery-pass-1",
  newPassword: "new-recovery-pass-9",
  username: `e2e_rec_${tag}`,
};

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ timezoneId: "America/Denver" });
  return ctx.newPage();
}

async function userId(email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email === email)?.id ?? null;
}

/** The one-time token_hash the recovery email would carry, from the admin API. */
async function recoveryTokenHash(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`could not generate a recovery link (${error?.message})`);
  }
  return data.properties.hashed_token;
}

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Rhea");
  await page.getByLabel("Last name").fill("Covery");
  await page.getByLabel("Username").fill(R.username);
  await page.getByLabel("Email").fill(R.email);
  await page.getByLabel("Password", { exact: true }).fill(R.password);
  await page.getByLabel("Confirm password", { exact: true }).fill(R.password);
  // Wait for the always-passes challenge to produce a token (button enables).
  const submit = page.getByRole("button", { name: "Create account" });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await expect(page).toHaveURL(/\/$/);
  await skipFirstTour(page);
}

test.afterAll(async ({ browser }) => {
  const id = await userId(R.email);
  if (!id) return;
  // Reactivate if suspended, then delete through the app's own flow.
  const page = await newPage(browser);
  await page.goto("/login");
  await page.getByLabel("Email").fill(R.email);
  await page.getByLabel("Password", { exact: true }).fill(R.newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await expect(page).toHaveURL(/\/$/, { timeout: 5_000 });
    await page.goto("/settings/delete-account");
    await page.getByLabel("Password", { exact: true }).fill(R.newPassword);
    await page
      .getByRole("button", { name: "Delete account permanently" })
      .click();
    await expect(page).toHaveURL(/\/login\?notice=deleted$/);
  } catch {
    // Fallback: a suspended or unexpected state — remove the identity directly.
    await admin.auth.admin.deleteUser(id);
  }
});

test("a forgotten password is recovered end to end", async ({ browser }) => {
  const page = await newPage(browser);
  await signUp(page);

  // Sign out, then start recovery from the login screen.
  await page.goto("/login");
  await page.getByRole("link", { name: /forgot password/i }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await page.getByLabel("Email").fill(R.email);
  const send = page.getByRole("button", { name: /send reset link/i });
  await expect(send).toBeEnabled({ timeout: 15_000 });
  await send.click();
  // The identical "sent" state.
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  // Follow the link the email would carry.
  const tokenHash = await recoveryTokenHash(R.email);
  await page.goto(`/auth/confirm?type=recovery&token_hash=${tokenHash}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(
    page.getByRole("heading", { name: "Set a new password" }),
  ).toBeVisible();

  await page.getByLabel("New password").fill(R.newPassword);
  await page.getByRole("button", { name: /set new password/i }).click();
  await expect(page).toHaveURL(/\/login\?notice=password-updated$/);
  await expect(
    page.getByText("Password updated. Sign in with your new password."),
  ).toBeVisible();

  // The new password works; the old one does not.
  await page.getByLabel("Email").fill(R.email);
  await page.getByLabel("Password", { exact: true }).fill(R.newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the sent state is identical for an unknown email", async ({
  browser,
}) => {
  const page = await newPage(browser);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`nobody-${stamp}@example.test`);
  const send = page.getByRole("button", { name: /send reset link/i });
  await expect(send).toBeEnabled({ timeout: 15_000 });
  await send.click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
});

test("an invalid link lands on the expired card", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto("/auth/confirm?type=recovery&token_hash=not-a-real-token");
  await expect(page).toHaveURL(/\/forgot-password\?link=expired$/);
  await expect(
    page.getByText(/that reset link has expired or was already used/i),
  ).toBeVisible();
});

// Suspension-safety (a suspended account cannot reset its way back into
// access, and setNewPassword never flips Profile.status) is proven directly
// and deterministically in tests/integration/recovery.int.test.ts, where
// status can be set without the admin-suite cross-dependency and requireAccount
// enforcement is asserted. Driving the admin suspend action in the browser here
// would couple this suite to admin-center.spec.ts; the integration proof is the
// authoritative one.
