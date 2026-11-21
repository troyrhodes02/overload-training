/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Pitch 21g correction OVE-228 on the web: Today's reminder for workouts
 * started on an earlier day and never finished. The same words as the iPhone
 * (the shared module), and Resume links to the ORIGINAL workout.
 */
jest.mock("next/link", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
      createElement("a", { href, ...rest }, children),
  };
});

import { UnfinishedWorkouts } from "@/components/logging/unfinished-workouts";
import type { UnfinishedWorkoutDto } from "@overload/shared/contracts/views";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const upperA: UnfinishedWorkoutDto = {
  loggedSessionId: "ls-upper",
  sessionName: "Upper A",
  scheduledFor: "2026-11-19",
  gymName: "Northside Strength",
  setsLogged: 5,
  exercisesDone: 1,
  exercisesTotal: 4,
};

let root: Root;
let host: HTMLElement;
function mount(workouts: UnfinishedWorkoutDto[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<UnfinishedWorkouts workouts={workouts} />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("one: heading, explanation, the workout's line, In progress, and Resume to the original", () => {
  mount([upperA]);
  expect(host.textContent).toContain("Unfinished workout");
  expect(host.textContent).toContain(
    "Started on an earlier day and still in progress.",
  );
  expect(host.textContent).toContain("Upper A · Thu, Nov 19 · 5 sets saved");
  expect(host.textContent).toContain("Northside Strength");
  expect(host.textContent).toContain("In progress");
  const link = host.querySelector("a")!;
  expect(link.getAttribute("href")).toBe("/log/ls-upper");
  expect(link.getAttribute("aria-label")).toBe(
    "Resume Upper A from Thu, Nov 19",
  );
});

it("several: one compact list with a Resume each; nothing at all when none", () => {
  mount([
    upperA,
    { ...upperA, loggedSessionId: "ls-push", sessionName: "Push B" },
  ]);
  expect(host.textContent).toContain("2 unfinished workouts");
  expect(
    [...host.querySelectorAll("a")].map((a) => a.getAttribute("href")),
  ).toEqual(["/log/ls-upper", "/log/ls-push"]);
  act(() => root.render(<UnfinishedWorkouts workouts={[]} />));
  expect(host.querySelector("[data-testid=unfinished-workouts]")).toBeNull();
});
