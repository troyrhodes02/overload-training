import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  Counter,
  PHONE_CONTEXT,
  REPRESENTATIVE,
  accountExists,
  benchHistoryAllTop,
  deleteThroughApp,
  expectedToday,
  loggedSetsOn,
  rirOn,
  seedRepresentativeWorkout,
  signUpThroughApp,
  startRepresentativeWorkout,
  tempAccount,
} from "./support/representative-workout";

/**
 * RIR Logging & Autoregulation against the LOCAL Supabase stack (spec §14.3,
 * §14.4): optional RIR on the representative workout and what it costs in
 * taps (AC-1: RIR unset stays 18 in faster-logging.spec.ts); missing is not
 * zero in the database; bodyweight keeps reps only; a chip never steals
 * focus; correcting and clearing RIR from History; and case A end to end —
 * the same reps at 0 RIR hold, and correcting that RIR to 2 makes it Progress
 * (AC-3). Serial; temporary accounts only, removed through the app.
 */

test.describe.configure({ mode: "serial" });

const LAST = tempAccount("rirl");
const EVERY = tempAccount("rire");
const CASE = tempAccount("rira");
const SHOTS = "test-results/rir-logging";

test.afterAll(async ({ browser }) => {
  for (const who of [LAST, EVERY, CASE]) {
    if (!(await accountExists(who.email))) continue;
    const c = await browser.newContext();
    await deleteThroughApp(await c.newPage(), who);
    await c.close();
  }
});

const isFocused = (l: Locator) =>
  l.evaluate((el) => el === document.activeElement);
const loggedRow = (p: Page, n: number) =>
  p.getByRole("button", { name: new RegExp(`^Set ${n}, .*logged`) });
const visibleHeading = (p: Page, name: string) =>
  p.getByRole("heading", { name, exact: true }).filter({ visible: true });
const rirGroup = (p: Page, n: number) =>
  p
    .getByRole("radiogroup", {
      name: `Set ${n} RIR (reps in reserve, optional)`,
    })
    .filter({ visible: true });
const RIR_NAME = (r: number) => (r === 4 ? "4 or more" : String(r));

/**
 * Drive the representative workout like faster-logging.spec.ts, choosing an
 * RIR where `rirFor` returns one. Returns the counter.
 */
async function runWorkout(
  page: Page,
  rirFor: (exercise: number, set: number) => number | null,
): Promise<Counter> {
  const c = new Counter(page);
  for (const [i, ex] of REPRESENTATIVE.entries()) {
    await expect(visibleHeading(page, ex.name)).toBeVisible();
    for (const [j, set] of ex.today.entries()) {
      const n = j + 1;
      if (set.w !== null) {
        const box = page.getByLabel(`Set ${n} weight in pounds`);
        if ((await box.inputValue()) !== String(set.w)) {
          await c.tap(box, `Set ${n} weight (to change it)`);
          await c.type(String(set.w));
        }
      } else {
        await expect(page.getByLabel(/weight in pounds/)).toHaveCount(0);
      }
      const reps = page.getByLabel(`Set ${n} reps`);
      await c.focusField(reps, `Set ${n} reps`);
      await c.type(String(set.r));
      // Every set starts with nothing chosen — RIR is never carried.
      await expect(
        rirGroup(page, n).locator('[role="radio"][aria-checked="true"]'),
      ).toHaveCount(0);
      const rir = rirFor(i, j);
      if (rir !== null) {
        await c.tap(
          rirGroup(page, n).getByRole("radio", { name: RIR_NAME(rir) }),
          `RIR ${rir}`,
        );
        await expect(
          rirGroup(page, n).getByRole("radio", { name: RIR_NAME(rir) }),
        ).toHaveAttribute("aria-checked", "true");
        // The chip did not take focus: the reps field (and keyboard) stay.
        expect(await isFocused(reps)).toBe(true);
      }
      await c.tap(
        page.getByRole("button", { name: `Log set ${n}` }),
        `Log set ${n}`,
      );
      await expect(loggedRow(page, n)).toBeVisible();
      if (n < ex.today.length) {
        await expect
          .poll(() => isFocused(page.getByLabel(`Set ${n + 1} reps`)))
          .toBe(true);
      }
    }
    const primary =
      i < REPRESENTATIVE.length - 1
        ? page.getByRole("button", {
            name: `Next: ${REPRESENTATIVE[i + 1].name}`,
          })
        : page.getByRole("button", { name: "Finish workout" });
    await expect.poll(() => isFocused(primary)).toBe(true);
    await c.tap(primary, i < REPRESENTATIVE.length - 1 ? "Next" : "Finish");
  }
  await expect(page).toHaveURL(/\/$/);
  return c;
}

const expectedRir = (rirFor: (e: number, s: number) => number | null) =>
  REPRESENTATIVE.flatMap((ex, i) => ex.today.map((_, j) => rirFor(i, j)));

test("RIR on the last set of each exercise: one tap each, stored exactly; unset stays NULL", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, LAST);
  const seeded = await seedRepresentativeWorkout(LAST.email);
  await startRepresentativeWorkout(page);
  // Bench 2, Incline 1, Pushdown 3, Pushups 0 (bodyweight, reps only).
  const lastSet = [2, 1, 3, 0];
  const rirFor = (e: number, s: number) =>
    s === REPRESENTATIVE[e].today.length - 1 ? lastSet[e] : null;
  const c = await runWorkout(page, rirFor);
  console.log(
    `[tap-count] RIR-LAST taps=${c.taps} keystrokes=${c.keystrokes}\n${c.log.join("\n")}`,
  );
  expect(c.taps).toBe(22);
  expect(c.keystrokes).toBe(18);
  // Weight and reps exactly as confirmed; RIR exactly as chosen, NULL elsewhere.
  expect(await loggedSetsOn(seeded.userId, seeded.today)).toEqual(
    expectedToday(),
  );
  expect(await rirOn(seeded.userId, seeded.today)).toEqual(expectedRir(rirFor));
  await ctx.close();
});

