import {
  exportReducer,
  filenameFromDisposition,
  type ExportState,
} from "@/components/settings/data-export-section";

/**
 * The "Your data" export card's state machine (Public Accounts design Screen 8).
 * Pure functions, so they are unit-testable without a DOM: idle → preparing on
 * start, back to idle on success (the toast carries the signal), and error on
 * failure, from which another start returns to preparing.
 */
describe("exportReducer (design Screen 8)", () => {
  it("start moves idle → preparing", () => {
    expect(exportReducer("idle", { type: "start" })).toBe("preparing");
  });

  it("success returns to idle (the toast, not a state, is the success)", () => {
    expect(exportReducer("preparing", { type: "succeed" })).toBe("idle");
  });

  it("failure shows the error state", () => {
    expect(exportReducer("preparing", { type: "fail" })).toBe("error");
  });

  it("retrying from error starts preparing again", () => {
    const afterError: ExportState = exportReducer("preparing", {
      type: "fail",
    });
    expect(afterError).toBe("error");
    expect(exportReducer(afterError, { type: "start" })).toBe("preparing");
  });
});

describe("filenameFromDisposition", () => {
  it("reads the server-chosen filename from the header", () => {
    expect(
      filenameFromDisposition(
        'attachment; filename="overload-export-2026-10-29.json"',
        "fallback.json",
      ),
    ).toBe("overload-export-2026-10-29.json");
  });

  it("falls back when the header is absent", () => {
    expect(filenameFromDisposition(null, "fallback.json")).toBe(
      "fallback.json",
    );
  });
});
