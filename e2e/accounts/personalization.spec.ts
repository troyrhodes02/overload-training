import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { skipFirstTour } from "./tour-support";

/**
 * Personalization & Navigation Polish against the LOCAL Supabase stack
 * (spec §14.8): the greeting for a new account, the appearance preference
 * (default, instant, persistent, per account, System live), phone navigation
 * through the sheet, the unchanged desktop rail, and a missing timezone.
 * Serial; only temporary accounts are created, and each is removed through
 * the app's own deletion flow.
 */

test.describe.configure({ mode: "serial" });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const DB_URL = process.env.DATABASE_URL ?? "";
if (
  !/^http:\/\/127\.0\.0\.1:/.test(URL_) ||
  !/^postgresql:\/\/[^@]*@127\.0\.0\.1:/.test(DB_URL)
) {
  throw new Error(
    "The Personalization suite runs against the local stack only.",
  );
}
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const tag = String(stamp).slice(-8);
const P = {
  email: `e2e-${stamp}-p@example.test`,
  password: "pers-pass-123",
  username: `e2e_p_${tag}`,
};
const Q = {
  email: `e2e-${stamp}-q@example.test`,
  password: "pers-pass-456",
  username: `e2e_q_${tag}`,
};
const PHONE = { width: 375, height: 812 };

let ctx: BrowserContext;
let page: Page;

const htmlClass = (p: Page) =>
  p.evaluate(() => document.documentElement.className.trim());
const backgroundToken = (p: Page) =>
  p.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim(),
  );
/**
 * Wait for the sheet's slide-in to finish, as a person's tap would. (A scrim
 * tap within the first few hundred ms of re-opening, right after a quick
 * close, can be ignored by Radix's dismiss layer — the run report records it.)
 */
async function openSheet(p: Page) {
  await p.getByRole("button", { name: "Open navigation" }).click();
  const sheet = p.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished)),
  );
  return sheet;
}

const checkedAppearance = (p: Page) =>
  p.getByRole("radio", { checked: true }).getAttribute("value");

async function signUp(p: Page, who: typeof P, firstName: string) {
  await p.goto("/signup");
  await p.getByLabel("First name").fill(firstName);
  await p.getByLabel("Last name").fill("Tester");
  await p.getByLabel("Username").fill(who.username);
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password", { exact: true }).fill(who.password);
  await p.getByLabel("Confirm password", { exact: true }).fill(who.password);
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p).toHaveURL(/\/$/);
  // A new account's first page opens the onboarding tour; dismiss it.
  await skipFirstTour(p);
}

async function signIn(p: Page, who: typeof P) {
  await p.goto("/login");
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password", { exact: true }).fill(who.password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL(/\/$/);
}

async function newContext(browser: Browser, colorScheme: "light" | "dark") {
  return browser.newContext({
    timezoneId: "America/Denver",
    viewport: PHONE,
    colorScheme,
  });
}

async function userExists(email: string): Promise<boolean> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.some((u) => u.email === email);
}

/** Test-only: write this suite's own temporary profile directly. */
async function setOwnTimeZone(email: string, zone: string) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query(
      `UPDATE profiles SET time_zone = $1
        WHERE user_id = (SELECT id FROM auth.users WHERE email = $2)`,
      [zone, email],
    );
  } finally {
    await db.end();
  }
}

test.beforeAll(async ({ browser }) => {
  ctx = await newContext(browser, "light");
  page = await ctx.newPage();
});

test.afterAll(async ({ browser }) => {
  await ctx?.close();
  for (const who of [P, Q]) {
    if (!(await userExists(who.email))) continue;
    const c = await newContext(browser, "light");
    const p = await c.newPage();
    await signIn(p, who);
    await p.goto("/settings/delete-account");
    await p.getByLabel("Password", { exact: true }).fill(who.password);
    await p.getByRole("button", { name: "Delete account permanently" }).click();
    await expect(p).toHaveURL(/\/login\?notice=deleted$/);
    await c.close();
  }
});

test("a first visit without a plan gets a welcome that implies no workout", async () => {
  await signUp(page, P, "Robin");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(
    /^(Welcome to Overload, Robin\.|Welcome, Robin\.)$/,
  );
  const text = await heading.textContent();
  expect(text).not.toMatch(/ up|today|done|logged|session|workout/i);
  await expect(page.getByText("No active plan.")).toBeVisible();
  // Stable across a reload.
  await page.reload();
  await expect(heading).toHaveText(text ?? "");
});

test("appearance: System by default, Dark applies at once and persists", async ({
  browser,
}) => {
  await page.goto("/");
  expect(await htmlClass(page)).toBe("");

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  expect(await checkedAppearance(page)).toBe("system");

  await page.getByText("Dark", { exact: true }).click();
  // Immediately — before any navigation or reload.
  expect(await htmlClass(page)).toBe("dark");
  expect(await backgroundToken(page)).toBe("#0b0b0c");
  await expect(page.getByText("Appearance: Dark.")).toBeAttached();

  // A reload paints Dark from the first frame (boot script), not after hydration.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __dcl: string }).__dcl =
        document.documentElement.className;
    });
  });
  await page.reload();
  expect(
    await page.evaluate(() => (window as unknown as { __dcl: string }).__dcl),
  ).toContain("dark");
  expect(await checkedAppearance(page)).toBe("dark");

  // Another device (no local mirror) gets the account's choice after sign-in.
  const other = await newContext(browser, "light");
  const p2 = await other.newPage();
  await signIn(p2, P);
  await expect.poll(() => htmlClass(p2)).toBe("dark");
  await other.close();
});

