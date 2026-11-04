/**
 * Demo screenshot capture (Public Landing Page & Changelog, spec §13, RD-19;
 * pitch Appendix A items 2 and 6). Drives a REAL browser against the app
 * running on the isolated LOCAL stack. Never a mockup, never production.
 *
 *   # 0. local stack env exported (see the runbook); app built + started on
 *   #    DEMO_APP_URL (loopback), signup open on THAT local server only.
 *   npm run demo:capture -- signup   # create the demo account through the
 *                                    # app's own /signup page; prints its id
 *   npm run demo:seed -- --user-id <id> --execute --confirm-user <id>
 *   npm run demo:capture -- shots    # sign in, capture the storyboard
 *
 * The account is created by the normal signup flow (Appendix A's preferred
 * path: trial, tour, and release-notes state exactly as for any lifter). The
 * guard runs first; DEMO_APP_URL and every database/Supabase variable must be
 * loopback. Images are written to public/marketing/screens/ and their
 * provenance printed for src/lib/marketing/screenshots.ts.
 */
import path from "node:path";
import type { Locator } from "@playwright/test";
import {
  DemoSeedRefused,
  assertSafeEnvironment,
  isLoopbackHost,
} from "./guard";

const OUT_DIR = path.join(process.cwd(), "public", "marketing", "screens");
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type Device = "desktop" | "phone";
type Appearance = "light" | "dark";

