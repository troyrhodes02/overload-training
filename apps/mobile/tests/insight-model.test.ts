/**
 * Pitch 21g spec §5, §7: the card's call is picked from the SERVER's fields
 * only, and a read that is in flight or failed never shows an older call.
 */
import type { OccurrenceProgressionDto } from "@overload/shared/contracts/progression";
import {
  callForCard,
  callLabel,
  callWord,
  chipFor,
  insightFor,
} from "../src/workout/insight-model";

const done = { isFetching: false, isError: false, hasData: true };

const call = (
  over: Partial<OccurrenceProgressionDto> = {},
): OccurrenceProgressionDto => ({
  loggedExerciseId: "le-1",
  scheduledDeloadWeek: false,
  tag: "progress",
  rirEffect: null,
  suggestion: { lbs: 185, kind: "progress_increment" },
  historyHref: null,
  recommendation: {
    kind: "progress",
    tone: "strong",
    action: "Try 185 lb today (+5 lb)",
    evidence: "8 reps on every set, 2 sessions running",
  },
  locked: null,
  insufficientNote: null,
  ...over,
});

describe("insightFor", () => {
  it("a Progress call: chip, strong action, evidence, spoken word", () => {
    expect(insightFor(done, call())).toEqual({
      kind: "call",
      chip: { label: "Progress", tone: "progress" },
      strong: true,
      action: "Try 185 lb today (+5 lb)",
      evidence: "8 reps on every set, 2 sessions running",
      spokenWord: "Progress",
    });
  });

  it("a hold has no chip, a quiet line, and still a spoken word", () => {
    const v = insightFor(
      done,
      call({
        tag: null,
        suggestion: null,
        recommendation: {
          kind: "hold",
          tone: "quiet",
          action: "Stay at 180 lb today",
          evidence: "Last time: 8, 7, 7 of 6–8",
        },
      }),
    );
    expect(v).toMatchObject({
      kind: "call",
      chip: null,
      strong: false,
      spokenWord: "Hold",
    });
  });

  it("a stalled lift reads 'Hold — trend flat' in the deload color, never 'Deload'", () => {
    const v = insightFor(
      done,
      call({
        tag: "stalled",
        recommendation: {
          kind: "hold",
          tone: "quiet",
          action: "Stay at 60 lb today",
          evidence:
            "Top of the range 2 sessions running, but e1RM hasn't risen over 3 sessions",
        },
      }),
    );
    expect(v).toMatchObject({
      chip: { label: "Hold — trend flat", tone: "deload" },
      spokenWord: "Hold — trend flat",
    });
  });

  it("a deload week is the quiet deload-week line with no reactive chip", () => {
    const v = insightFor(
      done,
      call({
        scheduledDeloadWeek: true,
        tag: null,
        suggestion: { lbs: 160, kind: "scheduled_deload" },
        recommendation: {
          kind: "scheduled_deload",
          tone: "quiet",
          action: "Deload week: 160 lb (90%)",
          evidence: "Planned recovery, not a verdict. Calls resume next week.",
        },
      }),
    );
    expect(v).toMatchObject({ chip: null, spokenWord: "Deload week" });
  });

  it("not enough history is the server's note, never a made-up call", () => {
    const note = "Not enough history yet: 1 of 2 complete sessions.";
    expect(
      insightFor(
        done,
        call({
          tag: null,
          suggestion: null,
          recommendation: null,
          insufficientNote: note,
        }),
      ),
    ).toEqual({ kind: "insufficient", note });
  });

  it("an older server with no insufficientNote field shows nothing", () => {
    const c = call({ tag: null, suggestion: null, recommendation: null });
    delete c.insufficientNote;
    expect(insightFor(done, c)).toEqual({ kind: "none" });
  });

  it("locked wins: the Pro note, whatever else is there", () => {
    expect(
      insightFor(
        done,
        call({
          tag: null,
          suggestion: null,
          recommendation: null,
          locked: "progression_insights",
        }),
      ),
    ).toEqual({ kind: "locked" });
  });

  it("the first load shows loading", () => {
    expect(
      insightFor(
        { isFetching: true, isError: false, hasData: false },
        undefined,
      ),
    ).toEqual({ kind: "loading" });
  });

  it("after a write that can change the call, the cached call gives way to loading (RD-5)", () => {
    expect(
      insightFor(
        {
          isFetching: true,
          isError: false,
          hasData: true,
          isInvalidated: true,
        },
        call(),
      ),
    ).toEqual({ kind: "loading" });
  });

  it("an ordinary re-check keeps the shown call until the answer lands (RD-7, review #1)", () => {
    expect(
      insightFor({ isFetching: true, isError: false, hasData: true }, call()),
    ).toMatchObject({ kind: "call", action: "Try 185 lb today (+5 lb)" });
  });

  it("offline (a paused read) shows the error, never the cached call (RD-6)", () => {
    expect(
      insightFor(
        { isFetching: false, isError: false, isPaused: true, hasData: true },
        call(),
      ),
    ).toEqual({ kind: "error" });
  });

  it("a failed read shows the error, never the cached call (RD-6)", () => {
    expect(
      insightFor({ isFetching: false, isError: true, hasData: true }, call()),
    ).toEqual({ kind: "error" });
  });

  it("no answer yet (disabled read) or no entry for the card shows nothing", () => {
    expect(
      insightFor(
        { isFetching: false, isError: false, hasData: false },
        undefined,
      ),
    ).toEqual({ kind: "none" });
    expect(insightFor(done, undefined)).toEqual({ kind: "none" });
  });

  it("a kind a later server adds still shows its own words", () => {
    const v = insightFor(
      done,
      call({
        tag: null,
        recommendation: {
          kind: "something_new" as never,
          tone: "quiet",
          action: "New advice",
          evidence: "Why",
        },
      }),
    );
    expect(v).toMatchObject({ action: "New advice", spokenWord: "Call" });
  });
});

describe("helpers", () => {
  it("chipFor maps only the web's three tags", () => {
    expect(chipFor(null)).toBeNull();
    expect(chipFor("deload")).toEqual({ label: "Deload", tone: "deload" });
  });
  it("callWord names reassess and reactive deload", () => {
    expect(callWord({ kind: "reassess" }, null)).toBe("Reassess");
    expect(callWord({ kind: "deload" }, "deload")).toBe("Deload");
  });
  it("callForCard picks this card's entry only", () => {
    const list = [
      { loggedExerciseId: "a", progression: call({ loggedExerciseId: "a" }) },
      { loggedExerciseId: "b", progression: call({ loggedExerciseId: "b" }) },
    ];
    expect(callForCard(list, "b")?.loggedExerciseId).toBe("b");
    expect(callForCard(list, "c")).toBeUndefined();
    expect(callForCard(undefined, "a")).toBeUndefined();
  });
  it("callLabel adds the evidence only when expanded", () => {
    const v = insightFor(done, call());
    if (v.kind !== "call") throw new Error("expected a call");
    expect(callLabel(v, false)).toBe("Progress: Try 185 lb today (+5 lb).");
    expect(callLabel(v, true)).toBe(
      "Progress: Try 185 lb today (+5 lb). 8 reps on every set, 2 sessions running",
    );
  });
});
