import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  Counter,
  PHONE_CONTEXT,
  PITCH4_BASELINE,
  PUSHDOWN_BASELINE_LBS,
  REPRESENTATIVE,
  accountExists,
  deleteThroughApp,
  expectedToday,
  loggedSetsOn,
  pushdownBaseline,
  seedRepresentativeWorkout,
  setCount,
  signUpThroughApp,
  startRepresentativeWorkout,
  tempAccount,
  workoutStatus,
} from "./support/representative-workout";

/**
 * Faster Logging UX against the LOCAL Supabase stack (spec §14.3–§14.4): the
 * representative workout's tap count (AC-1), no write without confirmation
 * (AC-3), the visible-control count (AC-2), the focus flow, weight reuse,
 * bodyweight reps only, correcting a logged set from the card, and phone
 * sizing. Serial; only temporary accounts are created, and each is removed
 * through the app's own deletion flow.
 */

test.describe.configure({ mode: "serial" });

const P = tempAccount("flx");
const Q = tempAccount("flq");
const SHOTS = "test-results/faster-logging";

test.afterAll(async ({ browser }) => {
  for (const who of [P, Q]) {
    if (!(await accountExists(who.email))) continue;
    const c = await browser.newContext();
    await deleteThroughApp(await c.newPage(), who);
    await c.close();
  }
});

const focusedLabel = (p: Page) =>
  p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "BODY";
    return (
      el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName
    );
  });
const isFocused = (l: Locator) =>
  l.evaluate((el) => el === document.activeElement);
const loggedRow = (p: Page, n: number) =>
  p.getByRole("button", { name: new RegExp(`^Set ${n}, .*logged`) });
const visibleHeading = (p: Page, name: string) =>
  p.getByRole("heading", { name, exact: true }).filter({ visible: true });

test("AC-1: the representative workout takes fewer taps, and history is exactly what was confirmed", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, P);
  const seeded = await seedRepresentativeWorkout(P.email);
  await startRepresentativeWorkout(page);

  // Nothing takes focus on page load (R13).
  expect(await focusedLabel(page)).toBe("BODY");

  const c = new Counter(page);
  for (const [i, ex] of REPRESENTATIVE.entries()) {
    await expect(visibleHeading(page, ex.name)).toBeVisible();
    for (const [j, set] of ex.today.entries()) {
      const n = j + 1;
      if (set.w !== null) {
        const box = page.getByLabel(`Set ${n} weight in pounds`);
        if ((await box.inputValue()) !== String(set.w)) {
          // The offer is selected on focus, so typing replaces it.
          await c.tap(box, `Set ${n} weight (to change it)`);
          await c.type(String(set.w));
          await expect(box).toHaveValue(String(set.w));
        }
      } else {
        await expect(page.getByLabel(/weight in pounds/)).toHaveCount(0);
      }
      await c.focusField(page.getByLabel(`Set ${n} reps`), `Set ${n} reps`);
      await c.type(String(set.r));
      await c.tap(
        page.getByRole("button", { name: `Log set ${n}` }),
        `Log set ${n}`,
      );
      await expect(loggedRow(page, n)).toBeVisible();
      if (n < ex.today.length) {
        // Focus follows the confirmed write to the next set's reps.
        await expect
          .poll(() => isFocused(page.getByLabel(`Set ${n + 1} reps`)))
          .toBe(true);
        if (set.w !== null) {
          // Reuse: the next set offers the weight just logged.
          await expect(
            page.getByLabel(`Set ${n + 1} weight in pounds`),
          ).toHaveValue(String(set.w));
          await expect(page.getByText(`same as set ${n}`)).toBeVisible();
        }
      }
    }
    await expect(
      page.getByText(`All ${ex.sets} sets logged.`).filter({ visible: true }),
    ).toBeVisible();
    const primary =
      i < REPRESENTATIVE.length - 1
        ? page.getByRole("button", {
            name: `Next: ${REPRESENTATIVE[i + 1].name}`,
          })
        : page.getByRole("button", { name: "Finish workout" });
    // After the last planned set, focus lands on Next / Finish.
    await expect.poll(() => isFocused(primary)).toBe(true);
    await c.tap(primary, i < REPRESENTATIVE.length - 1 ? "Next" : "Finish");
  }
  await expect(page).toHaveURL(/\/$/);

  console.log(
    `[tap-count] AFTER taps=${c.taps} keystrokes=${c.keystrokes} (before: taps=${PITCH4_BASELINE.taps} keystrokes=${PITCH4_BASELINE.keystrokes})\n${c.log.join("\n")}`,
  );
  expect(c.taps).toBeLessThan(PITCH4_BASELINE.taps);
  expect(c.taps).toBeLessThanOrEqual(18);

  // Exactly what was confirmed — the bodyweight sets with no weight at all.
  expect(await loggedSetsOn(seeded.userId, seeded.today)).toEqual(
    expectedToday(),
  );
  expect(await workoutStatus(seeded.userId, seeded.today)).toBe("complete");
  expect(await pushdownBaseline(seeded.userId, seeded.downtownGymId)).toBe(
    PUSHDOWN_BASELINE_LBS,
  );
  await ctx.close();
});