async function main() {
  const mode = process.argv[2];
  // Optional: `--only today,logging` re-takes just those shots.
  const onlyArg = process.argv.indexOf("--only");
  const only =
    onlyArg > -1 ? new Set((process.argv[onlyArg + 1] ?? "").split(",")) : null;
  // Views first in EVERY variant, then the logging card (which starts today's
  // workout through the app) — so no Today shot ever shows "Resume workout".
  const phases: Set<string>[] = only
    ? [only]
    : [
        new Set([
          "today",
          "exercise",
          "trend",
          "gym-northside",
          "gym-riverside",
        ]),
        new Set(["logging"]),
      ];
  let phase: Set<string> = phases[0];
  const want = (name: string) => phase.has(name);
  if (mode !== "signup" && mode !== "shots")
    fail("Usage: demo:capture -- signup | shots");

  let databaseUrl: string;
  try {
    ({ databaseUrl } = assertSafeEnvironment(process.env));
  } catch (error) {
    if (error instanceof DemoSeedRefused) fail(`REFUSED: ${error.message}`);
    throw error;
  }
  const appUrl = process.env.DEMO_APP_URL ?? "";
  let appHost: string | null = null;
  try {
    appHost = new URL(appUrl).hostname;
  } catch {
    /* refused below */
  }
  if (!isLoopbackHost(appHost))
    fail("REFUSED: DEMO_APP_URL must be the loopback local app.");
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.DEMO_PASSWORD ?? "";
  if (!email.endsWith(".test"))
    fail("DEMO_EMAIL must be a reserved .test address (synthetic).");
  if (password.length < 12) fail("DEMO_PASSWORD must be 12+ characters.");

  const { chromium } = await import("@playwright/test");
  const { Client } = await import("pg");
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
  });

  try {
    if (mode === "signup") {
      const page = await (
        await browser.newContext({
          baseURL: appUrl,
          timezoneId: "America/Chicago",
        })
      ).newPage();
      await page.goto("/signup");
      await page.getByLabel("First name").fill("Demo");
      await page.getByLabel("Last name").fill("Lifter");
      await page.getByLabel("Username").fill(
        `demo_${email
          .split("@")[0]
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 12)}`,
      );
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByLabel("Confirm password", { exact: true }).fill(password);
      const create = page.getByRole("button", { name: "Create account" });
      await create.waitFor();
      // Cloudflare's local test widget passes on its own; wait for it.
      await page.waitForFunction(
        () =>
          !(
            document.querySelector(
              'button[type="submit"]',
            ) as HTMLButtonElement | null
          )?.disabled,
        undefined,
        { timeout: 30_000 },
      );
      await create.click();
      await page.waitForURL((u) => u.pathname === "/", { timeout: 30_000 });
      const r = await db.query<{ id: string }>(
        "SELECT id::text AS id FROM auth.users WHERE lower(email) = $1",
        [email],
      );
      console.log(
        `Signed up through the app. Demo account id: ${r.rows[0]?.id}`,
      );
      return;
    }

    // ---- shots ----------------------------------------------------------
    const ids = await db.query<{ id: string; source_id: string }>(
      `SELECT id::text AS id, source_id FROM exercises
        WHERE source_id IN ('Barbell_Bench_Press_-_Medium_Grip','Leverage_Chest_Press')`,
    );
    const benchId = ids.rows.find((r) =>
      r.source_id.startsWith("Barbell_Bench"),
    )!.id;
    const chestId = ids.rows.find(
      (r) => r.source_id === "Leverage_Chest_Press",
    )!.id;
    const owner = await db.query<{ id: string }>(
      "SELECT id::text AS id FROM auth.users WHERE lower(email) = $1",
      [email],
    );
    const userId = owner.rows[0]?.id;
    if (!userId)
      throw new Error("No demo account with that email on the local stack.");
    const gyms = await db.query<{ id: string; name: string }>(
      "SELECT id::text AS id, name FROM gyms WHERE user_id = $1::uuid",
      [userId],
    );
    const gym = (name: string) => gyms.rows.find((g) => g.name === name)!.id;

    const shots: { file: string; device: Device; appearance: Appearance }[] =
      [];

    for (phase of phases)
      for (const appearance of ["light", "dark"] as Appearance[]) {
        for (const device of ["desktop", "phone"] as Device[]) {
          const context = await browser.newContext({
            baseURL: appUrl,
            viewport: device === "phone" ? PHONE : DESKTOP,
            deviceScaleFactor: 2,
            isMobile: device === "phone",
            hasTouch: device === "phone",
            colorScheme: appearance,
            timezoneId: "America/Chicago",
          });
          const page = await context.newPage();
          await page.goto("/login");
          await page.getByLabel("Email").fill(email);
          await page.getByLabel("Password", { exact: true }).fill(password);
          await page.getByRole("button", { name: "Sign in" }).click();
          await page.waitForURL((u) => u.pathname === "/");
          // A first visit offers the tour; skip it (persisted per account).
          const skip = page.getByRole("button", { name: /^Skip/ });
          if (await skip.isVisible().catch(() => false)) await skip.click();
          // Settle fonts and streamed content.
          await page.waitForLoadState("networkidle");

          const vw = (device === "phone" ? PHONE : DESKTOP).width;
          const record = (name: string) => {
            const file = `${name}-${appearance}-${device}.png`;
            shots.push({ file, device, appearance });
            return path.join(OUT_DIR, file);
          };
          /**
           * Down to just below `last`. On a phone: the whole screen width from
           * the top (header included). On desktop: only the app's content
           * column (`main`), so the product isn't shrunk by the side rail and
           * margins when it sits in a landing-page frame.
           */
          const saveDownTo = async (name: string, last: Locator) => {
            const box = await last.boundingBox();
            const scrollY = await page.evaluate(() => window.scrollY);
            const bottom = box
              ? Math.ceil(box.y + scrollY + box.height + 40)
              : (device === "phone" ? PHONE : DESKTOP).height;
            if (device === "phone") {
              await page.screenshot({
                path: record(name),
                fullPage: true,
                clip: { x: 0, y: 0, width: vw, height: bottom },
              });
              return;
            }
            const main = (await page.locator("main").first().boundingBox())!;
            const top = Math.max(0, Math.floor(main.y + scrollY));
            await page.screenshot({
              path: record(name),
              fullPage: true,
              clip: {
                x: main.x,
                y: top,
                width: main.width,
                height: bottom - top,
              },
            });
          };
          /** A band of the page from `first` down to `last`. */
          const saveBand = async (
            name: string,
            first: Locator,
            last: Locator,
          ) => {
            await first.scrollIntoViewIfNeeded();
            const a = await first.boundingBox();
            const b = await last.boundingBox();
            if (!a || !b) return;
            const pad = 24;
            const y = Math.max(
              0,
              a.y + (await page.evaluate(() => scrollY)) - pad,
            );
            const bottom =
              b.y + b.height + (await page.evaluate(() => scrollY));
            await page.screenshot({
              path: record(name),
              fullPage: true,
              clip: {
                x: Math.max(0, a.x - pad),
                y,
                width: Math.min(
                  vw - Math.max(0, a.x - pad),
                  b.x + b.width - a.x + 2 * pad,
                ),
                height: Math.ceil(bottom - y + pad),
              },
            });
          };

          // 1. Today: the plan with the calls beside each lift.
          if (want("today")) {
            await page.goto("/");
            await page.waitForLoadState("networkidle");
            await saveDownTo(
              "today",
              page.getByRole("link", { name: /Start workout|Resume workout/ }),
            );
          }

          if (want("exercise") || want("trend")) {
            // 3 + 5. The exercise page's call and records, then its trend.
            await page.goto(`/exercises/${benchId}`);
            await page.waitForLoadState("networkidle");
            await saveDownTo(
              "exercise",
              page.getByText("Working sets of finished workouts").first(),
            );
            await saveBand(
              "trend",
              page.getByRole("heading", { name: /^Trend/ }),
              page.getByText(/sessions · Epley estimate/).first(),
            );
          }
          if (want("gym-northside") || want("gym-riverside")) {
            // 4. One machine, two gyms.
            for (const [name, gymName] of [
              ["gym-northside", "Northside Strength"],
              ["gym-riverside", "Riverside Fitness"],
            ] as const) {
              await page.goto(`/exercises/${chestId}?gym=${gym(gymName)}`);
              await page.waitForLoadState("networkidle");
              await saveDownTo(
                name,
                page.getByText(/^Stay at|^Try \d|^Last time/).first(),
              );
            }
          }
          if (want("logging")) {
            // 2. The logging card, through the app's own Start workout (last, as
            //    it begins today's workout; later variants resume the same one).
            await page.goto("/");
            await page
              .getByRole("link", { name: /Start workout|Resume workout/ })
              .click();
            await page.waitForURL((u) => u.pathname.startsWith("/log/"));
            if (new URL(page.url()).pathname.startsWith("/log/start")) {
              await page
                .getByText("Northside Strength", { exact: true })
                .click();
              await page.getByRole("button", { name: "Start logging" }).click();
              await page.waitForURL((u) =>
                /^\/log\/[0-9a-f-]{36}/.test(u.pathname),
              );
            }
            await page.waitForLoadState("networkidle");
            await page
              .getByText(/^Last time/)
              .first()
              .waitFor();
            await saveDownTo(
              "logging",
              page.getByRole("button", { name: /^Next|^Finish/ }).first(),
            );
          }
          await context.close();
        }
      }
    console.log(
      `Captured ${shots.length} images into public/marketing/screens/.`,
    );
    for (const s of shots) console.log(`  ${s.file}`);
  } finally {
    await browser.close();
    await db.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
