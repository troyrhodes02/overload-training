/**
 * OVE-203 (Pitch 21e Checkpoint A): a failed read says what failed. The
 * owner saw "Couldn't load History — There's nothing here." because the app
 * talked to a server without the 21e routes and printed the catch-all 404's
 * message as the explanation.
 */
import { ApiError } from "../src/api/errors";
import { describeLoadError } from "../src/api/load-error";

jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { environment: "staging" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => null,
}));

const history = { subject: "History", request: "GET /history" };

describe("describeLoadError", () => {
  it("the Checkpoint A case: a route this server lacks is a version mismatch, not content", () => {
    const view = describeLoadError(
      new ApiError("not_found", "There's nothing here.", 404),
      history,
      true,
    );
    expect(view.title).toBe("History isn't available from this server");
    expect(view.message).not.toContain("nothing here");
    expect(view.technical).toBe("GET /history → 404 not_found");
  });

  it("names each kind of failure", () => {
    const title = (e: ApiError, byId = false) =>
      describeLoadError(e, { ...history, byId }, false).title;
    expect(title(new ApiError("network", "x"))).toBe("Can't reach Overload");
    expect(title(new ApiError("unavailable", "x", 502))).toBe(
      "Overload isn't responding",
    );
    expect(title(new ApiError("staging_protected", "x", 401))).toBe(
      "Overload isn't responding",
    );
    expect(title(new ApiError("signed_out", "x"))).toBe("You're signed out");
    expect(title(new ApiError("unauthorized", "x", 401))).toBe(
      "You're signed out",
    );
    expect(title(new ApiError("not_found", "x", 404), true)).toBe(
      "This workout isn't available.",
    );
    expect(title(new ApiError("internal_error", "x", 500))).toBe(
      "Overload isn't responding",
    );
    const other = describeLoadError(
      new ApiError("validation_error", "Invalid week.", 400),
      history,
      false,
    );
    expect([other.title, other.message]).toEqual([
      "Couldn't load history",
      "Invalid week.",
    ]);
  });

  it("shows the technical line only when diagnostics are available", () => {
    const e = new ApiError("network", "x");
    expect(describeLoadError(e, history, false).technical).toBeNull();
    expect(describeLoadError(e, history, true).technical).toBe(
      "GET /history → no answer network",
    );
  });
});