test("AC-3 and AC-2: nothing is written without Log set; fewer visible controls; correcting from the card", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({
    ...PHONE_CONTEXT,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await signUpThroughApp(page, Q);
  const seeded = await seedRepresentativeWorkout(Q.email);
  const history = await setCount(seeded.userId);
  await startRepresentativeWorkout(page);
  const bench = REPRESENTATIVE[0].name;
  await expect(visibleHeading(page, bench)).toBeVisible();

  // Prepared but not confirmed: the offered weight and typed reps.
  await expect(page.getByLabel("Set 1 weight in pounds")).toHaveValue("185");
  await expect(page.getByText("last time", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Set 1 reps")).toHaveValue("");
  await page.getByLabel("Set 1 reps").tap();
  await page.keyboard.type("8");
  await page.getByRole("button", { name: /^Next: / }).tap();
  await page.getByRole("button", { name: "Previous" }).tap();
  await expect(visibleHeading(page, bench)).toBeVisible();
  expect(await setCount(seeded.userId)).toBe(history);
  await page.reload();
  await expect(visibleHeading(page, bench)).toBeVisible();
  expect(await setCount(seeded.userId)).toBe(history);
  // Changing the gym (allowed before the first set) writes no set either.
  await page.getByRole("button", { name: "Change gym" }).tap();
  await page.getByLabel("Campus Rec Center").check();
  await page.getByRole("button", { name: "Save gym" }).tap();
  await expect(page.getByText("Campus Rec Center").first()).toBeVisible();
  await page.getByRole("button", { name: "Change gym" }).tap();
  await page.getByLabel("Downtown Gym").check();
  await page.getByRole("button", { name: "Save gym" }).tap();
  expect(await setCount(seeded.userId)).toBe(history);

  // Confirmed: exactly one set, exactly as entered.
  await page.getByLabel("Set 1 reps").tap();
  await page.keyboard.type("8");
  await page.getByRole("button", { name: "Log set 1" }).tap();
  await expect(loggedRow(page, 1)).toBeVisible();
  expect(await setCount(seeded.userId)).toBe(history + 1);
  expect(await loggedSetsOn(seeded.userId, seeded.today)).toEqual([
    { exercise: bench, setNumber: 1, weightLbs: 185, reps: 8 },
  ]);
  // Set 2's offer sits in its box, unconfirmed, through Next/Previous.
  await expect(page.getByLabel("Set 2 weight in pounds")).toHaveValue("185");
  await page.getByRole("button", { name: /^Next: / }).tap();
  await page.getByRole("button", { name: "Previous" }).tap();
  await expect(visibleHeading(page, bench)).toBeVisible();
  expect(await setCount(seeded.userId)).toBe(history + 1);

  // AC-2: a 3-set card with set 1 logged, plus the runner bar.
  const card = page
    .locator("div.rounded-lg")
    .filter({ has: visibleHeading(page, bench) });
  const cardControls = await card
    .locator("input:visible, button:visible, a:visible")
    .count();
  const barControls = 2; // Previous, Next
  console.log(`[controls] AFTER card=${cardControls} bar=${barControls}`);
  expect(cardControls + barControls).toBeLessThanOrEqual(8);

  // Phone sizing: one line at 375 and 320, 44px targets, no sideways scroll.
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 740 });
    const boxes = await Promise.all(
      [
        page.getByLabel("Set 2 weight in pounds"),
        page.getByLabel("Set 2 reps"),
        page.getByRole("button", { name: "Log set 2" }),
      ].map((l) => l.boundingBox()),
    );
    const tops = boxes.map((b) => Math.round(b!.y + b!.height / 2));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
    expect(boxes[2]!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await loggedRow(page, 1).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await page.getByRole("button", { name: "Previous" }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${SHOTS}/card-${width}-light.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize(PHONE_CONTEXT.viewport);

  // Journey G: correct set 1 from the card through History's dialog.
  const stored = await loggedSetsOn(seeded.userId, seeded.today);
  await loggedRow(page, 1).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: `Edit set 1 — ${bench}` }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Weight (lbs)")).toHaveValue("185");
  await expect(dialog.getByLabel("Reps")).toHaveValue("8");
  await dialog.getByLabel("Reps").fill("7");
  await dialog.getByRole("button", { name: "Save" }).tap();
  await expect(page.getByText("Set updated")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Set 1, 185 pounds, 7 reps, logged/ }),
  ).toBeVisible();
  expect(await setCount(seeded.userId)).toBe(history + 1);
  expect(await loggedSetsOn(seeded.userId, seeded.today)).toEqual([
    { ...stored[0], reps: 7 },
  ]);

  // Dark appearance renders the same states (fidelity screenshots).
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(visibleHeading(page, bench)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/card-375-dark.png`, fullPage: true });
  await ctx.close();
});
