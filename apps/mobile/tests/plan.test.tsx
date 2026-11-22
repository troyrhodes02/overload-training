/**
 * Pitch 21h design P1 / P2 (spec §12 "Mobile"): Plan renders the server's
 * block, week, and sessions; the stepper asks the server for another week;
 * a session opens read-only. Nothing here may write.
 */
import { Appearance } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  PlanBlockDto,
  PlanDayDto,
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { ApiError } from "../src/api/errors";
import { PlanScreen } from "../src/plan/PlanScreen";
import { SessionScreen } from "../src/plan/SessionScreen";
import {
  cadenceLine,
  dayRow,
  otherBlocksLine,
  positionLine,
} from "../src/plan/plan-model";
import { plannedRow, sessionContextLine } from "../src/plan/session-model";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

const day = (dateIso: string, label: string, over: Partial<PlanDayDto> = {}) =>
  ({
    dateIso,
    dayLabel: label,
    isToday: false,
    sessions: [],
    cardio: [],
    ...over,
  }) as PlanDayDto;

function block(over: Partial<PlanBlockDto> = {}): PlanBlockDto {
  return {
    summary: {
      id: "m1",
      name: "Spring Strength",
      status: "active",
      splitType: "custom",
      splitLabel: "Custom split",
      startDate: "2026-11-02",
      endDate: "2026-12-13",
      lengthWeeks: 6,
      deloadEveryWeeks: 5,
      sessionCount: 2,
      issueCount: 0,
    },
    position: { kind: "running", week: 3, scheduledDeloadWeek: false },
    deloadWeeks: [5],
    template: [
      {
        id: "s-upper",
        name: "Upper A",
        dayOfWeek: 1,
        exerciseCount: 5,
        archivedCount: 0,
      },
      null,
      {
        id: "s-lower",
        name: "Lower A",
        dayOfWeek: 3,
        exerciseCount: 4,
        archivedCount: 0,
      },
      null,
      null,
      null,
      null,
    ],
    templateCardio: [null, null, null, null, null, null, null],
    unscheduled: [],
    week: {
      weekNumber: 3,
      lengthWeeks: 6,
      rangeLabel: "Mon, Nov 16 – Sun, Nov 22",
      scheduledDeloadWeek: false,
      isCurrentWeek: true,
      days: [
        day("2026-11-16", "Mon, Nov 16", {
          sessions: [
            {
              sessionId: "s-upper",
              sessionName: "Upper A",
              state: "complete",
              loggedSessionId: "ls1",
            },
          ],
        }),
        day("2026-11-17", "Tue, Nov 17"),
        day("2026-11-18", "Wed, Nov 18", {
          isToday: true,
          sessions: [
            {
              sessionId: "s-lower",
              sessionName: "Lower A",
              state: "upcoming",
              loggedSessionId: null,
            },
          ],
          cardio: [
            {
              scheduledFor: "2026-11-18",
              dateIso: "2026-11-18",
              planned: { type: "Bike", durationMin: 20 },
              state: "pending",
              log: null,
              differsFromPlan: false,
              mesocycleId: "m1",
              dateLabel: "Wed, Nov 18",
            },
          ],
        }),
        day("2026-11-19", "Thu, Nov 19"),
        day("2026-11-20", "Fri, Nov 20"),
        day("2026-11-21", "Sat, Nov 21"),
        day("2026-11-22", "Sun, Nov 22"),
      ],
    },
    ...over,
  };
}

const overview = (over: Partial<PlanOverviewDto> = {}): PlanOverviewDto => ({
  today: "2026-11-18",
  block: block(),
  otherBlocks: { drafts: 0, previous: 1 },
  ...over,
});

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(
    async (path: string, opts?: { method?: string }) => {
      if (opts?.method && opts.method !== "GET")
        throw new Error(`write ${path}`);
      const r = routes[path];
      if (r === undefined) throw new ApiError("not_found", "nope", 404);
      if (r instanceof Error) throw r;
      return r;
    },
  );
}

beforeEach(() => jest.clearAllMocks());

