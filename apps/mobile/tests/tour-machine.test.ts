/**
 * Pitch 21k spec §5.1: the native tour's state machine, every transition.
 */
import {
  INITIAL_TOUR_STATE,
  stepCounter,
  transition,
  type TourEvent,
  type TourState,
} from "../src/tour/machine";

const N = 3;
const rect = { x: 10, y: 100, width: 200, height: 40 };
const target = { anchor: "a", label: "the thing" };

function run(events: TourEvent[], from: TourState = INITIAL_TOUR_STATE) {
  let state = from;
  const effects: unknown[] = [];
  for (const e of events) {
    const t = transition(state, e, N);
    state = t.state;
    effects.push(...t.effects);
  }
  return { state, effects };
}

const found = (token: number): TourEvent => ({
  type: "FOUND",
  token,
  rect,
  target,
  path: "/today",
});

describe("start and intro", () => {
  it("a manual start shows the intro and writes nothing", () => {
    const { state, effects } = run([{ type: "START", mode: "manual" }]);
    expect(state).toMatchObject({ phase: "intro", mode: "manual" });
    expect(effects).toEqual([]);
  });

  it("an automatic start spends the offer at once", () => {
    const { effects } = run([{ type: "START", mode: "auto" }]);
    expect(effects).toEqual([{ kind: "offered" }]);
  });

  it("a second start while running is ignored", () => {
    const first = run([{ type: "START", mode: "manual" }]);
    const again = transition(first.state, { type: "START", mode: "auto" }, N);
    expect(again.state).toBe(first.state);
    expect(again.effects).toEqual([]);
  });

  it("with no steps nothing starts", () => {
    const t = transition(
      INITIAL_TOUR_STATE,
      { type: "START", mode: "manual" },
      0,
    );
    expect(t.state.phase).toBe("idle");
  });

  it("Not now: manual records nothing, automatic records skipped", () => {
    expect(
      run([{ type: "START", mode: "manual" }, { type: "CANCEL" }]),
    ).toMatchObject({ state: { phase: "idle" }, effects: [] });
    expect(
      run([{ type: "START", mode: "auto" }, { type: "CANCEL" }]).effects,
    ).toEqual([{ kind: "offered" }, { kind: "record", outcome: "skipped" }]);
  });

  it("BEGIN locates the first step with a fresh token", () => {
    const intro = run([{ type: "START", mode: "manual" }]).state;
    const { state } = run([{ type: "BEGIN" }], intro);
    expect(state).toMatchObject({ phase: "locating", index: 0 });
    expect(state.token).toBe(intro.token + 1);
  });
});

describe("locating and showing", () => {
  const locating = () =>
    run([{ type: "START", mode: "manual" }, { type: "BEGIN" }]).state;

  it("FOUND with the current token shows the highlight", () => {
    const s = locating();
    const { state } = run([found(s.token)], s);
    expect(state).toMatchObject({
      phase: "showing",
      index: 0,
      rect,
      target,
      expectedPath: "/today",
    });
  });

  it("MISSING shows the step in words", () => {
    const s = locating();
    const { state } = run([{ type: "MISSING", token: s.token, path: "/x" }], s);
    expect(state).toMatchObject({ phase: "showing", rect: null, target: null });
  });

  it("a stale token is dropped", () => {
    const s = locating();
    expect(run([found(s.token - 1)], s).state).toBe(s);
    expect(
      run([{ type: "MISSING", token: s.token + 5, path: "/" }], s).state,
    ).toBe(s);
  });

  it("FOUND outside locating is ignored (a late answer after Next)", () => {
    const s = locating();
    const shown = run([found(s.token)], s).state;
    expect(run([found(s.token)], shown).state).toBe(shown);
  });
});

describe("moving through the steps", () => {
  const showing = (index: number) => {
    let s = run([{ type: "START", mode: "manual" }, { type: "BEGIN" }]).state;
    for (let i = 0; i <= index; i++) {
      s = run([found(s.token)], s).state;
      if (i < index) s = run([{ type: "NEXT" }], s).state;
    }
    return s;
  };

  it("NEXT moves on with a new token; a second NEXT during the move is ignored", () => {
    const s = showing(0);
    const next = run([{ type: "NEXT" }], s).state;
    expect(next).toMatchObject({ phase: "locating", index: 1 });
    expect(next.token).toBe(s.token + 1);
    expect(run([{ type: "NEXT" }], next).state).toBe(next);
  });

  it("BACK returns to the previous step; not before the first", () => {
    expect(run([{ type: "BACK" }], showing(0)).state.phase).toBe("showing");
    expect(run([{ type: "BACK" }], showing(1)).state).toMatchObject({
      phase: "locating",
      index: 0,
    });
  });

  it("NEXT on the last step completes once and returns to More", () => {
    const last = showing(N - 1);
    const done = run([{ type: "NEXT" }], last);
    expect(done.state.phase).toBe("idle");
    expect(done.effects).toEqual([
      { kind: "record", outcome: "completed" },
      { kind: "return" },
    ]);
    // A double tap on Done writes nothing more.
    expect(run([{ type: "NEXT" }], done.state).effects).toEqual([]);
  });

  it("SKIP from a step or while locating records skipped once", () => {
    for (const s of [showing(1), run([{ type: "NEXT" }], showing(0)).state]) {
      const skipped = run([{ type: "SKIP" }, { type: "SKIP" }], s);
      expect(skipped.state.phase).toBe("idle");
      expect(skipped.effects).toEqual([
        { kind: "record", outcome: "skipped" },
        { kind: "return" },
      ]);
    }
  });

  it("SKIP on the intro does nothing (the intro has Not now)", () => {
    const intro = run([{ type: "START", mode: "manual" }]).state;
    expect(run([{ type: "SKIP" }], intro).state).toBe(intro);
  });

  it("closing moves the token, so a measurement still in flight is dropped", () => {
    const s = run([{ type: "NEXT" }], showing(0)).state;
    const closed = run([{ type: "SKIP" }], s).state;
    expect(closed.token).toBeGreaterThan(s.token);
    expect(run([found(s.token)], closed).state).toBe(closed);
  });
});

describe("interruptions", () => {
  const states: [string, TourState][] = [
    ["intro", run([{ type: "START", mode: "manual" }]).state],
    [
      "locating",
      run([{ type: "START", mode: "manual" }, { type: "BEGIN" }]).state,
    ],
  ];

  it.each(states)("from %s, background and unmount record nothing", (_n, s) => {
    for (const reason of ["background", "unmount"] as const) {
      const t = transition(s, { type: "INTERRUPT", reason }, N);
      expect([t.state.phase, t.effects]).toEqual(["idle", []]);
    }
  });

  it.each(states)("from %s, foreign navigation records skipped", (_n, s) => {
    const t = transition(
      s,
      { type: "INTERRUPT", reason: "foreign_navigation" },
      N,
    );
    expect(t.effects).toEqual([{ kind: "record", outcome: "skipped" }]);
  });

  it("idle ignores interruptions", () => {
    const t = transition(
      INITIAL_TOUR_STATE,
      { type: "INTERRUPT", reason: "foreign_navigation" },
      N,
    );
    expect(t).toEqual({ state: INITIAL_TOUR_STATE, effects: [] });
  });
});

it("the counter counts every native step", () => {
  expect(stepCounter(0, 9)).toEqual({ position: 1, total: 9 });
  expect(stepCounter(8, 9)).toEqual({ position: 9, total: 9 });
});
