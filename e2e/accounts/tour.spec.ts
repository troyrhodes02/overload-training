import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { TOUR_STEPS } from "../../src/lib/tour/steps";
import { tourCard } from "./tour-support";

/**
 * Onboarding Tour against the LOCAL Supabase stack (spec §14.3; R28): the
 * first-login tour, its play-through at phone and desktop widths (the standing
 * D4 check: every step points at a control that exists on its screen at that
 * width), Done / Skip / Escape / abandoning, replay from Settings, and
 * isolation between accounts. Serial; only temporary accounts are created,
 * and each is removed through the app's own deletion flow.
 */

test.describe.configure({ mode: "serial" });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:/.test(URL_)) {
  throw new Error(
    "The Onboarding Tour suite runs against the local stack only.",
  );
}
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const tag = String(stamp).slice(-8);
const account = (k: string) => ({
  email: `e2e-${stamp}-tour-${k}@example.test`,
  password: `tour-pass-${k}-123`,
  username: `e2e_t${k}_${tag}`,
});
const T = account("t"); // finishes the tour
const S = account("s"); // skips it
const E = account("e"); // abandons it
const ALL = [T, S, E];

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

/** What an empty account's tour points at, step by step (design doc Screen 2). */
const PHONE_TARGETS = [
  "today-heading",
  "today-day",
  "nav-menu",
  "page-plan",
  "page-history",
  "page-goals",
  "page-gyms",
  "settings-replay",
];
const DESKTOP_TARGETS = [
  "today-heading",
  "today-day",
  "nav-plan",
  "nav-history",
  "nav-goals",
  "nav-gyms",
  "settings-replay",
];
const PHONE_ROUTES = [
  "/",
  "/",
  "/",
  "/plan",
  "/history",
  "/goals",
  "/gyms",
  "/settings",
];
const DESKTOP_ROUTES = [
  "/",
  "/",
  "/plan",
  "/history",
  "/goals",
  "/gyms",
  "/settings",
];

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

async function signUp(p: Page, who: typeof T) {
  await p.goto("/signup");
  await p.getByLabel("First name").fill("Robin");
  await p.getByLabel("Last name").fill("Tester");
  await p.getByLabel("Username").fill(who.username);
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password", { exact: true }).fill(who.password);
  await p.getByLabel("Confirm password", { exact: true }).fill(who.password);
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p).toHaveURL(/\/$/);
}

async function signIn(p: Page, who: typeof T) {
  await p.goto("/login");
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password", { exact: true }).fill(who.password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL(/\/$/);
}

async function signOut(p: Page) {
  await p.getByRole("button", { name: "Account menu" }).click();
  await p.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(p).toHaveURL(/\/login/);
}

/** Wait until step `n` of `total` is fully shown (not loading). */
async function shownStep(p: Page, n: number, total: number) {
  const card = tourCard(p);
  await expect(card.locator("p").first()).toHaveText(`Step ${n} of ${total}`, {
    timeout: 20_000,
  });
  await expect(card.getByRole("button", { name: /^(Next|Done)$/ })).toBeEnabled(
    { timeout: 20_000 },
  );
  await expect(p.locator("[data-tour-spotlight]")).toBeAttached();
  // Let the spotlight settle on its target.
  await p.waitForTimeout(250);
}

/**
 * The anchor the spotlight is drawn around: the [data-tour] element whose
 * box, inflated by the spotlight padding, equals the spotlight's box — and
 * that element really is visible.
 */
function spotlitAnchor(p: Page) {
  return p.evaluate(() => {
    const spot = document
      .querySelector("[data-tour-spotlight]")
      ?.getBoundingClientRect();
    if (!spot) return null;
    const near = (a: number, b: number) => Math.abs(a - b) < 1.5;
    const el = [...document.querySelectorAll<HTMLElement>("[data-tour]")].find(
      (e) => {
        const r = e.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          near(r.left - 6, spot.left) &&
          near(r.top - 6, spot.top) &&
          near(r.width + 12, spot.width) &&
          near(r.height + 12, spot.height)
        );
      },
    );
    return el ? el.getAttribute("data-tour") : null;
  });
}

/** No phone navigation sheet is open (Radix Sheet content). */
const sheetOpen = (p: Page) => p.locator('[data-slot="sheet-content"]').count();

/**
 * Walks the whole tour from step 1, asserting each step's route, target,
 * focus, and that the phone sheet stays closed. Ends by pressing Done.
 */
async function playThrough(
  p: Page,
  routes: string[],
  targets: string[],
): Promise<void> {
  const total = targets.length;
  for (let n = 1; n <= total; n++) {
    await shownStep(p, n, total);
    expect(new URL(p.url()).pathname).toBe(routes[n - 1]);
    const anchor = await spotlitAnchor(p);
    expect([n, anchor]).toEqual([n, targets[n - 1]]);
    // The anchor is one the registry step itself names.
    const step = TOUR_STEPS.find((s) =>
      s.targets.some((t) => t.anchor === anchor),
    );
    expect(step?.route).toBe(routes[n - 1]);
    expect(await sheetOpen(p)).toBe(0);
    const primary = tourCard(p).getByRole("button", {
      name: n === total ? "Done" : "Next",
    });
    await expect(primary).toBeFocused();
    await primary.click();
  }
  await expect(tourCard(p)).toHaveCount(0);
}

async function replay(p: Page) {
  await p.goto("/settings");
  await p.getByRole("button", { name: "Replay tour" }).click();
}

