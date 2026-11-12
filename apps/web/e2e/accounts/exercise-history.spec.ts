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
  withDb,
} from "./support/representative-workout";

/**
 * Exercise History & PR Intelligence against the LOCAL Supabase stack (spec
 * §14.3): the page's values for a real history (Next time, records, trend
 * views, sessions with their calls, goals), a machine's two gyms kept apart,
 * a correction in History flowing through, the entry points, empty / sparse /
 * bodyweight states, no horizontal overflow at 320 and 375, and reading
 * writing nothing. Screenshots at 375 light and 1280 dark for comparison with
 * the preview. One temporary account, removed through the app.
 */

test.describe.configure({ mode: "serial" });

const WHO = tempAccount("hist");
const SHOTS = "test-results/exercise-history";
const BENCH = REPRESENTATIVE[0].name; // 3 × 6–8
const PUSHDOWN = REPRESENTATIVE[2].name; // cable, 3 × 10–12

test.afterAll(async ({ browser }) => {
  if (!(await accountExists(WHO.email))) return;
  const c = await browser.newContext();
  await deleteThroughApp(await c.newPage(), WHO);
  await c.close();
});

const visible = (p: Page, text: string | RegExp) =>
  p.getByText(text, { exact: typeof text === "string" }).filter({
    visible: true,
  });

async function exerciseId(name: string): Promise<string> {
  return withDb(async (db) => {
    const r = await db.query<{ id: string }>(
      "SELECT id FROM exercises WHERE user_id IS NULL AND name = $1",
      [name],
    );
    if (r.rowCount !== 1) throw new Error(`No library exercise ${name}`);
    return r.rows[0].id;
  });
}

/** A finished Triceps Pushdown session at Campus Rec Center, 3 days before the seeded one. */
async function pushdownAtCampus(userId: string, campusId: string) {
  await withDb(async (db) => {
    const last = await db.query<{
      mesocycle_id: string;
      scheduled_for: string;
      exercise_id: string;
    }>(
      `SELECT ls.mesocycle_id, ls.scheduled_for::text AS scheduled_for, le.exercise_id
         FROM logged_sessions ls
         JOIN logged_exercises le ON le.logged_session_id = ls.id
         JOIN exercises e ON e.id = le.exercise_id
        WHERE ls.user_id = $1 AND ls.status = 'complete' AND e.name = $2
        ORDER BY ls.scheduled_for DESC LIMIT 1`,
      [userId, PUSHDOWN],
    );
    const r = last.rows[0];
    await db.query("BEGIN");
    const ls = (
      await db.query<{ id: string }>(
        `INSERT INTO logged_sessions (id, user_id, mesocycle_id, performed_on, scheduled_for, status, completed_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3::date - 3 + time '18:00', $3::date - 3, 'complete', $3::date - 3 + time '19:00', now()) RETURNING id`,
        [userId, r.mesocycle_id, r.scheduled_for],
      )
    ).rows[0].id;
    const le = (
      await db.query<{ id: string }>(
        `INSERT INTO logged_exercises (id, user_id, logged_session_id, exercise_id, gym_id, position, planned_exercise_id, planned_sets, target_rep_min, target_rep_max, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, $3, 3, 10, 12, now()) RETURNING id`,
        [userId, ls, r.exercise_id, campusId],
      )
    ).rows[0].id;
    for (let i = 1; i <= 3; i++) {
      await db.query(
        `INSERT INTO logged_sets (id, user_id, logged_exercise_id, set_number, weight_lbs, reps, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 40, 12, now() - interval '40 days', now())`,
        [userId, le, i],
      );
    }
    await db.query("COMMIT");
  });
}

async function addBenchGoal(userId: string, benchId: string) {
  await withDb((db) =>
    db.query(
      `INSERT INTO goals (id, user_id, exercise_id, target_weight_lbs, target_reps, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 225, 5, 'active', now())`,
      [userId, benchId],
    ),
  );
}

async function noHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => {
    const cw = document.documentElement.clientWidth;
    // Name the widest offenders so a failure says what to fix.
    const wide = [...document.querySelectorAll("main *")]
      // Screen-reader-only content is clipped by its wrapper, not visible.
      .filter((e) => !e.closest(".sr-only"))
      .filter((e) => e.getBoundingClientRect().right > cw + 1)
      .slice(0, 5)
      .map(
        (e) =>
          `${e.tagName.toLowerCase()}.${String(e.getAttribute("class") ?? "").slice(0, 60)} → ${Math.round(e.getBoundingClientRect().right)}`,
      );
    return { sw: document.documentElement.scrollWidth, cw, wide };
  });
  expect({ overflow: r.sw > r.cw, wide: r.wide }).toEqual({
    overflow: false,
    wide: [],
  });
}