test("appearance: System follows the device live; Light overrides a dark device", async () => {
  await page.goto("/settings");
  await page.getByText("System", { exact: true }).click();
  await expect.poll(() => htmlClass(page)).toBe("");
  await expect(page.getByText("Appearance: System.")).toBeAttached();

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => backgroundToken(page)).toBe("#f7f7f8");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => backgroundToken(page)).toBe("#0b0b0c");

  await page.getByText("Light", { exact: true }).click();
  await expect.poll(() => htmlClass(page)).toBe("light");
  await expect.poll(() => backgroundToken(page)).toBe("#f7f7f8");
  await page.reload();
  expect(await checkedAppearance(page)).toBe("light");
  await page.emulateMedia({ colorScheme: "light" });
});

test("another account's appearance is its own", async ({ browser }) => {
  const c = await newContext(browser, "light");
  const q = await c.newPage();
  await signUp(q, Q, "Quinn");
  await expect.poll(() => htmlClass(q)).toBe("");
  await q.goto("/settings");
  expect(await checkedAppearance(q)).toBe("system");
  await q.getByText("Dark", { exact: true }).click();
  await expect(q.getByText("Appearance: Dark.")).toBeAttached();
  await c.close();
  // P's choice is unchanged by Q's.
  await page.goto("/settings");
  expect(await checkedAppearance(page)).toBe("light");
});

test("phone: no bottom bar; the sheet lists every destination and closes on choice", async () => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  // The rail (and the old bottom bar) is not shown on a phone.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(menu).toBeVisible();
  await menu.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link")).toHaveText([
    "Today",
    "Plan",
    "History",
    "Goals",
    "Exercises",
    "Gyms",
    "Settings",
  ]);
  await expect(sheet.getByRole("link", { name: "Today" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(sheet.getByRole("link", { name: "Today" })).toBeFocused();

  await sheet.getByRole("link", { name: "Goals" }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Escape closes and returns focus to the menu button.
  await menu.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(menu).toBeFocused();

  // The scrim closes it too.
  await openSheet(page);
  await page.mouse.click(360, 400);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // On Settings, Settings is the current item.
  await page.goto("/settings");
  await menu.click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Settings" }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");

  // Thumb-reach bars sit at the bottom edge now.
  await page.goto("/gyms");
  const bar = page.locator("div.fixed", {
    has: page.getByRole("link", { name: /Add gym/ }),
  });
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((el) => getComputedStyle(el).bottom)).toBe("0px");
});

test("desktop: the rail and header are unchanged; no menu button", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeHidden();
  const rail = page.getByRole("navigation", { name: "Primary" });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("link")).toHaveText([
    "Today",
    "Plan",
    "History",
    "Goals",
    "Exercises",
    "Gyms",
  ]);
  const railStyle = await rail.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      width: s.width,
      position: s.position,
      borderRight: s.borderRightWidth,
      borderTop: s.borderTopWidth,
    };
  });
  // md:w-56 md:sticky md:border-r md:border-t-0 — Foundation's rail.
  expect(railStyle).toEqual({
    width: "224px",
    position: "sticky",
    borderRight: "1px",
    borderTop: "0px",
  });
  const headerPadding = await page
    .locator("header")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return [
        s.paddingTop,
        s.paddingRight,
        s.paddingBottom,
        s.paddingLeft,
        s.position,
      ];
    });
  expect(headerPadding).toEqual(["12px", "16px", "12px", "16px", "static"]);
});

test("a missing timezone still gets a sensible greeting, not an error", async () => {
  await setOwnTimeZone(P.email, "Not/AZone");
  await page.setViewportSize(PHONE);
  await page.goto("/");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(/^(Welcome|Hello)/);
  await expect(page.getByText("No active plan.")).toBeVisible();
  await setOwnTimeZone(P.email, "America/Denver");
});

/** Test-only: make this suite's own temporary account look pre-usernames. */
async function clearOwnUsername(email: string) {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    await db.query(
      `UPDATE profiles SET username = NULL
        WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)`,
      [email],
    );
  } finally {
    await db.end();
  }
}

test("an account from before usernames can still save Settings without one (OVE-50)", async () => {
  await clearOwnUsername(P.email);
  await page.goto("/settings");
  await expect(page.getByLabel("Username")).toHaveValue("");
  await page.getByLabel("Timezone").selectOption("Europe/Berlin");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/Berlin");
  await expect(page.getByLabel("Username")).toHaveValue("");
  // Choosing one later works; after that it can't be cleared.
  await page.getByLabel("Username").fill(P.username);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await page.getByLabel("Username").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Choose a username.")).toBeVisible();
  await expect(page.getByLabel("Username")).toBeFocused();
});
