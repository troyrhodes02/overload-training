import {
  exportFilename,
  isAccountExport,
  serializeAccountExport,
} from "@overload/shared/accounts/export-file";
import { proHighlights } from "@/lib/billing/pro-highlights";

describe("the shared export file (Pitch 21j RD-12)", () => {
  it("names the file as the web always has", () => {
    expect(exportFilename("2026-11-24")).toBe(
      "overload-export-2026-11-24.json",
    );
  });

  it("serializes as two-space JSON", () => {
    expect(serializeAccountExport({ a: 1, b: [2] })).toBe(
      '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}',
    );
  });

  it("accepts only a complete export of the known format", () => {
    expect(
      isAccountExport({ formatVersion: 1, exportedOn: "2026-11-24", x: [] }),
    ).toBe(true);
    for (const bad of [
      null,
      [],
      "text",
      { formatVersion: 2, exportedOn: "2026-11-24" },
      { formatVersion: 1 },
      { formatVersion: 1, exportedOn: "Nov 24" },
    ]) {
      expect(isAccountExport(bad)).toBe(false);
    }
  });
});

describe("proHighlights for the app (Pitch 21j RD-15)", () => {
  it("says plan import is on the web, and the web wording is unchanged", () => {
    const app = proHighlights({ planImportEnabled: true, client: "app" });
    const web = proHighlights({ planImportEnabled: true });
    expect(app.length).toBe(web.length);
    expect(app.find((l) => /import/i.test(l))).toMatch(/, on the web$/);
    expect(web.find((l) => /import/i.test(l))).not.toMatch(/on the web/);
  });
});