test("an exercise's history: records, trend, sessions with their calls, goals, gyms apart", async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const ctx = await browser.newContext(PHONE_CONTEXT);
  const page = await ctx.newPage();
  await signUpThroughApp(page, WHO);
  const seeded = await seedRepresentativeWorkout(WHO.email);
  await benchHistoryAllTop(seeded.userId); // last time: 185 × 8, 8, 8
  await addEarlierBenchSession(seeded.userId); // the week before: 185 × 8, 8, 8
  await pushdownAtCampus(seeded.userId, seeded.campusGymId);
  const benchId = await exerciseId(BENCH);
  const pushdownId = await exerciseId(PUSHDOWN);
  await addBenchGoal(seeded.userId, benchId);
  const sets = await setCount(seeded.userId);

  // --- Bench (free weight): the whole page, 375 light -------------------
  await page.goto(`/exercises/${benchId}`);
  await expect(page.getByRole("heading", { name: "Next time" })).toBeVisible();
  await expect(visible(page, "Try 190 lb next time (+5 lb)")).toBeVisible();
  await expect(
    visible(page, "8 reps on every set, 2 sessions running"),
  ).toBeVisible();
  const records = page.getByRole("region", { name: /^Records/ });
  await expect(records).toContainText("Best set185 × 8lb");
  await expect(records).toContainText("Best e1RM · estimate234lbfrom 185 × 8");
  await expect(records).toContainText("Heaviest weight185 × 8");
  await expect(
    records.getByRole("table", { name: /Rep records/ }),
  ).toContainText("185 lb8");
  const sessions = page.getByRole("region", { name: "Sessions" });
  await expect(sessions.locator("li")).toHaveCount(2);
  await expect(sessions.locator("li").first()).toContainText("Progress");
  await expect(sessions.locator("li").first()).toContainText("185 × 8 · 8 · 8");
  await expect(sessions.locator("li").nth(1)).toContainText(
    "Not enough history",
  );
  const goals = page.getByRole("region", { name: "Goals" });
  await expect(goals).toContainText("225 lb × 5");
  await expect(goals).toContainText("89%");
  await page.getByRole("tab", { name: "Weight" }).tap();
  const weightPanel = page.getByRole("tabpanel");
  await expect(weightPanel).toContainText("Last185 lb");
  await expect(weightPanel).toContainText("2 sessions · heaviest working set");
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `${SHOTS}/bench-375-light.png`,
    fullPage: true,
  });

  // Goal page → back to the history.
  await goals.getByRole("link", { name: /225 lb × 5/ }).tap();
  await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/);
  await page
    .getByRole("link", { name: "Exercise history ›" })
    .filter({ visible: true })
    .first()
    .tap();
  await expect(page).toHaveURL(new RegExp(`/exercises/${benchId}`));

  // --- Pushdown (cable): one gym's book at a time (AC-2) ----------------
  await page.goto(`/exercises/${pushdownId}`);
  await expect(visible(page, "History at")).toBeVisible();
  const selectBox = page.getByRole("combobox", {
    name: "Gym for this history",
  });
  await expect(selectBox).toHaveText(/Downtown Gym/);
  const pdRecords = page.getByRole("region", { name: /Records/ });
  await expect(pdRecords).toContainText("Records · Downtown Gym");
  await expect(pdRecords).toContainText("50 × 12");
  await expect(pdRecords).not.toContainText("40 ×");
  await selectBox.tap();
  await page.getByRole("option", { name: "Campus Rec Center" }).tap();
  await expect(page).toHaveURL(new RegExp(`gym=${seeded.campusGymId}`));
  await expect(pdRecords).toContainText("Records · Campus Rec Center");
  await expect(pdRecords).toContainText("40 × 12");
  await expect(pdRecords).not.toContainText("50 ×");
  await expect(
    visible(
      page,
      "Not enough history yet at Campus Rec Center: 1 of 2 complete sessions.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/pushdown-campus-375-light.png`,
    fullPage: true,
  });

  // --- Empty, sparse, bodyweight -----------------------------------------
  const neverLogged = await withDb(async (db) => {
    const r = await db.query<{ id: string }>(
      `SELECT id FROM exercises WHERE user_id IS NULL AND equipment_type = 'cable'
         AND name <> $1 ORDER BY name LIMIT 1`,
      [PUSHDOWN],
    );
    return r.rows[0].id;
  });
  await page.goto(`/exercises/${neverLogged}`);
  await expect(
    visible(
      page,
      "No sets logged yet. Log it in a workout and its sessions, records, and trend show up here.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Records" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();

  await page.goto(`/exercises/${await exerciseId(REPRESENTATIVE[1].name)}`);
  await expect(
    visible(page, "Not enough history yet: 1 of 2 complete sessions."),
  ).toBeVisible();
  await expect(visible(page, /^One session so far: e1RM \d+ lb/)).toBeVisible();

  await page.goto(`/exercises/${await exerciseId(REPRESENTATIVE[3].name)}`);
  await expect(page.locator("main")).toContainText("Most reps in a set");
  await expect(page.locator("main")).toContainText("18 · 15 reps");
  await expect(page.locator("main")).not.toContainText(/\blb\b|e1RM/);
  await expect(
    visible(
      page,
      "Goals use a weight × reps target, so reps-only lifts don't have them.",
    ),
  ).toBeVisible();

  // --- 320: nothing scrolls sideways --------------------------------------
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/exercises/${pushdownId}?gym=${seeded.downtownGymId}`);
  await expect(visible(page, "History at")).toBeVisible();
  await noHorizontalOverflow(page);
  await page.goto(`/exercises/${benchId}`);
  await noHorizontalOverflow(page);
  await page.setViewportSize({ width: 375, height: 812 });

  // --- Entry point: workout detail names link to their history ------------
  // The seeded workout is last week's; open it directly (the History week
  // view starts at the current week).
  const lastWorkout = await withDb(async (db) => {
    const r = await db.query<{ id: string }>(
      `SELECT ls.id FROM logged_sessions ls
         JOIN logged_exercises le ON le.logged_session_id = ls.id
        WHERE ls.user_id = $1 AND le.exercise_id = $2
        ORDER BY ls.scheduled_for DESC LIMIT 1`,
      [seeded.userId, pushdownId],
    );
    return r.rows[0].id;
  });
  await page.goto(`/history/${lastWorkout}`);
  await expect(
    page.getByRole("link", { name: PUSHDOWN, exact: true }),
  ).toHaveAttribute(
    "href",
    `/exercises/${pushdownId}?gym=${seeded.downtownGymId}`,
  );
  // Correction journey: last time's set 3 goes from 8 to 7.
  const benchCard = page
    .locator("div.rounded-lg")
    .filter({ hasText: BENCH })
    .first();
  await benchCard.getByRole("button", { name: "edit" }).nth(2).tap();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reps").fill("7");
  await dialog.getByRole("button", { name: "Save" }).tap();
  await expect(page.getByText("Set updated")).toBeVisible();
  await page.getByRole("link", { name: BENCH, exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/exercises/${benchId}$`));
  await expect(visible(page, "Stay at 185 lb next time")).toBeVisible();
  await expect(sessions.locator("li").first()).toContainText("Hold");
  await expect(sessions.locator("li").first()).toContainText("185 × 8 · 8 · 7");
  await expect(page.getByText("Try 190 lb next time (+5 lb)")).toHaveCount(0);

  // Reading wrote nothing: the correction was an edit, not a new set.
  expect(await setCount(seeded.userId)).toBe(sets);

  // --- 1280 dark ----------------------------------------------------------
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Records" })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: `${SHOTS}/bench-1280-dark.png`,
    fullPage: true,
  });
  await page.goto(`/exercises/${pushdownId}`);
  await expect(page.getByRole("region", { name: /^Records/ })).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/pushdown-1280-dark.png`,
    fullPage: true,
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 375, height: 812 });

  // --- Entry point: the card links to the right book ----------------------
  await startRepresentativeWorkout(page);
  await expect(
    page
      .getByRole("link", { name: "View history ›" })
      .filter({ visible: true }),
  ).toHaveAttribute("href", `/exercises/${benchId}`);
  await page
    .getByRole("button", { name: `Next: ${REPRESENTATIVE[1].name}` })
    .tap();
  await page.getByRole("button", { name: `Next: ${PUSHDOWN}` }).tap();
  await expect(
    page
      .getByRole("link", { name: "View history ›" })
      .filter({ visible: true }),
  ).toHaveAttribute(
    "href",
    `/exercises/${pushdownId}?gym=${seeded.downtownGymId}`,
  );
  await ctx.close();
});
