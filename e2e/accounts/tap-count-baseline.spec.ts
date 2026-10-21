import { test, expect, type Page } from "@playwright/test";
import {
  Counter,
  PHONE_CONTEXT,
  REPRESENTATIVE,
  accountExists,
  deleteThroughApp,
  expectedToday,
  loggedSetsOn,
  seedRepresentativeWorkout,
  signUpThroughApp,
  startRepresentativeWorkout,
  tempAccount,
} from "./support/representative-workout";

/**
 * BEFORE driver for the Faster Logging UX tap count (spec §14.4, R22). It
 * drives the Pitch 4 (Guided Workout Logging) card — per-row weight and reps
 * boxes, every row prefilled with the working weight, a small Save per row,
 * nothing focused after a save — through the representative workout, along
 * the shortest valid path, and prints the counts.
 *
 * It is documentation of the baseline, not a regression test: it only works
 * against the Pitch 4 card (`main` @ fe34d00), so it is skipped unless
 * OVERLOAD_TAP_BASELINE=1. Re-run it from a worktree of that commit (see the
 * run report / method note) to reproduce the "before" number.
 */
test.skip(
  process.env.OVERLOAD_TAP_BASELINE !== "1",
  "Pitch 4 card baseline driver (run against fe34d00 with OVERLOAD_TAP_BASELINE=1)",
);
test.describe.configure({ mode: "serial" });

const WHO = tempAccount("tapb");

test.afterAll(async ({ browser }) => {
  if (!(await accountExists(WHO.email))) return;
  const c = await browser.newContext();
  await deleteThroughApp(await c.newPage(), WHO);
  await c.close();
});

/** Replace a box's value the way a thumb does on the Pitch 4 card. */
async function replaceValue(
  c: Counter,
  page: Page,
  label: string,
  value: string,
) {
  const box = page.getByLabel(label);
  const current = await box.inputValue();
  await c.tap(box, `${label} (to change it)`);
  await page.keyboard.press("End"); // stands for tapping at the end of the value; not counted
  await c.press("Backspace", current.length);
  await c.type(value);
}

test("Pitch 4 card: representative workout tap count", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, WHO);
  const seeded = await seedRepresentativeWorkout(WHO.email);
  await startRepresentativeWorkout(page);

  const c = new Counter(page);
  for (const [i, ex] of REPRESENTATIVE.entries()) {
    await expect(
      page.getByText(ex.name, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    for (const [j, set] of ex.today.entries()) {
      const n = j + 1;
      if (set.w !== null) {
        const box = page.getByLabel(`Set ${n} weight in pounds`);
        if ((await box.inputValue()) !== String(set.w)) {
          await replaceValue(
            c,
            page,
            `Set ${n} weight in pounds`,
            String(set.w),
          );
        }
      }
      await c.focusField(page.getByLabel(`Set ${n} reps`), `Set ${n} reps`);
      await c.type(String(set.r));
      const saved = page.getByLabel("Saved");
      const before = await saved.count();
      await c.tap(
        page.getByRole("button", { name: "Save" }).first(),
        `Save set ${n}`,
      );
      await expect(saved).toHaveCount(before + 1);
      if (i === 0 && n === 1) {
        // AC-2 comparison point: a 3-set card with set 1 logged, plus the bar.
        const card = page.locator("div.rounded-lg").filter({
          has: page
            .getByText(ex.name, { exact: true })
            .filter({ visible: true }),
        });
        const controls = await card
          .locator("input:visible, button:visible, a:visible")
          .count();
        console.log(`[controls] BEFORE card=${controls} bar=2`);
      }
    }
    if (i < REPRESENTATIVE.length - 1) {
      await c.tap(
        page.getByRole("button", { name: "Next", exact: true }),
        "Next",
      );
    }
  }
  await c.tap(
    page.getByRole("button", { name: "Finish workout" }),
    "Finish workout",
  );
  await expect(page).toHaveURL(/\/$/);

  expect(await loggedSetsOn(seeded.userId, seeded.today)).toEqual(
    expectedToday(),
  );
  console.log(
    `[tap-count] BEFORE taps=${c.taps} keystrokes=${c.keystrokes}\n${c.log.join("\n")}`,
  );
  await ctx.close();
});
