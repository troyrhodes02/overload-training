import fs from "node:fs";
import path from "node:path";
import {
  appearanceSaveInFlight,
  createChoiceTracker,
} from "@/lib/appearance/choices";

/**
 * Appearance save ordering (spec R7; review findings on #62): the last
 * choice wins, a failure reverts to what the account really holds, and the
 * shell stands aside while a save is in flight.
 */

describe("createChoiceTracker", () => {
  it("one successful choice: no revert, it becomes confirmed", () => {
    const t = createChoiceTracker("system");
    const s = t.begin();
    expect(t.settle(s, "dark", true)).toEqual({
      isLatest: true,
      revertTo: null,
    });
    expect(t.confirmed).toBe("dark");
  });

  it("one failed choice reverts to the starting value", () => {
    const t = createChoiceTracker("system");
    const s = t.begin();
    expect(t.settle(s, "dark", false)).toEqual({
      isLatest: true,
      revertTo: "system",
    });
  });

  it("Dark saved, then Light failed → revert to Dark (what the account holds)", () => {
    const t = createChoiceTracker("system");
    const dark = t.begin();
    const light = t.begin();
    // Dark's success arrives while Light is still in flight: not the latest,
    // so the screen keeps Light — but Dark is now what is stored.
    expect(t.settle(dark, "dark", true)).toEqual({
      isLatest: false,
      revertTo: null,
    });
    expect(t.settle(light, "light", false)).toEqual({
      isLatest: true,
      revertTo: "dark",
    });
  });

  it("Dark failed, then Light saved → Light stands, no revert", () => {
    const t = createChoiceTracker("system");
    const dark = t.begin();
    const light = t.begin();
    expect(t.settle(dark, "dark", false).revertTo).toBeNull();
    expect(t.settle(light, "light", true)).toEqual({
      isLatest: true,
      revertTo: null,
    });
    expect(t.confirmed).toBe("light");
  });

  it("an earlier tap's late success never overrides a newer confirmed value", () => {
    const t = createChoiceTracker("system");
    const a = t.begin();
    const b = t.begin();
    t.settle(b, "light", true);
    t.settle(a, "dark", true); // out of order: older seq
    expect(t.confirmed).toBe("light");
  });

  it("reports saves in flight until every one has settled", () => {
    expect(appearanceSaveInFlight()).toBe(false);
    const t = createChoiceTracker("system");
    const a = t.begin();
    const b = t.begin();
    expect(appearanceSaveInFlight()).toBe(true);
    t.settle(a, "dark", true);
    expect(appearanceSaveInFlight()).toBe(true);
    t.settle(b, "light", true);
    expect(appearanceSaveInFlight()).toBe(false);
  });
});

describe("wiring", () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");

  it("the shell does not re-apply the layout's value while a save is in flight", () => {
    const sync = read("components/shell/appearance-sync.tsx");
    expect(sync).toMatch(
      /if \(appearanceSaveInFlight\(\)\) return;\s*applyAppearance\(appearance\);/,
    );
  });

  it("the Settings island treats a thrown action as a failed save", () => {
    const island = read("components/settings/appearance-setting.tsx");
    expect(island).toMatch(
      /try \{[\s\S]*updateAppearanceAction[\s\S]*\} catch \{/,
    );
    expect(island).toMatch(/choices\.settle\(seq, value, ok\)/);
  });
});
