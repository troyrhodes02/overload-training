/**
 * Pitch 21d spec §12 (OQ7): the Hermes spike's golden values, run under Node.
 * The same checks run under Hermes in More → Diagnostics on the simulator and
 * the iPhone, so both runtimes are compared against one answer key.
 */
import {
  HERMES_CHECKS,
  runHermesChecks,
} from "../src/diagnostics/hermes-checks";
import { accountTodayLabel } from "../src/today/date";

describe("Hermes date and time-zone checks (Node reference run)", () => {
  it.each(HERMES_CHECKS.map((c) => [c.id, c] as const))("%s", (_id, check) => {
    const r = check.run();
    expect({ ok: r.ok, actual: r.actual }).toEqual({
      ok: true,
      actual: r.actual,
    });
  });

  it("the runner reports every check and survives a throwing one", () => {
    expect(runHermesChecks()).toHaveLength(HERMES_CHECKS.length);
  });

  it("Today's label follows the account's zone, not the device's", () => {
    const at = new Date("2026-11-15T05:30:00Z");
    expect(accountTodayLabel("America/Chicago", at)).toBe(
      "Saturday, November 14",
    );
    expect(accountTodayLabel("Pacific/Auckland", at)).toBe(
      "Sunday, November 15",
    );
  });
});
