/**
 * Pitch 21k spec §7.4 (RD-5, RD-6): reading the root navigation state.
 */
import { overTabs, tabAtRoot, type NavState } from "../src/tour/navigation";

const tabs = (over: Record<string, NavState | undefined> = {}): NavState => ({
  index: 0,
  routes: [
    {
      name: "(tabs)",
      state: {
        index: 4,
        routes: ["today", "history", "plan", "goals", "more"].map((name) => ({
          name,
          state: over[name],
        })),
      },
    },
  ],
});

const stack = (...names: string[]): NavState => ({
  index: names.length - 1,
  routes: names.map((name) => ({ name })),
});

describe("overTabs", () => {
  it("false when the tabs are on top", () => {
    expect(overTabs(tabs())).toBe(false);
  });

  it("true when a workout (or any root screen) is over the tabs", () => {
    const s = tabs();
    const withWorkout: NavState = {
      index: 1,
      routes: [...s.routes, { name: "workout/[loggedSessionId]/index" }],
    };
    expect(overTabs(withWorkout)).toBe(true);
    expect(
      overTabs({ index: 1, routes: [...s.routes, { name: "goal-new" }] }),
    ).toBe(true);
  });

  it("true while the state is unknown", () => {
    expect(overTabs(undefined)).toBe(true);
    expect(overTabs({ routes: [] })).toBe(true);
  });
});

describe("tabAtRoot", () => {
  it("a tab never opened, or at its root screen, can be entered", () => {
    expect(tabAtRoot(tabs(), "goals")).toBe(true);
    expect(tabAtRoot(tabs({ goals: stack("index") }), "goals")).toBe(true);
    expect(tabAtRoot(undefined, "plan")).toBe(true);
  });

  it("a tab with a pushed screen (a half-filled form) is left alone", () => {
    const s = tabs({ goals: stack("index", "new") });
    expect(tabAtRoot(s, "goals")).toBe(false);
    expect(tabAtRoot(s, "plan")).toBe(true);
  });
});

it("reads through Expo Router's __root wrapper", () => {
  const wrapped = (inner: NavState): NavState => ({
    index: 0,
    routes: [{ name: "__root", state: inner }],
  });
  expect(overTabs(wrapped(tabs()))).toBe(false);
  const s = tabs({ goals: stack("index", "new") });
  expect(tabAtRoot(wrapped(s), "goals")).toBe(false);
  expect(
    overTabs(
      wrapped({ index: 1, routes: [...tabs().routes, { name: "feedback" }] }),
    ),
  ).toBe(true);
});
