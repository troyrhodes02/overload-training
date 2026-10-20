import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { skipFirstTour, tourCard } from "./tour-support";

/**
 * What's New against the LOCAL Supabase stack (spec §14.3; R22, R28): the
 * auth gate on the history page, a new account's first loads (the tour owns
 * them, and no What's New dialog appears — the shipped catalog is empty), the
 * Settings entry point and the page at phone and desktop widths, and that
 * nothing touches training data. The dialog itself can't be reached while
 * the shipped catalog is empty and no test-only content switch exists in
 * production code; its behavior is proven by the integration suite and the
 * recorded browser walkthrough. Serial; only temporary accounts are created,
 * and each is removed through the app's own deletion flow.
 */

test.describe.configure({ mode: "serial" });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:/.test(URL_)) {
  throw new Error("The What's New suite runs against the local stack only.");
}
const DB_URL = process.env.DATABASE_URL ?? "";
if (!/^postgresql:\/\/[^@]*@127\.0\.0\.1:/.test(DB_URL)) {
  throw new Error("The What's New suite runs against the local stack only.");
}
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const tag = String(stamp).slice(-8);
const W = {
  email: `e2e-${stamp}-whatsnew@example.test`,
  password: "whats-new-pass-123",
  username: `e2e_wn_${tag}`,
};

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

const contexts: BrowserContext[] = [];
async function newPage(browser: Browser, viewport = PHONE): Promise<Page> {
  const ctx = await browser.newContext({
    timezoneId: "America/Chicago",
    viewport,
  });
  contexts.push(ctx);
  return ctx.newPage();
}

async function userExists(email: string): Promise<boolean> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.some((u) => u.email === email);
}

async function signIn(p: Page) {
  await p.goto("/login");
  await p.getByLabel("Email").fill(W.email);
  await p.getByLabel("Password", { exact: true }).fill(W.password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL(/\/$/);
}

async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return (await db.query(text, params)).rows as T[];
  } finally {
    await db.end();
  }
}

const TRAINING_TABLES = [
  "mesocycles",
  "sessions",
  "session_exercises",
  "logged_sessions",
  "logged_exercises",
  "logged_sets",
  "gym_exercise_baselines",
  "goals",
  "cardio_logs",
  "gyms",
];
async function trainingCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TRAINING_TABLES) {
    const [r] = await sql<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${t}"`,
    );
    out[t] = r.n;
  }
  return out;
}

const whatsNewDialog = (p: Page) =>
  p.getByRole("dialog", { name: "What's new" });

let before: Record<string, number>;

test.beforeAll(async () => {
  before = await trainingCounts();
});

test.afterAll(async ({ browser }) => {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  if (await userExists(W.email)) {
    const p = await newPage(browser);
    await signIn(p);
    await p.goto("/settings/delete-account");
    await p.getByLabel("Password", { exact: true }).fill(W.password);
    await p.getByRole("button", { name: "Delete account permanently" }).click();
    await expect(p).toHaveURL(/\/login\?notice=deleted$/);
    await p.context().close();
  }
  // What's New never touches training data (spec §5 invariants).
  expect(await trainingCounts()).toEqual(before);
});

test("the What's New page requires an auth session", async ({ browser }) => {
  const p = await newPage(browser);
  await p.goto("/settings/whats-new");
  await expect(p).toHaveURL(/\/login/);
  await expect(p.getByRole("heading", { name: "What's New" })).toHaveCount(0);
});

test("a new account's first load is the tour, never a What's New dialog — and nothing appears after it either", async ({
  browser,
}) => {
  const p = await newPage(browser, PHONE);
  await p.goto("/signup");
  await p.getByLabel("First name").fill("Robin");
  await p.getByLabel("Last name").fill("Tester");
  await p.getByLabel("Username").fill(W.username);
  await p.getByLabel("Email").fill(W.email);
  await p.getByLabel("Password", { exact: true }).fill(W.password);
  await p.getByLabel("Confirm password", { exact: true }).fill(W.password);
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p).toHaveURL(/\/$/);
  await expect(tourCard(p)).toBeVisible({ timeout: 20_000 });
  await expect(whatsNewDialog(p)).toHaveCount(0);
  await skipFirstTour(p);
  await p.reload();
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
  // Give a dialog every chance to open before asserting it never does.
  await p.waitForTimeout(2_000);
  await expect(whatsNewDialog(p)).toHaveCount(0);
  // The shipped catalog is empty: a new account has no starting point yet,
  // and nothing is unseen (spec R8, R10).
  const rows = await sql(
    `SELECT 1 FROM release_seen WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)`,
    [W.email],
  );
  expect(rows).toEqual([]);
});

for (const [label, viewport] of [
  ["375", PHONE],
  ["1280", DESKTOP],
] as const) {
  test(`at ${label}: Settings → What's New → the page (empty at launch) → back`, async ({
    browser,
  }) => {
    const p = await newPage(browser, viewport);
    await signIn(p);
    await expect(whatsNewDialog(p)).toHaveCount(0);
    await p.goto("/settings");
    const headings = await p.locator("main h2").allInnerTexts();
    const tour = headings.indexOf("Tour");
    const whatsNew = headings.indexOf("What's New");
    const deletion = headings.indexOf("Delete account");
    expect(tour).toBeGreaterThan(-1);
    expect(whatsNew).toBe(tour + 1);
    expect(deletion).toBeGreaterThan(whatsNew);

    const link = p.getByRole("link", { name: "See what's new" });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.height).toBe(label === "375" ? 44 : 36);
    await link.click();
    await expect(p).toHaveURL(/\/settings\/whats-new$/);
    await expect(p).toHaveTitle("What's New · Overload");
    await expect(
      p.getByRole("heading", { level: 1, name: "What's New" }),
    ).toBeVisible();
    await expect(
      // The previous route stays mounted (hidden); assert the visible one.
      p
        .getByText("Every update to Overload, newest first.")
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      p.getByText(
        "No updates yet. When something changes in Overload, it's listed here.",
      ),
    ).toBeVisible();
    expect(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await p
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();
    await expect(p).toHaveURL(/\/settings$/);
    await p.context().close();
  });
}
