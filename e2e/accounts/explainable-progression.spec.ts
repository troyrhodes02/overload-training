import { test, expect, type Page } from "@playwright/test";
import {
  PHONE_CONTEXT,
  REPRESENTATIVE,
  accountExists,
  addEarlierBenchSession,
  benchHistoryAllTop,
  deleteThroughApp,
  seedRepresentativeWorkout,
  setCount,
  signUpThroughApp,
  startRepresentativeWorkout,
  tempAccount,
} from "./support/representative-workout";

/**
 * Smarter & Explainable Progression against the LOCAL Supabase stack (spec
 * §14.3): the recommendation lines on Today's planned list, the exercise
 * card, the day-complete summary, and the exercise page, for one real
 * history; the card's number holding still while today's sets are logged
 * (R9); a correction in History changing the words on the next read; and
 * reading every surface writing nothing. Screenshots at 375 light and 1280
 * dark for comparison with the preview. One temporary account, removed
 * through the app.
 */

test.describe.configure({ mode: "serial" });

const WHO = tempAccount("expl");
const SHOTS = "test-results/explainable-progression";
const bench = REPRESENTATIVE[0].name; // 3 × 6–8

test.afterAll(async ({ browser }) => {
  if (!(await accountExists(WHO.email))) return;
  const c = await browser.newContext();
  await deleteThroughApp(await c.newPage(), WHO);
  await c.close();
});

const visible = (p: Page, text: string) =>
  p.getByText(text, { exact: true }).filter({ visible: true });

test("each surface says what to do and why, and follows a correction", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, WHO);
  const seeded = await seedRepresentativeWorkout(WHO.email);
  await benchHistoryAllTop(seeded.userId); // last time: 185 × 8, 8, 8
  await addEarlierBenchSession(seeded.userId); // the week before: 185 × 8, 8, 8

  const sets = await setCount(seeded.userId);

  // Today, before starting: the tagged row carries its evidence.
  await page.goto("/");
  await expect(visible(page, "Try 190 lb (+5)")).toBeVisible();
  await expect(
    visible(page, "8 reps on every set, 2 sessions running"),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/today-375-light.png` });

  // The card advises today, and the weight box still offers the working weight.
  await startRepresentativeWorkout(page);
  await expect(
    page.getByRole("heading", { name: bench, exact: true }).filter({
      visible: true,
    }),
  ).toBeVisible();
  await expect(visible(page, "Try 190 lb today (+5 lb)")).toBeVisible();
  await expect(
    visible(page, "8 reps on every set, 2 sessions running"),
  ).toBeVisible();
  await expect(page.getByLabel("Set 1 weight in pounds")).toHaveValue("185");
  await page.screenshot({ path: `${SHOTS}/card-375-light.png` });

  // Take the advice: 190 × 8, 8, 8. The card's number doesn't move (R9).
  for (const n of [1, 2, 3]) {
    const box = page.getByLabel(`Set ${n} weight in pounds`);
    if ((await box.inputValue()) !== "190") {
      await box.tap();
      await box.fill("190");
    }
    await page.getByLabel(`Set ${n} reps`).tap();
    await page.keyboard.type("8");
    await page.getByRole("button", { name: `Log set ${n}` }).tap();
    await expect(
      page.getByRole("button", { name: new RegExp(`^Set ${n}, .*logged`) }),
    ).toBeVisible();
    await expect(visible(page, "Try 190 lb today (+5 lb)")).toBeVisible();
  }
  for (const next of REPRESENTATIVE.slice(1)) {
    await page.getByRole("button", { name: `Next: ${next.name}` }).tap();
  }
  await page.getByRole("button", { name: "Finish workout" }).tap();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Finish workout" })
    .tap();
  await expect(page).toHaveURL(/\/$/);

  // Day complete: next time, judged with today's sets (e1RM rose: 185 → 190).
  await expect(visible(page, "Try 195 lb next time (+5 lb)")).toBeVisible();
  await expect(
    visible(page, "8 reps on every set, 2 sessions running"),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/summary-375-light.png` });

  // The exercise page says the same thing.
  await page
    .getByRole("link", { name: "history ›" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]{36}/);
  const exercisePage = page.url();
  await expect(visible(page, "Try 195 lb next time (+5 lb)")).toBeVisible();
  await expect(
    visible(page, "8 reps on every set, 2 sessions running"),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/exercise-375-light.png` });

  // Reading never wrote: only today's three bench sets were added.
  expect(await setCount(seeded.userId)).toBe(sets + 3);

  // Correct today's set 3 to 7 reps in History → a hold, with the new reps.
  await page.goto("/history");
  await page
    .getByRole("link", { name: /Push Day 1/ })
    .first()
    .click();
  const benchCard = page
    .locator("div.rounded-lg")
    .filter({ hasText: bench })
    .first();
  await benchCard.getByRole("button", { name: "edit" }).nth(2).tap();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reps").fill("7");
  await dialog.getByRole("button", { name: "Save" }).tap();
  await expect(page.getByText("Set updated")).toBeVisible();

  await page.goto(exercisePage);
  await expect(visible(page, "Stay at 190 lb next time")).toBeVisible();
  await expect(visible(page, "Last time: 8, 8, 7 of 6–8")).toBeVisible();
  await expect(page.getByText("Try 195 lb next time (+5 lb)")).toHaveCount(0);
  await page.goto("/");
  await expect(visible(page, "Stay at 190 lb next time")).toBeVisible();
  await expect(visible(page, "Last time: 8, 8, 7 of 6–8")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/summary-hold-375-light.png` });

  // 1280 dark: the same two surfaces.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(visible(page, "Stay at 190 lb next time")).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/summary-1280-dark.png`,
    fullPage: true,
  });
  await page.goto(exercisePage);
  await expect(visible(page, "Last time: 8, 8, 7 of 6–8")).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/exercise-1280-dark.png`,
    fullPage: true,
  });

  expect(await setCount(seeded.userId)).toBe(sets + 3);
  await ctx.close();
});
