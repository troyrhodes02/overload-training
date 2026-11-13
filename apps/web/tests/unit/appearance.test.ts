jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));

import fs from "node:fs";
import path from "node:path";
import { refresh } from "next/cache";
import { requireAccount } from "@/lib/data/account";
import { updateAppearanceAction } from "@/app/(app)/settings/actions";
import {
  APPEARANCES,
  APPEARANCE_STORAGE_KEY,
  THEME_COLORS,
  isAppearance,
  type Appearance,
} from "@/lib/appearance/appearance";
import { applyAppearance } from "@/lib/appearance/apply";
import { APPEARANCE_BOOT_SCRIPT } from "@/lib/appearance/boot-script";

/**
 * Appearance preference (Personalization & Navigation Polish, spec §14.5):
 * the value set, the save action's contract, the document applier, and the
 * first-paint boot script. Isolation against a real database lives in
 * tests/integration/isolation/profile.int.test.ts.
 */

// --- a minimal stand-in for the parts of the DOM the applier touches ---------
type FakeMeta = { media: string; content: string };
function fakeDocument(
  metas: FakeMeta[] = [
    { media: "(prefers-color-scheme: light)", content: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", content: THEME_COLORS.dark },
  ],
) {
  const classes = new Set<string>();
  const appended: { removed: boolean }[] = [];
  const doc = {
    documentElement: {
      classList: {
        toggle: (c: string, on: boolean) =>
          on ? classes.add(c) : classes.delete(c),
        add: (c: string) => classes.add(c),
      },
      offsetHeight: 0,
    },
    head: { appendChild: (el: { removed: boolean }) => appended.push(el) },
    createElement: () => {
      const el = {
        textContent: "",
        removed: false,
        remove() {
          el.removed = true;
        },
      };
      return el;
    },
    querySelectorAll: () =>
      metas.map((m) => ({
        getAttribute: () => m.media,
        setAttribute: (_: string, v: string) => {
          m.content = v;
        },
      })),
  };
  return { doc: doc as unknown as Document, classes, metas, appended };
}

function fakeStorage(initial?: string, throws = false) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(APPEARANCE_STORAGE_KEY, initial);
  return {
    data,
    storage: {
      getItem: (k: string) => {
        if (throws) throw new Error("blocked");
        return data.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (throws) throw new Error("blocked");
        data.set(k, v);
      },
    } as unknown as Storage,
  };
}