test("RIR on every set: one tap per set, never a keystroke", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, EVERY);
  const seeded = await seedRepresentativeWorkout(EVERY.email);
  await startRepresentativeWorkout(page);
  const rirFor = (e: number, s: number) => (e + s) % 5; // 0..4, includes 4+
  const c = await runWorkout(page, rirFor);
  console.log(
    `[tap-count] RIR-EVERY taps=${c.taps} keystrokes=${c.keystrokes}`,
  );
  expect(c.taps).toBe(29);
  expect(c.keystrokes).toBe(18);
  expect(await rirOn(seeded.userId, seeded.today)).toEqual(expectedRir(rirFor));
  await ctx.close();
});

test("History shows RIR only where recorded; correcting and clearing it touches nothing else", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({
    ...PHONE_CONTEXT,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(LAST.email);
  await page.getByLabel("Password", { exact: true }).fill(LAST.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  // The workout from the first test: today, for this account.
  await page.goto("/history");
  const dayLink = page.getByRole("link", { name: /Push Day 1/ }).first();
  await dayLink.click();
  await expect(page).toHaveURL(/\/history\/[0-9a-f-]{36}$/);
  const bench = REPRESENTATIVE[0].name;
  const benchCard = page
    .locator("div.rounded-lg")
    .filter({ hasText: bench })
    .first();
  await expect(benchCard.getByText("· 2 RIR")).toBeVisible();
  // Sets 1 and 2 were logged without RIR: nothing after them.
  await expect(benchCard.getByText(/· \d\+? RIR/)).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/history-375-light.png` });

  // Correct bench set 3's RIR 2 → 1 in History's dialog.
  await benchCard.getByRole("button", { name: "edit" }).nth(2).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "2" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    dialog.getByText("Tap the selected value to clear."),
  ).toBeVisible();
  // Let the open animation settle before the fidelity screenshot.
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/edit-dialog-375-light.png` });
  await dialog.getByRole("radio", { name: "1" }).tap();
  await dialog.getByRole("button", { name: "Save" }).tap();
  await expect(page.getByText("Set updated")).toBeVisible();
  await expect(benchCard.getByText("· 1 RIR")).toBeVisible();

  // Clear it: tap the selected value again → "Not recorded." → NULL, not 0.
  await benchCard.getByRole("button", { name: "edit" }).nth(2).tap();
  await dialog.getByRole("radio", { name: "1" }).tap();
  await expect(dialog.getByText("Not recorded.")).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).tap();
  await expect(page.getByText("Set updated").first()).toBeVisible();
  await expect(benchCard.getByText(/· \d\+? RIR/)).toHaveCount(0);
  await ctx.close();
});

test("AC-3 end to end: the same reps at 0 RIR hold; correcting that RIR to 2 makes it Progress", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, CASE);
  const seeded = await seedRepresentativeWorkout(CASE.email);
  await benchHistoryAllTop(seeded.userId); // last time: 185 × 8, 8, 8
  await startRepresentativeWorkout(page);
  const bench = REPRESENTATIVE[0].name;
  await expect(visibleHeading(page, bench)).toBeVisible();

  // Today: 185 × 8, 8, 8 with set 3 at 0 RIR (the top of the range, at the limit).
  for (const n of [1, 2, 3]) {
    await page.getByLabel(`Set ${n} reps`).tap();
    await page.keyboard.type("8");
    if (n === 3) {
      await rirGroup(page, 3).getByRole("radio", { name: "0" }).tap();
    }
    await page.getByRole("button", { name: `Log set ${n}` }).tap();
    await expect(loggedRow(page, n)).toBeVisible();
  }
  await expect(
    page.getByRole("button", {
      name: "Set 3, 185 pounds, 8 reps, 0 reps in reserve, logged. Correct this set",
    }),
  ).toBeVisible();
  // Finish with the other exercises not done (they don't count either way).
  for (const next of REPRESENTATIVE.slice(1)) {
    await page.getByRole("button", { name: `Next: ${next.name}` }).tap();
  }
  await page.getByRole("button", { name: "Finish workout" }).tap();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Finish workout" })
    .tap();
  await expect(page).toHaveURL(/\/$/);

  // Day-complete summary: bench held, with the short reason.
  await expect(page.getByText("at your limit — holding")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/summary-375-light.png` });

  // Exercise page: Holding + the case A sentence.
  await page
    .getByRole("link", { name: "trend ›" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]{36}/);
  const exercisePage = page.url();
  await expect(page.getByText("Holding", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Top of the range, but at your limit last time (0 RIR) — holding.",
    ),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/exercise-case-a-375.png` });

  // Correct set 3's RIR from 0 to 2 in History → the call follows (nothing stored).
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
  await dialog.getByRole("radio", { name: "2" }).tap();
  await dialog.getByRole("button", { name: "Save" }).tap();
  await expect(page.getByText("Set updated")).toBeVisible();
  expect((await rirOn(seeded.userId, seeded.today)).slice(0, 3)).toEqual([
    null,
    null,
    2,
  ]);

  await page.goto(exercisePage);
  await expect(page.getByText("Progress", { exact: true })).toBeVisible();
  await expect(page.getByText(/Suggested next/)).toBeVisible();
  await expect(page.getByText(/at your limit last time/)).toHaveCount(0);

  // 1280 dark: the same page and today's summary.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByText("Progress", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/exercise-progress-1280-dark.png`,
    fullPage: true,
  });
  await ctx.close();
});
