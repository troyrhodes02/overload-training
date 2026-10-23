import { test, expect } from "@playwright/test";
import {
  PHONE_CONTEXT,
  accountExists,
  deleteThroughApp,
  signUpThroughApp,
  tempAccount,
  withDb,
} from "./support/representative-workout";

/**
 * Send feedback against the LOCAL Supabase stack (Admin Center & Feedback,
 * spec §14.3; design doc Screens 1 and 10): reached from the phone sheet and
 * the ⋮ menu, validation keeps the draft, a sent message is stored exactly
 * as typed (trimmed) for the signed-in account with nothing attached, and the
 * confirmation replaces the form. Screenshots at 375 light and 1280 dark for
 * comparison with the preview. One temporary account, removed through the app.
 */

test.describe.configure({ mode: "serial" });

const WHO = tempAccount("fdbk");
const SHOTS = "test-results/send-feedback";

test.afterAll(async ({ browser }) => {
  if (!(await accountExists(WHO.email))) return;
  const c = await browser.newContext();
  await deleteThroughApp(await c.newPage(), WHO);
  await c.close();
});

test("a lifter sends feedback from the phone menu", async ({ browser }) => {
  const ctx = await browser.newContext({
    ...PHONE_CONTEXT,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await signUpThroughApp(page, WHO);

  // Phone sheet: Settings, then Send feedback (never Admin).
  await page.getByRole("button", { name: "Open navigation" }).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("link", { name: "Send feedback" }),
  ).toBeVisible();
  await expect(sheet.getByRole("link", { name: /admin/i })).toHaveCount(0);
  await sheet.getByRole("link", { name: "Send feedback" }).click();
  await expect(page).toHaveURL(/\/feedback$/);
  await expect(
    page.getByRole("heading", { name: "Send feedback" }),
  ).toBeVisible();

  // Validation: nothing chosen, nothing written.
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Choose what it's about.")).toBeVisible();
  await expect(page.getByText("Write a message.")).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/validation-375-light.png`,
    fullPage: true,
  });

  await page.getByLabel("Bug").check();
  await page
    .getByLabel("Message")
    .fill("  The set entry jumps when I tap reps on the second set.  ");
  await page.screenshot({
    path: `${SHOTS}/form-375-light.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByRole("heading", { name: "Sent. Thanks for telling us." }),
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/sent-375-light.png`,
    fullPage: true,
  });

  const rows = await withDb(
    async (db) =>
      (
        await db.query<{
          category: string;
          message: string;
          handled_at: Date | null;
          email: string;
        }>(
          `SELECT f.category, f.message, f.handled_at, u.email
           FROM feedback f JOIN auth.users u ON u.id = f.user_id
          WHERE u.email = $1`,
          [WHO.email],
        )
      ).rows,
  );
  expect(rows).toEqual([
    {
      category: "bug",
      message: "The set entry jumps when I tap reps on the second set.",
      handled_at: null,
      email: WHO.email,
    },
  ]);

  await page.getByRole("button", { name: "Send something else" }).click();
  await expect(page.getByLabel("Message")).toHaveValue("");
  await ctx.close();
});

test("the ⋮ menu reaches it on desktop, dark", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark",
    timezoneId: "America/Chicago",
  });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(WHO.email);
  await page.getByLabel("Password", { exact: true }).fill(WHO.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByRole("menuitem", { name: /admin/i })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Send feedback" }).click();
  await expect(page).toHaveURL(/\/feedback$/);
  await page.getByLabel("Idea").check();
  await page.screenshot({
    path: `${SHOTS}/form-1280-dark.png`,
    fullPage: true,
  });
  await ctx.close();
});
