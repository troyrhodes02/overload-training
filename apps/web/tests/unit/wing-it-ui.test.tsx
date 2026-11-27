/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Pitch 25 (OVE-270) on the web: Today's Wing-It section in each state (the
 * preview's states), the Add exercise picker (every group by default, "In
 * this workout", choosing opens the card), and the open-ended card (no
 * target, no extra set, Remove instead of "Didn't do"). The words are the
 * shared module's, so they match the iPhone.
 */
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: jest.fn(),
  }),
  usePathname: () => "/log/ls-w/add",
}));
const mockAdd = jest.fn();
jest.mock("@/app/(app)/log/actions", () => ({
  addWingItExerciseAction: (...a: unknown[]) => mockAdd(...a),
  setExerciseSkippedAction: jest.fn(),
  logSetAction: jest.fn(),
  editLoggedSetAction: jest.fn(),
}));
jest.mock("@/app/(app)/history/actions", () => ({
  editLoggedSetAction: jest.fn(),
}));
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

import { WingItToday } from "@/components/logging/wing-it-today";
import { AddExercisePicker } from "@/components/logging/add-exercise-picker";
import { ExerciseCard } from "@/components/logging/exercise-card";
import type { WingItTodayDto } from "@overload/shared/contracts/views";
import type {
  AddExerciseContextDto,
  ExerciseCardDto,
} from "@overload/shared/contracts/logging";
import { LEGACY_OPEN_REP_RANGE } from "@overload/shared/logging/wing-it";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Render into a detached container; its markup and text. */
function renderToStaticMarkup(el: React.ReactElement): string {
  const host = document.createElement("div");
  const r = createRoot(host);
  act(() => r.render(el));
  const out = `${host.innerHTML}\n${host.textContent}`;
  act(() => r.unmount());
  return out;
}

const none: WingItTodayDto = { open: null, finishedToday: [], blockedBy: null };
const html = (
  w: WingItTodayDto | undefined,
  p: "no_plan" | "rest" | "planned",
) => renderToStaticMarkup(<WingItToday wingIt={w} placement={p} />);

describe("Today's Wing-It section", () => {
  it("beside a scheduled workout: a secondary Start to /log/wing-it and the plan-stays line", () => {
    const h = html(none, "planned");
    expect(h).toContain("Wing-It workout");
    expect(h).toContain(
      "Train something that isn't in your plan. Today's planned workout stays as it is.",
    );
    expect(h).toContain('href="/log/wing-it"');
    expect(h).toContain("Start Wing-It workout");
  });

  it("no plan: Start is the primary action; an older server's answer still renders", () => {
    expect(html(undefined, "no_plan")).toContain("Start Wing-It workout");
  });

  it("rest day wording", () => {
    expect(html(none, "rest")).toContain(
      "Not on today's plan? Log it as a Wing-It workout.",
    );
  });

  it("open: Resume goes to the workout; no Start", () => {
    const h = html(
      {
        ...none,
        open: {
          loggedSessionId: "ls-w",
          gymName: "Harbor Barbell",
          exerciseCount: 2,
          setsLogged: 4,
          startedOn: "2026-11-27",
        },
      },
      "planned",
    );
    expect(h).toContain("Harbor Barbell · 4 sets saved");
    expect(h).toContain('href="/log/ls-w"');
    expect(h).toContain("Resume Wing-It workout");
    expect(h).not.toContain("Start Wing-It workout");
  });

  it("finished today, and blocked by a workout with saved sets", () => {
    const h = html(
      {
        open: null,
        finishedToday: [
          {
            loggedSessionId: "ls-done",
            gymName: "Harbor Barbell",
            exerciseCount: 3,
            setsLogged: 9,
            startedOn: "2026-11-27",
          },
        ],
        blockedBy: { loggedSessionId: "ls-up", sessionName: "Upper A" },
      },
      "planned",
    );
    expect(h).toContain(
      "✓ Wing-It workout · Harbor Barbell · 3 exercises · 9 sets",
    );
    expect(h).toContain('href="/history/ls-done"');
    expect(h).toContain("Finish Upper A first.");
    expect(h).toContain('href="/log/ls-up"');
    expect(h).toContain("Resume Upper A");
  });
});

