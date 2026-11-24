/**
 * Pitch 21h design L1 star, X1 archive, L2 (spec §12 "Mobile"): favorites
 * change at once and go back on a refusal; a new exercise is checked by the
 * shared rules and saved once per intent (the same key on a retry, a new one
 * after a change); archive asks first and offers Undo.
 */
import { Alert, Text } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  ExerciseDetailDto,
  ExerciseList,
} from "@overload/shared/contracts/exercises";
import { ApiError } from "../src/api/errors";
import { newIdempotencyKey } from "../src/api/idempotency";
import {
  archiveConfirmation,
  detailActions,
} from "../src/library/ExerciseDetailActions";
import { ExerciseScreen } from "../src/library/ExerciseScreen";
import { LibraryRoute } from "../src/library/LibraryRoute";
import { NewExerciseScreen } from "../src/library/NewExerciseScreen";
import { resetNotices, useNotice } from "../src/ui/notice-store";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
// Header buttons render inline, so a test presses them like any control.
jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({
      options,
    }: {
      options?: {
        headerLeft?: () => React.ReactNode;
        headerRight?: () => React.ReactNode;
      };
    }) => (
      <>
        {options?.headerLeft?.()}
        {options?.headerRight?.()}
      </>
    ),
  },
  get router() {
    return mockRouter;
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

type Call = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};
type Route = unknown | ((opts: Call) => unknown);
function serve(routes: Record<string, Route>) {
  mockApi.request.mockImplementation(async (path: string, opts: Call = {}) => {
    const key = `${opts.method ?? "GET"} ${path}`;
    const r = key in routes ? routes[key] : routes[path];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? (r as (o: Call) => unknown)(opts) : r;
  });
}
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, o]) => o?.method && o.method !== "GET")
    .map(([p, o]) => ({ path: p, ...o }));

const detail = (over: Partial<ExerciseDetailDto> = {}): ExerciseDetailDto => ({
  id: "e-land",
  name: "Landmine Press",
  primaryMuscle: "shoulders",
  primaryMuscleLabel: "Shoulders",
  equipmentLabel: "Barbell",
  isCustom: true,
  isFavorite: false,
  imageUrl: null,
  equipmentType: "barbell",
  secondaryMuscleLabels: [],
  isArchived: false,
  canArchive: true,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetNotices();
});

describe("idempotency keys", () => {
  it("fit the server's alphabet and length, and differ", () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9._:-]{8,255}$/);
    expect(a).not.toBe(b);
    expect(newIdempotencyKey(36, () => 0.5)).toBe("ovl-10-iiiiiiiiiiiiiiii");
  });
});

describe("X1 actions", () => {
  it("which actions apply", () => {
    expect(detailActions(detail(), "browse")).toEqual({
      favorite: true,
      archive: true,
    });
    expect(detailActions(detail(), "workout")).toEqual({
      favorite: true,
      archive: false,
    });
    expect(
      detailActions(detail({ isCustom: false, canArchive: false }), "browse"),
    ).toEqual({ favorite: true, archive: false });
    expect(detailActions(detail({ isArchived: true }), "browse")).toEqual({
      favorite: false,
      archive: false,
    });
    expect(archiveConfirmation("Landmine Press").title).toBe(
      "Archive Landmine Press?",
    );
  });

  it("archive asks, then shows Archived with Undo; Undo restores", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) =>
        buttons?.find((b) => b.text === "Archive")?.onPress?.(),
      );
    serve({
      "GET /exercises/e-land": detail(),
      "PUT /exercises/e-land/archived": ({ body }: Call) => ({
        id: "e-land",
        archived: (body as { archived: boolean }).archived,
      }),
    });
    await render(
      <Providers>
        <ExerciseScreen exerciseId="e-land" context="browse" />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Archive exercise" }),
    );
    expect(alert).toHaveBeenCalledWith(
      "Archive Landmine Press?",
      "It leaves the library and the pickers. Past workouts and plans keep it.",
      expect.anything(),
    );
    expect(
      await screen.findByText("Archived. Past workouts keep it."),
    ).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add to favorites" }),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Restored.")).toBeTruthy();
    expect(writes().map((w) => [w.method, w.path, w.body])).toEqual([
      ["PUT", "/exercises/e-land/archived", { archived: true }],
      ["PUT", "/exercises/e-land/archived", { archived: false }],
    ]);
  });

  it("from a workout there is no Archive; the favorite toggles", async () => {
    serve({
      "GET /exercises/e-land": detail(),
      "PUT /exercises/e-land/favorite": { id: "e-land", isFavorite: true },
    });
    await render(
      <Providers>
        <ExerciseScreen exerciseId="e-land" context="workout" />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Add to favorites" }),
    );
    expect(
      await screen.findByRole("button", { name: "In favorites" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Archive exercise" }),
    ).toBeNull();
  });
});

const LIST: ExerciseList = {
  items: [
    {
      id: "e-bench",
      name: "Barbell Bench Press",
      primaryMuscle: "chest",
      primaryMuscleLabel: "Chest",
      equipmentLabel: "Barbell",
      isCustom: false,
      isFavorite: false,
      imageUrl: null,
    },
  ],
  total: 1,
  limit: 50,
  hasAnyActive: true,
  hasAnyFavorites: false,
};

