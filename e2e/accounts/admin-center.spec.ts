import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  PHONE_CONTEXT,
  accountExists,
  deleteThroughApp,
  signUpThroughApp,
  tempAccount,
  withDb,
} from "./support/representative-workout";
import {
  E2E_ADMIN,
  createE2eAdmin,
  removeE2eAdmin,
  signIn,
} from "./support/admin";

/**
 * Admin Center & Feedback against the LOCAL Supabase stack (spec §14.3;
 * roadmap Definition of Done 1–5): a non-admin finds no admin page (404, no
 * admin text or title), a signed-out visitor is sent to login, only the admin
 * sees the Admin menu item, the Overview and directory render, suspension
 * refuses the lifter's very next navigation and server action (writing
 * nothing) and reactivation restores access, and every change is in the
 * audit log. Screenshots at 375 light and 1280 dark for comparison with the
 * preview. One temporary lifter (removed through the app) and the e2e admin
 * (created with the allowlisted id, removed afterwards).
 */

test.describe.configure({ mode: "serial" });

const LIFTER = tempAccount("adm");
const SHOTS = "test-results/admin-center";
let lifterId = "";

test.beforeAll(async () => {
  await createE2eAdmin();
});

test.afterAll(async ({ browser }) => {
  if (await accountExists(LIFTER.email)) {
    // Reactivate first if a failure left the lifter suspended.
    await withDb((db) =>
      db.query(
        "UPDATE profiles SET status = 'active' WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)",
        [LIFTER.email],
      ),
    );
    const c = await browser.newContext();
    await deleteThroughApp(await c.newPage(), LIFTER);
    await c.close();
  }
  await removeE2eAdmin();
});

const ADMIN_URLS = [
  "/admin",
  "/admin/accounts",
  "/admin/accounts?q=a",
  "/admin/audit",
  "/admin/feedback",
];

async function expectNotFound(page: Page, url: string) {
  const response = await page.goto(url);
  expect([url, response?.status()]).toEqual([url, 404]);
  await expect(
    page.getByText("We couldn't find that page.").filter({ visible: true }),
  ).toBeVisible();
  const title = await page.title();
  expect([url, /admin/i.test(title)]).toEqual([url, false]);
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const word of ["overview", "audit", "accounts", "suspend"]) {
    expect([url, word, body.includes(word)]).toEqual([url, word, false]);
  }
}

async function adminContext(browser: Browser, desktop = false) {
  const ctx = await browser.newContext(
    desktop
      ? {
          viewport: { width: 1280, height: 900 },
          colorScheme: "dark",
          timezoneId: "America/Chicago",
        }
      : { ...PHONE_CONTEXT, colorScheme: "light" },
  );
  const page = await ctx.newPage();
  await signIn(page, E2E_ADMIN);
  return { ctx, page };
}

test("a lifter finds no admin area: 404 everywhere, no menu item", async ({
  browser,
}) => {
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, LIFTER);
  lifterId = await withDb(async (db) => {
    const r = await db.query<{ id: string }>(
      "SELECT id FROM auth.users WHERE email = $1",
      [LIFTER.email],
    );
    return r.rows[0].id;
  });
  for (const url of [...ADMIN_URLS, `/admin/accounts/${lifterId}`]) {
    await expectNotFound(page, url);
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Send feedback" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /admin/i })).toHaveCount(0);
  await ctx.close();

  // Signed out: like every protected path, the login screen.
  const anon = await browser.newContext();
  const p = await anon.newPage();
  await p.goto("/admin");
  await expect(p).toHaveURL(/\/login$/);
  await anon.close();
});