test.afterAll(async ({ browser }) => {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  for (const who of ALL) {
    if (!(await userExists(who.email))) continue;
    const p = await newPage(browser);
    await signIn(p, who);
    await p.goto("/settings/delete-account");
    await p.getByLabel("Password", { exact: true }).fill(who.password);
    await p.getByRole("button", { name: "Delete account permanently" }).click();
    await expect(p).toHaveURL(/\/login\?notice=deleted$/);
    await p.context().close();
  }
});

test("first login opens the tour; at 375 it walks every area on its phone target and Done returns to Today", async ({
  browser,
}) => {
  const p = await newPage(browser, PHONE);
  await signUp(p, T);
  await playThrough(p, PHONE_ROUTES, PHONE_TARGETS);
  await expect(p).toHaveURL(/\/$/);
  // The rail is never a phone target, and nothing is left over the page.
  expect(
    PHONE_TARGETS.some((a) => a.startsWith("nav-") && a !== "nav-menu"),
  ).toBe(false);
  await expect(p.getByRole("dialog")).toHaveCount(0);
  // The page is usable: the phone menu opens and a destination navigates.
  await p.getByRole("button", { name: "Open navigation" }).click();
  await p.getByRole("dialog").getByRole("link", { name: "Goals" }).click();
  await expect(p).toHaveURL(/\/goals$/);
  await expect(
    p.getByRole("heading", { level: 1, name: "Goals" }),
  ).toBeVisible();
});

test("a finished tour never opens by itself again: reload, sign out and in", async ({
  browser,
}) => {
  const p = await newPage(browser, PHONE);
  await signIn(p, T);
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
  await p.reload();
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
  await signOut(p);
  await signIn(p, T);
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
});

test("replay at 1280 walks the same tour on desktop targets and Done returns to Settings, focused on Replay tour", async ({
  browser,
}) => {
  const p = await newPage(browser, DESKTOP);
  await signIn(p, T);
  await replay(p);
  await playThrough(p, DESKTOP_ROUTES, DESKTOP_TARGETS);
  await expect(p).toHaveURL(/\/settings$/);
  await expect(p.getByRole("button", { name: "Replay tour" })).toBeFocused();
  // The menu button is never a desktop target, and the replay re-armed nothing.
  expect(DESKTOP_TARGETS).not.toContain("nav-menu");
  await p.reload();
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
});

test("crossing md mid-tour re-picks the target (rail item ↔ heading)", async ({
  browser,
}) => {
  const p = await newPage(browser, DESKTOP);
  await signIn(p, T);
  await replay(p);
  await shownStep(p, 1, 7);
  await tourCard(p).getByRole("button", { name: "Next" }).click();
  await shownStep(p, 2, 7);
  await tourCard(p).getByRole("button", { name: "Next" }).click();
  await shownStep(p, 3, 7);
  expect(await spotlitAnchor(p)).toBe("nav-plan");
  await p.setViewportSize(PHONE);
  await expect
    .poll(() => spotlitAnchor(p), { timeout: 10_000 })
    .toBe("page-plan");
  await expect(tourCard(p).locator("p").first()).toHaveText(/of 8$/);
  await tourCard(p).getByRole("button", { name: "Skip tour" }).click();
  await expect(tourCard(p)).toHaveCount(0);
});

test("another new account still gets its first tour; Skip closes it in place and it never returns", async ({
  browser,
}) => {
  const p = await newPage(browser, PHONE);
  await signUp(p, S);
  await shownStep(p, 1, 8);
  await tourCard(p).getByRole("button", { name: "Next" }).click();
  await shownStep(p, 2, 8);
  // Keyboard: Tab stays inside the card.
  for (let i = 0; i < 4; i++) {
    await p.keyboard.press("Tab");
    expect(
      await p.evaluate(
        () => !!document.activeElement?.closest("[data-tour-card]"),
      ),
    ).toBe(true);
  }
  await tourCard(p).getByRole("button", { name: "Skip tour" }).click();
  await expect(tourCard(p)).toHaveCount(0);
  await expect(p).toHaveURL(/\/$/);
  await p.reload();
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
  await signOut(p);
  await signIn(p, S);
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
});

test("a skipped account can replay from Settings; Escape ends a replay like Skip", async ({
  browser,
}) => {
  const p = await newPage(browser, PHONE);
  await signIn(p, S);
  await replay(p);
  await shownStep(p, 1, 8);
  await expect(p).toHaveURL(/\/$/);
  await p.keyboard.press("Escape");
  await expect(tourCard(p)).toHaveCount(0);
  await expect(p).toHaveURL(/\/$/);
  await p.reload();
  await p.waitForTimeout(2500);
  await expect(tourCard(p)).toHaveCount(0);
});

test("abandoning the first tour (a reload mid-tour) spends it; browser Back ends a replay", async ({
  browser,
}) => {
  const p = await newPage(browser, PHONE);
  await signUp(p, E);
  await shownStep(p, 1, 8);
  await p.reload();
  await p.waitForTimeout(3000);
  await expect(tourCard(p)).toHaveCount(0);
  // Browser Back during a replay ends it and leaves the page usable.
  await replay(p);
  for (const n of [1, 2, 3]) {
    await shownStep(p, n, 8);
    await tourCard(p).getByRole("button", { name: "Next" }).click();
  }
  await shownStep(p, 4, 8);
  await expect(p).toHaveURL(/\/plan$/);
  await p.goBack();
  await expect(tourCard(p)).toHaveCount(0);
  await expect(p).toHaveURL(/\/$/);
  await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
});