describe("plan words", () => {
  it("position, cadence, and other blocks", () => {
    expect(positionLine(block())).toBe("Week 3 of 6");
    expect(
      positionLine(
        block({
          position: { kind: "running", week: 5, scheduledDeloadWeek: true },
        }),
      ),
    ).toBe("Week 5 of 6 · Deload week");
    expect(
      positionLine(
        block({ position: { kind: "upcoming", startsOn: "2026-12-01" } }),
      ),
    ).toBe("Starts Tue, Dec 1");
    expect(
      positionLine(
        block({ position: { kind: "ended", endedOn: "2026-11-30" } }),
      ),
    ).toBe("Ended Mon, Nov 30");
    expect(cadenceLine(block())).toBe("Deload every 5 weeks · week 5");
    expect(cadenceLine(block({ deloadWeeks: [3, 6] }))).toBe(
      "Deload every 5 weeks · weeks 3, 6",
    );
    expect(cadenceLine(block({ deloadWeeks: [] }))).toBe(
      "No deload week in this block",
    );
    expect(otherBlocksLine({ drafts: 1, previous: 2 })).toBe(
      "1 draft and 2 earlier blocks are on the web.",
    );
    expect(otherBlocksLine({ drafts: 0, previous: 1 })).toBe(
      "1 earlier block is on the web.",
    );
    expect(otherBlocksLine({ drafts: 0, previous: 0 })).toBeNull();
  });

  it("a day row uses History's words and says rest and today", () => {
    const b = block();
    expect(dayRow(b.week.days[1])).toMatchObject({
      rest: true,
      lines: [],
      accessibilityLabel: "Tue, Nov 17, rest",
    });
    const today = dayRow(b.week.days[2]);
    expect(today.isToday).toBe(true);
    expect(today.lines.map((l) => [l.title, l.chip?.label])).toEqual([
      ["Lower A", "Upcoming"],
      ["Cardio · Bike · 20 min", "Today"],
    ]);
    expect(dayRow(b.week.days[0]).lines[0].chip?.label).toBe("Done");
  });
});

describe.each(["light", "dark"] as const)("P1 Plan in %s", (scheme) => {
  beforeAll(() => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
  });

  it("shows the block, this week, and the sessions", async () => {
    serve({ "/plan": overview() });
    await render(
      <Providers>
        <PlanScreen />
      </Providers>,
    );
    expect(await screen.findByText("Spring Strength")).toBeTruthy();
    expect(screen.getByText("Week 3 of 6")).toBeTruthy();
    expect(screen.getByText("Deload every 5 weeks · week 5")).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByLabelText("Mon, Nov 16, Upper A, Done")).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Wed, Nov 18, today, Lower A, Upcoming, Cardio · Bike · 20 min, Today",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Rest")).toHaveLength(5);
    expect(screen.getByLabelText("Monday · Upper A, 5")).toBeTruthy();
    expect(
      screen.getByText(
        "Edit this plan on the web. 1 earlier block is on the web.",
      ),
    ).toBeTruthy();
    // Only reads were sent.
    for (const [, opts] of mockApi.request.mock.calls)
      expect(opts?.method ?? "GET").toBe("GET");
  });
});

describe("P1 interactions", () => {
  it("the stepper asks the server for another week and keeps the block", async () => {
    const week2 = block({
      week: {
        ...block().week,
        weekNumber: 2,
        isCurrentWeek: false,
        rangeLabel: "Mon, Nov 9 – Sun, Nov 15",
      },
    });
    serve({ "/plan": overview(), "/plan?week=2": overview({ block: week2 }) });
    await render(
      <Providers>
        <PlanScreen />
      </Providers>,
    );
    await screen.findByText("Week 3 of 6");
    await fireEvent.press(
      screen.getByRole("button", { name: "Previous week, week 2" }),
    );
    expect(await screen.findByText("Week 2")).toBeTruthy();
    expect(screen.getByText("Week")).toBeTruthy();
    expect(mockApi.request).toHaveBeenCalledWith(
      "/plan?week=2",
      expect.anything(),
    );
  });

  it("a day or a session row opens the session; a rest day is not a button", async () => {
    serve({ "/plan": overview() });
    await render(
      <Providers>
        <PlanScreen />
      </Providers>,
    );
    await screen.findByText("Spring Strength");
    await fireEvent.press(screen.getByLabelText("Mon, Nov 16, Upper A, Done"));
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      "/plan/session/s-upper?mesocycleId=m1",
    );
    await fireEvent.press(screen.getByLabelText("Monday · Upper A, 5"));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole("button", { name: "Tue, Nov 17, rest" }),
    ).toBeNull();
  });

  it("no active plan: the empty state names drafts and links to the web", async () => {
    serve({
      "/plan": {
        today: "2026-11-18",
        block: null,
        otherBlocks: { drafts: 2, previous: 0 },
      },
    });
    await render(
      <Providers>
        <PlanScreen />
      </Providers>,
    );
    expect(await screen.findByText("No active plan")).toBeTruthy();
    expect(
      screen.getByText(
        "You have 2 drafts on the web. Activate one to train it.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open Plan on the web" }),
    ).toBeTruthy();
  });

  it("a failed load is described, never shown as empty", async () => {
    serve({ "/plan": new ApiError("network", "offline") });
    await render(
      <Providers>
        <PlanScreen />
      </Providers>,
    );
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
    expect(screen.queryByText("No active plan")).toBeNull();
  });
});