const context: AddExerciseContextDto = {
  loggedSessionId: "ls-w",
  selectedMuscle: "all",
  selectedMuscleLabel: "All muscle groups",
  candidates: [
    {
      id: "x-press",
      name: "Leg Press",
      primaryMuscle: "quads",
      isFavorite: true,
      inWorkout: true,
    },
    {
      id: "x-fly",
      name: "Cable Fly",
      primaryMuscle: "chest",
      isFavorite: false,
      inWorkout: false,
    },
  ],
};

describe("the Add exercise picker", () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("lists every group by default, marks the one already in the workout, and filters by search", () => {
    act(() => root.render(<AddExercisePicker context={context} />));
    expect(host.textContent).toContain("Add an exercise");
    expect(host.textContent).toContain("All muscle groups");
    expect(host.textContent).toContain("In this workout");
    const input = host.querySelector<HTMLInputElement>("#add-search")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, "fly");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const names = [...host.querySelectorAll("li button")].map(
      (b) => b.textContent,
    );
    expect(names).toEqual(["Cable Fly"]);
  });

  it("choosing adds once and opens that card", async () => {
    mockAdd.mockResolvedValue({
      ok: true,
      data: { loggedExerciseId: "le-fly", added: true },
    });
    act(() => root.render(<AddExercisePicker context={context} />));
    const fly = [...host.querySelectorAll("li button")].find((b) =>
      b.textContent?.includes("Cable Fly"),
    ) as HTMLButtonElement;
    await act(async () => fly.click());
    expect(mockAdd).toHaveBeenCalledWith({
      loggedSessionId: "ls-w",
      exerciseId: "x-fly",
    });
    expect(mockPush).toHaveBeenCalledWith("/log/ls-w?exercise=le-fly");
  });
});

const openCard = (over: Partial<ExerciseCardDto> = {}): ExerciseCardDto => ({
  loggedExerciseId: "le-press",
  performedExerciseName: "Leg Press",
  plannedExerciseName: "Leg Press",
  performedExerciseId: "x-press",
  plannedPrimaryMuscle: "quads",
  swapped: false,
  performedArchived: false,
  isGymVariable: true,
  requiresExternalWeight: true,
  gymName: "Harbor Barbell",
  plannedSets: 2,
  plannedRepRange: { ...LEGACY_OPEN_REP_RANGE },
  openEnded: true,
  suggestedWeightLbs: null,
  workingWeightFromBaseline: false,
  previousPerformance: null,
  referencePerformance: {
    dateIso: "2026-11-20",
    gymScoped: true,
    sets: [{ setNumber: 1, weightLbs: 270, reps: 12 }],
    sessionName: "Wing-It workout",
    repRange: { ...LEGACY_OPEN_REP_RANGE },
    openEnded: true,
  },
  weightContext: "reference_only",
  skipped: false,
  sets: [
    {
      setNumber: 1,
      loggedSetId: "s1",
      weightLbs: 280,
      reps: 10,
      rir: null,
      saved: true,
      extra: false,
    },
    {
      setNumber: 2,
      loggedSetId: null,
      weightLbs: null,
      reps: null,
      rir: null,
      saved: false,
      extra: false,
    },
  ],
  ...over,
});

describe("the open-ended card", () => {
  const render = (c: ExerciseCardDto) =>
    renderToStaticMarkup(
      <ExerciseCard
        exercise={c}
        gymLocked
        progression={undefined}
        workoutDateIso="2026-11-27"
        workoutName="Wing-It workout"
        scheduledDeloadWeek={false}
      />,
    );

  it("says what was logged and last time — never a rep range or an extra set", () => {
    const h = render(openCard());
    expect(h).toContain("1 set logged");
    expect(h).not.toContain("1–1000");
    expect(h).not.toContain("Add set");
    expect(h).toContain("Last time in Wing-It workout · Nov 20 · 270 × 12");
  });

  it("with nothing logged it can be removed (never 'Didn't do')", () => {
    const h = render(
      openCard({
        plannedSets: 1,
        sets: [
          {
            setNumber: 1,
            loggedSetId: null,
            weightLbs: null,
            reps: null,
            rir: null,
            saved: false,
            extra: false,
          },
        ],
      }),
    );
    expect(h).toContain("Logged as you go");
    expect(h).toContain("Remove from workout");
    expect(h).not.toContain("Didn't do");
  });
});