describe("L1 star", () => {
  it("fills at once, and goes back with a reason if the server refuses", async () => {
    let answer: () => unknown = () => ({ id: "e-bench", isFavorite: true });
    serve({
      "GET /exercises": LIST,
      "PUT /exercises/e-bench/favorite": () => answer(),
    });
    await render(
      <Providers>
        <LibraryRoute />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Add Barbell Bench Press to favorites",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Remove Barbell Bench Press from favorites",
      }),
    ).toBeTruthy();
    answer = () => {
      throw new ApiError("network", "offline");
    };
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Remove Barbell Bench Press from favorites",
      }),
    );
    expect(
      await screen.findByText(
        "Couldn't update favorites — Overload needs a connection.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Remove Barbell Bench Press from favorites",
      }),
    ).toBeTruthy();
  });

  it("two failed taps in a row end on the server's state (review #1)", async () => {
    let release: (() => void)[] = [];
    serve({
      "GET /exercises": LIST,
      "PUT /exercises/e-bench/favorite": () =>
        new Promise((_, reject) =>
          release.push(() => reject(new ApiError("network", "offline"))),
        ),
    });
    await render(
      <Providers>
        <LibraryRoute />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Add Barbell Bench Press to favorites",
      }),
    );
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Remove Barbell Bench Press from favorites",
      }),
    );
    await waitFor(() => expect(release).toHaveLength(2));
    const pending = release;
    release = [];
    pending.forEach((r) => r());
    // Neither reached the server: the star is off, as it was.
    expect(
      await screen.findByRole("button", {
        name: "Add Barbell Bench Press to favorites",
      }),
    ).toBeTruthy();
  });

  it("+ opens a new exercise", async () => {
    serve({ "GET /exercises": LIST });
    await render(
      <Providers>
        <LibraryRoute />
      </Providers>,
    );
    await screen.findByText("Barbell Bench Press");
    await fireEvent.press(
      screen.getByRole("button", { name: "Add your own exercise" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/exercise-new");
  });
});

function NoticeProbe() {
  const n = useNotice("exercises");
  return n ? <Text>{n.message}</Text> : null;
}

describe("L2 New exercise", () => {
  const save = () =>
    fireEvent.press(screen.getByRole("button", { name: "Save" }));

  async function fill() {
    await fireEvent.changeText(screen.getByLabelText("Name"), "Landmine Press");
    // Before a primary is chosen it appears in both groups; the first is primary.
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Shoulders" })[0]!,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Barbell" }));
  }

  it("shows the shared rules' messages and sends nothing", async () => {
    serve({});
    await render(
      <Providers>
        <NewExerciseScreen initialName="" />
      </Providers>,
    );
    await save();
    expect(screen.getByText("Enter a name.")).toBeTruthy();
    expect(screen.getByText("Choose a primary muscle.")).toBeTruthy();
    expect(screen.getByText("Choose the equipment.")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("saves once per intent: a retry resends the same key; a change makes a new one", async () => {
    let fail = true;
    serve({
      "POST /exercises": ({ body }: Call) => {
        if (fail) throw new ApiError("network", "offline");
        return detail({ name: (body as { name: string }).name });
      },
    });
    await render(
      <Providers>
        <NewExerciseScreen initialName="" />
        <NoticeProbe />
      </Providers>,
    );
    await fill();
    // The primary muscle is not offered again as a secondary one.
    expect(screen.getAllByRole("button", { name: "Shoulders" })).toHaveLength(
      1,
    );
    await save();
    expect(
      await screen.findByText(
        "Couldn't add the exercise — Overload needs a connection. Your entries are still here.",
      ),
    ).toBeTruthy();
    await save();
    await waitFor(() => expect(writes()).toHaveLength(2));
    const [first, retry] = writes();
    expect(first!.headers?.["Idempotency-Key"]).toBe(
      retry!.headers?.["Idempotency-Key"],
    );
    expect(first!.body).toEqual({
      name: "Landmine Press",
      primaryMuscle: "shoulders",
      equipmentType: "barbell",
      secondaryMuscles: [],
    });
    // A changed field is a new intent, with a new key.
    // Triceps in the secondary group (the last of its two buttons).
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Triceps" }).at(-1)!,
    );
    fail = false;
    await save();
    await waitFor(() => expect(writes()).toHaveLength(3));
    expect(writes()[2]!.headers?.["Idempotency-Key"]).not.toBe(
      first!.headers?.["Idempotency-Key"],
    );
    expect(writes()[2]!.body).toMatchObject({ secondaryMuscles: ["triceps"] });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Added Landmine Press.")).toBeTruthy();
  });

  it("the server's field errors show under their fields, and it stays open", async () => {
    serve({
      "POST /exercises": () => {
        throw new ApiError(
          "validation_error",
          "Check the highlighted fields.",
          400,
          { name: "Keep the name to 100 characters or fewer." },
        );
      },
    });
    await render(
      <Providers>
        <NewExerciseScreen initialName="Landmine Press" />
      </Providers>,
    );
    // Before a primary is chosen it appears in both groups; the first is primary.
    await fireEvent.press(
      screen.getAllByRole("button", { name: "Shoulders" })[0]!,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Barbell" }));
    await save();
    expect(
      await screen.findByText("Keep the name to 100 characters or fewer."),
    ).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