describe("appearance values", () => {
  it("are exactly Light, Dark, and System", () => {
    expect([...APPEARANCES].sort()).toEqual(["dark", "light", "system"]);
  });

  it.each(["system", "light", "dark"])("accepts %s", (v) => {
    expect(isAppearance(v)).toBe(true);
  });

  it.each([["System"], [""], [null], [undefined], [1], [{}], ["auto"]])(
    "rejects %p",
    (v) => {
      expect(isAppearance(v)).toBe(false);
    },
  );

  it("the root layout's browser chrome colors come from THEME_COLORS", () => {
    const layout = fs.readFileSync(
      path.join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("THEME_COLORS.light");
    expect(layout).toContain("THEME_COLORS.dark");
    expect(layout).not.toMatch(/#f7f7f8|#0b0b0c/i);
    expect(layout).toContain("APPEARANCE_BOOT_SCRIPT");
  });
});

describe("updateAppearanceAction", () => {
  const updateMany = jest.fn();
  const account = {
    userId: "acting-user",
    timeZone: "UTC",
    db: { profile: { updateMany } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockResolvedValue(account);
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("saves a valid choice for the acting account only and re-renders", async () => {
    const result = await updateAppearanceAction("dark");
    expect(result).toEqual({ ok: true, data: { appearance: "dark" } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "acting-user" },
      data: { appearance: "dark" },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores anything a client adds besides the value (no account id input)", async () => {
    const call = updateAppearanceAction as unknown as (
      ...args: unknown[]
    ) => ReturnType<typeof updateAppearanceAction>;
    await call("light", { userId: "someone-else" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "acting-user" },
      data: { appearance: "light" },
    });
  });

  it.each([["purple"], [""], [null], [{ appearance: "dark" }]])(
    "rejects %p without writing or re-rendering",
    async (v) => {
      const result = await updateAppearanceAction(v);
      expect(result).toEqual({
        ok: false,
        error: {
          code: "validation_error",
          message: "Choose Light, Dark, or System.",
        },
      });
      expect(updateMany).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("a missing profile is not-found, and an unexpected failure is the plain message", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const missing = await updateAppearanceAction("dark");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("not_found");

    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    updateMany.mockRejectedValueOnce(new Error("db down"));
    const failed = await updateAppearanceAction("dark");
    spy.mockRestore();
    expect(failed).toEqual({
      ok: false,
      error: {
        code: "internal_error",
        message: "Couldn't save your appearance. Try again.",
      },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("applyAppearance", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it.each<[Appearance, string[], string, string]>([
    ["dark", ["dark"], THEME_COLORS.dark, THEME_COLORS.dark],
    ["light", ["light"], THEME_COLORS.light, THEME_COLORS.light],
    ["system", [], THEME_COLORS.light, THEME_COLORS.dark],
  ])(
    "%s → html classes %p, browser chrome per mode",
    (appearance, cls, lightMeta, darkMeta) => {
      const { doc, classes, metas } = fakeDocument();
      const { storage, data } = fakeStorage();
      // Start from the opposite explicit state to prove classes are replaced.
      classes.add(appearance === "dark" ? "light" : "dark");
      applyAppearance(appearance, doc, () => storage);
      expect([...classes].sort()).toEqual(cls);
      expect(metas.map((m) => m.content)).toEqual([lightMeta, darkMeta]);
      expect(data.get(APPEARANCE_STORAGE_KEY)).toBe(appearance);
    },
  );

  it("is idempotent", () => {
    const { doc, classes } = fakeDocument();
    const { storage } = fakeStorage();
    applyAppearance("dark", doc, () => storage);
    applyAppearance("dark", doc, () => storage);
    expect([...classes]).toEqual(["dark"]);
  });

  it("suspends transitions for the switch, then restores them", () => {
    const { doc, appended } = fakeDocument();
    applyAppearance("dark", doc, () => undefined);
    expect(appended).toHaveLength(1);
    expect(appended[0].removed).toBe(false);
    jest.runAllTimers();
    expect(appended[0].removed).toBe(true);
  });

  it("still switches when storage is blocked", () => {
    const { doc, classes } = fakeDocument();
    const { storage } = fakeStorage(undefined, true);
    expect(() => applyAppearance("light", doc, () => storage)).not.toThrow();
    expect([...classes]).toEqual(["light"]);
  });

  it("is a no-op without a document (server)", () => {
    expect(() => applyAppearance("dark", undefined)).not.toThrow();
  });
});

describe("boot script", () => {
  function boot(stored?: string, throws = false) {
    const { doc, classes, metas } = fakeDocument();
    const { storage } = fakeStorage(stored, throws);
    // The script reads window.localStorage and document, nothing else.
    const run = new Function("window", "document", APPEARANCE_BOOT_SCRIPT);
    expect(() => run({ localStorage: storage }, doc)).not.toThrow();
    return { classes, metas };
  }

  it("paints an explicit Dark before hydration, chrome included", () => {
    const { classes, metas } = boot("dark");
    expect([...classes]).toEqual(["dark"]);
    expect(metas.every((m) => m.content === THEME_COLORS.dark)).toBe(true);
  });

  it("paints an explicit Light", () => {
    const { classes, metas } = boot("light");
    expect([...classes]).toEqual(["light"]);
    expect(metas.every((m) => m.content === THEME_COLORS.light)).toBe(true);
  });

  it.each([["system"], [undefined], ["garbage"], ['dark"<script>']])(
    "leaves the device in charge for %p",
    (stored) => {
      const { classes, metas } = boot(stored);
      expect([...classes]).toEqual([]);
      expect(metas.map((m) => m.content)).toEqual([
        THEME_COLORS.light,
        THEME_COLORS.dark,
      ]);
    },
  );

  it("never throws when storage is blocked", () => {
    expect([...boot(undefined, true).classes]).toEqual([]);
  });

  it("carries no account data and makes no request", () => {
    expect(APPEARANCE_BOOT_SCRIPT).not.toMatch(
      /fetch|XMLHttpRequest|cookie|userId|supabase|import\(/i,
    );
  });
});

describe("appearance is changed only in Settings (no toggle elsewhere)", () => {
  const SRC = path.join(process.cwd(), "src");
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return files(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });
  const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
  const users = (re: RegExp) =>
    files(SRC)
      .filter((f) => re.test(fs.readFileSync(f, "utf8")))
      .map(rel)
      .sort();

  it("only the Settings island calls the save action", () => {
    expect(users(/\bupdateAppearanceAction\s*\(/)).toEqual([
      "app/(app)/settings/actions.ts",
      "components/settings/appearance-setting.tsx",
    ]);
  });

  it("only the Settings island and the shell sync apply an appearance", () => {
    expect(users(/\bapplyAppearance\s*\(/)).toEqual([
      "components/settings/appearance-setting.tsx",
      "components/shell/appearance-sync.tsx",
      "lib/appearance/apply.ts",
    ]);
  });
});