test("the admin sees the Overview, the directory, and the account page", async ({
  browser,
}) => {
  const { ctx, page } = await adminContext(browser);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(
    page.getByText("Registered accounts").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Signup cohorts" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/overview-375-light.png`,
    fullPage: true,
  });

  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Accounts" })
    .click();
  await page.getByLabel("Search accounts").fill(LIFTER.username);
  await page.getByLabel("Search accounts").press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=${LIFTER.username}`));
  await expect(
    page.getByText(`@${LIFTER.username}`).filter({ visible: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/accounts-375-light.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Robin Tester/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Robin Tester" }),
  ).toBeVisible();
  await expect(
    page.getByText(LIFTER.email).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Suspend account…" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/account-375-light.png`,
    fullPage: true,
  });

  // The admin's own page has no access action.
  await page.goto(`/admin/accounts/${"e2e0ad00-0000-4000-8000-000000000017"}`);
  await expect(
    page
      .getByText("Admin accounts can't be suspended here.")
      .filter({ visible: true }),
  ).toBeVisible();
  await ctx.close();

  const desk = await adminContext(browser, true);
  await desk.page.goto("/admin");
  await desk.page.screenshot({
    path: `${SHOTS}/overview-1280-dark.png`,
    fullPage: true,
  });
  await desk.page.goto(`/admin/accounts`);
  await desk.page.screenshot({
    path: `${SHOTS}/accounts-1280-dark.png`,
    fullPage: true,
  });
  await desk.ctx.close();
});

test("suspension refuses the lifter's next request; reactivation restores it", async ({
  browser,
}) => {
  // The lifter is signed in, with the feedback form already open.
  const lifterCtx = await browser.newContext(PHONE_CONTEXT);
  const lifter = await lifterCtx.newPage();
  await signIn(lifter, LIFTER);
  await lifter.goto("/feedback");
  await lifter.getByLabel("Idea").check();
  await lifter.getByLabel("Message").fill("Written before the suspension.");

  const { ctx, page } = await adminContext(browser);
  await page.goto(`/admin/accounts/${lifterId}`);
  await page.getByRole("button", { name: "Suspend account…" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", { name: "Suspend Robin Tester?" }),
  ).toBeVisible();
  await expect(
    dialog.getByText(LIFTER.email, { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await dialog.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)),
  );
  await page.screenshot({ path: `${SHOTS}/suspend-dialog-375-light.png` });
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(
    page.getByText("Robin Tester is suspended.").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Suspended since").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reactivate account…" }),
  ).toBeVisible();

  // The open session's next server action is refused and writes nothing.
  await lifter.getByRole("button", { name: "Send" }).click();
  await expect(lifter).toHaveURL(/\/suspended$/);
  await expect(
    lifter.getByRole("heading", { name: "Your account is suspended" }),
  ).toBeVisible();
  await lifter.screenshot({ path: `${SHOTS}/suspended-375-light.png` });
  const written = await withDb(
    async (db) =>
      (await db.query("SELECT 1 FROM feedback WHERE user_id = $1", [lifterId]))
        .rowCount,
  );
  expect(written).toBe(0);
  // And its next navigation.
  await lifter.goto("/history");
  await expect(lifter).toHaveURL(/\/suspended$/);

  // Reactivate: the next request works again.
  await page.getByRole("button", { name: "Reactivate account…" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Reactivate" })
    .click();
  await expect(
    page
      .getByText("Robin Tester can use Overload again.")
      .filter({ visible: true }),
  ).toBeVisible();
  await lifter.goto("/history");
  await expect(lifter).toHaveURL(/\/history$/);
  await lifter.goto("/suspended");
  await expect(lifter).toHaveURL(/\/$/);

  // Both changes are in the audit log, newest first.
  await page.goto(`/admin/audit?account=${lifterId}`);
  const log = page.getByRole("list").filter({ hasText: "the account" });
  await expect(
    log.getByText(/reactivated the account/).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    log.getByText(/suspended the account/).filter({ visible: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/audit-375-light.png`,
    fullPage: true,
  });
  await ctx.close();
  await lifterCtx.close();

  const desk = await adminContext(browser, true);
  await desk.page.goto(`/admin/accounts/${lifterId}`);
  await desk.page.screenshot({
    path: `${SHOTS}/account-1280-dark.png`,
    fullPage: true,
  });
  await desk.page.goto("/admin/audit");
  await desk.page.screenshot({
    path: `${SHOTS}/audit-1280-dark.png`,
    fullPage: true,
  });
  await desk.ctx.close();
});