const sessionDto = (over: Partial<PlanSessionDto> = {}): PlanSessionDto => ({
  id: "s-upper",
  name: "Upper A",
  dayOfWeek: 1,
  mesocycle: { id: "m1", name: "Spring Strength", status: "active" },
  exercises: [
    {
      id: "se1",
      exerciseId: "e-bench",
      exerciseName: "Barbell Bench Press",
      primaryMuscleLabel: "Chest",
      equipmentLabel: "Barbell",
      isCustom: false,
      imageUrl: "https://img.test/bench.jpg",
      isArchived: false,
      plannedSets: 3,
      targetRepMin: 6,
      targetRepMax: 8,
      position: 0,
      requiresExternalWeight: true,
    },
    {
      id: "se2",
      exerciseId: "e-pull",
      exerciseName: "Pullups",
      primaryMuscleLabel: "Back",
      equipmentLabel: "Bodyweight",
      isCustom: false,
      imageUrl: null,
      isArchived: false,
      plannedSets: 3,
      targetRepMin: 10,
      targetRepMax: 10,
      position: 1,
      requiresExternalWeight: false,
    },
    {
      id: "se3",
      exerciseId: "e-fly",
      exerciseName: "Cable Fly",
      primaryMuscleLabel: "Chest",
      equipmentLabel: "Cable",
      isCustom: true,
      imageUrl: null,
      isArchived: true,
      plannedSets: 3,
      targetRepMin: 12,
      targetRepMax: 15,
      position: 2,
      requiresExternalWeight: true,
    },
  ],
  cardio: { id: "c1", dayOfWeek: 1, type: "Bike", durationMin: 20 },
  ...over,
});

describe("P2 Session", () => {
  it("row words: prescription, bodyweight, archived", () => {
    const [bench, pull, fly] = sessionDto().exercises.map(plannedRow);
    expect([bench.prescription, bench.detail, bench.chip]).toEqual([
      "3 sets · 6–8 reps",
      "Chest · Barbell",
      null,
    ]);
    expect([pull.prescription, pull.detail]).toEqual([
      "3 sets · 10 reps",
      "Bodyweight · reps only",
    ]);
    expect([fly.chip, fly.detail]).toEqual([
      "Archived",
      "Replace it on the web",
    ]);
    expect(bench.accessibilityLabel).toBe(
      "1, Barbell Bench Press, 3 sets · 6 to 8 reps, Chest · Barbell",
    );
    expect(sessionContextLine(sessionDto())).toBe(
      "Monday · 3 exercises · Spring Strength",
    );
  });

  it("shows the authored exercises in order with the day's cardio and the footnote", async () => {
    serve({ "/mesocycles/m1/sessions/s-upper": sessionDto() });
    await render(
      <Providers>
        <SessionScreen
          mesocycleId="m1"
          sessionId="s-upper"
          exerciseHref={(id) => `/plan/exercise/${id}`}
        />
      </Providers>,
    );
    expect(await screen.findByText("Barbell Bench Press")).toBeTruthy();
    expect(screen.getByText("3 sets · 6–8 reps")).toBeTruthy();
    expect(screen.getByText("Bodyweight · reps only")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("Cardio · Bike · 20 min")).toBeTruthy();
    expect(screen.getByText(/This is the plan\./)).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "1, Barbell Bench Press, 3 sets · 6 to 8 reps, Chest · Barbell",
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/plan/exercise/e-bench");
  });

  it("a session gone from the plan says so, with a way back", async () => {
    serve({});
    await render(
      <Providers>
        <SessionScreen mesocycleId="m1" sessionId="gone" exerciseHref={null} />
      </Providers>,
    );
    expect(
      await screen.findByText("This session isn't in your plan anymore"),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to Plan" }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });
});
