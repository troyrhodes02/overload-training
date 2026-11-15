/**
 * Pitch 21d review audit #10: one app-version rule for the API and the app.
 * The web's version module re-exports the shared parser, and the app's gate
 * agrees with it on every edge case.
 */
import * as shared from "@overload/shared/mobile/app-version";
import * as web from "@/lib/api/mobile/version";

describe("shared app-version rule", () => {
  it("the API uses the shared parser and comparator", () => {
    expect(web.parseAppVersion).toBe(shared.parseAppVersion);
    expect(web.compareAppVersions).toBe(shared.compareAppVersions);
  });

  it("is strict: no leading zeros, suffixes, or oversized parts", () => {
    for (const bad of [
      "01.2.0",
      "1.2",
      "1.2.0-beta",
      "1.2.3.4",
      "1000000.0.0",
      " ",
      "",
    ]) {
      expect(shared.parseAppVersion(bad)).toBeNull();
    }
    expect(shared.parseAppVersion(" 0.10.2 ")).toEqual([0, 10, 2]);
    expect(shared.compareAppVersions([0, 10, 0], [0, 9, 9])).toBe(1);
  });
});
