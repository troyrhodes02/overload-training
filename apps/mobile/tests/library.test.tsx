/**
 * Pitch 21h design L1 / X1 (spec §12 "Mobile"): the library sends the web's
 * filters, shows the server's answer and its empty states, and opens an
 * exercise's detail; the detail shows what the exercise is in every context.
 */
import { Appearance } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type {
  ExerciseDetailDto,
  ExerciseList,
  ExerciseListItemDto,
} from "@overload/shared/contracts/exercises";
import { ApiError } from "../src/api/errors";
import { libraryQuery } from "../src/api/resources";
import { ExerciseScreen } from "../src/library/ExerciseScreen";
import { LibraryScreen } from "../src/library/LibraryScreen";
import {
  countLine,
  emptyStateFor,
  nextLimit,
} from "../src/library/library-model";
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

const item = (
  over: Partial<ExerciseListItemDto> = {},
): ExerciseListItemDto => ({
  id: "e-bench",
  name: "Barbell Bench Press",
  primaryMuscle: "chest",
  primaryMuscleLabel: "Chest",
  equipmentLabel: "Barbell",
  isCustom: false,
  isFavorite: false,
  imageUrl: "https://img.test/bench.jpg",
  ...over,
});

const listOf = (
  items: ExerciseListItemDto[],
  over: Partial<ExerciseList> = {},
): ExerciseList => ({
  items,
  total: items.length,
  limit: 50,
  hasAnyActive: true,
  hasAnyFavorites: items.some((i) => i.isFavorite),
  ...over,
});

const LIST = listOf([
  item(),
  item({
    id: "e-landmine",
    name: "Landmine Press",
    primaryMuscle: "shoulders",
    primaryMuscleLabel: "Shoulders",
    isCustom: true,
    isFavorite: true,
    imageUrl: null,
  }),
]);

function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string) => {
    const r = routes[path];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return r;
  });
}

const paths = () => mockApi.request.mock.calls.map(([p]) => p as string);

beforeEach(() => jest.clearAllMocks());

describe("library words", () => {
  it("query strings match the web's library parameters", () => {
    const base = { view: "all", muscle: null, q: "", limit: 50 } as const;
    expect(libraryQuery(base)).toBe("");
    expect(
      libraryQuery({
        view: "favorites",
        muscle: "chest",
        q: " bench ",
        limit: 100,
      }),
    ).toBe("?view=favorites&muscle=chest&q=bench&limit=100");
    expect(libraryQuery({ ...base, q: "100% effort" })).toBe(
      "?q=100%25%20effort",
    );
  });

  it("count line, paging, and the four empty states", () => {
    expect(countLine(listOf([item()], { total: 873 }))).toBe(
      "Showing 1 of 873",
    );
    expect(countLine(LIST)).toBe("2 exercises");
    expect(nextLimit(listOf([item()], { total: 873 }), 50)).toBe(100);
    expect(nextLimit(LIST, 50)).toBeNull();
    const f = { view: "all", muscle: null, q: "", limit: 50 } as const;
    const none = listOf([]);
    expect(emptyStateFor(listOf([], { hasAnyActive: false }), f)?.kind).toBe(
      "catalog",
    );
    expect(emptyStateFor(none, { ...f, view: "favorites" })?.title).toBe(
      "No favorites yet. Star exercises you use to keep them here.",
    );
    expect(
      emptyStateFor(listOf([], { hasAnyFavorites: true }), {
        ...f,
        view: "favorites",
      })?.title,
    ).toBe("None of your favorites match these filters.");
    expect(emptyStateFor(none, { ...f, q: "landmine" })).toEqual({
      kind: "no_match",
      title: "No exercises match “landmine”.",
      addName: "landmine",
    });
    expect(emptyStateFor(LIST, f)).toBeNull();
  });
});

describe.each(["light", "dark"] as const)("L1 Exercises in %s", (scheme) => {
  beforeAll(() => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
  });

  it("lists the server's exercises; a row opens its detail", async () => {
    serve({ "/exercises": LIST });
    await render(
      <Providers>
        <LibraryScreen detailHref={(id) => `/more/exercises/${id}`} />
      </Providers>,
    );
    expect(await screen.findByText("Barbell Bench Press")).toBeTruthy();
    expect(screen.getByText("2 exercises")).toBeTruthy();
    expect(screen.getByText("Custom")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Landmine Press, your exercise, Shoulders · Barbell, favorite",
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/more/exercises/e-landmine");
  });
});

describe("L1 filters", () => {
  it("search waits for a pause, then sends every word; filters send the web's params", async () => {
    serve({
      "/exercises": LIST,
      "/exercises?q=bench%20press": listOf([item()]),
      "/exercises?view=favorites&q=bench%20press": listOf([], {
        hasAnyFavorites: true,
      }),
      "/exercises?view=favorites&muscle=back&q=bench%20press": listOf([], {
        hasAnyFavorites: true,
      }),
    });
    await render(
      <Providers>
        <LibraryScreen detailHref={(id) => id} />
      </Providers>,
    );
    await screen.findByText("Barbell Bench Press");
    await fireEvent.changeText(screen.getByLabelText("Search"), "bench press");
    await waitFor(() =>
      expect(paths()).toContain("/exercises?q=bench%20press"),
    );
    // One request for the whole phrase, never one per keystroke.
    expect(paths().filter((p) => p.includes("q="))).toHaveLength(1);
    await fireEvent.press(screen.getByRole("button", { name: "Favorites" }));
    expect(
      await screen.findByText("None of your favorites match these filters."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(paths()).toContain(
        "/exercises?view=favorites&muscle=back&q=bench%20press",
      ),
    );
  });

  it("Show more asks for the next 50", async () => {
    serve({
      "/exercises": listOf([item()], { total: 120 }),
      "/exercises?limit=100": listOf(
        [item(), item({ id: "e2", name: "Second" })],
        {
          total: 120,
          limit: 100,
        },
      ),
    });
    await render(
      <Providers>
        <LibraryScreen detailHref={(id) => id} />
      </Providers>,
    );
    expect(await screen.findByText("Showing 1 of 120")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Second")).toBeTruthy();
  });

  it("no match offers to add one's own; a failed load is described, not empty", async () => {
    const onAddOwn = jest.fn();
    serve({
      "/exercises": LIST,
      "/exercises?q=landmine": listOf([]),
    });
    await render(
      <Providers>
        <LibraryScreen detailHref={(id) => id} onAddOwn={onAddOwn} />
      </Providers>,
    );
    await screen.findByText("Barbell Bench Press");
    await fireEvent.changeText(screen.getByLabelText("Search"), "landmine");
    expect(
      await screen.findByText("No exercises match “landmine”."),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Add your own exercise" }),
    );
    expect(onAddOwn).toHaveBeenCalledWith("landmine");
  });

  it("a failed first load shows Try again", async () => {
    serve({ "/exercises": new ApiError("network", "offline") });
    await render(
      <Providers>
        <LibraryScreen detailHref={(id) => id} />
      </Providers>,
    );
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
  });
});

const detail = (over: Partial<ExerciseDetailDto> = {}): ExerciseDetailDto => ({
  ...item(),
  equipmentType: "barbell",
  secondaryMuscleLabels: ["Shoulders", "Triceps"],
  isArchived: false,
  canArchive: false,
  ...over,
});

describe("X1 Exercise", () => {
  it("shows what the exercise is, with a web link for its history", async () => {
    serve({ "/exercises/e-bench": detail() });
    await render(
      <Providers>
        <ExerciseScreen exerciseId="e-bench" context="browse" />
      </Providers>,
    );
    expect(await screen.findByText("Barbell Bench Press")).toBeTruthy();
    expect(screen.getByText("Chest · Barbell")).toBeTruthy();
    expect(screen.getByText("Shoulders, Triceps")).toBeTruthy();
    expect(screen.getByText("Library exercise")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "History and records, On the web" }),
    ).toBeTruthy();
    expect(screen.queryByText("Custom")).toBeNull();
  });

  it("an archived custom exercise resolves, marked; a missing one says so", async () => {
    serve({
      "/exercises/e-old": detail({
        id: "e-old",
        name: "Old Fly",
        isCustom: true,
        isArchived: true,
        canArchive: true,
        imageUrl: null,
        secondaryMuscleLabels: [],
      }),
    });
    await render(
      <Providers>
        <ExerciseScreen exerciseId="e-old" context="workout" />
      </Providers>,
    );
    expect(await screen.findByText("Archived")).toBeTruthy();
    expect(screen.getByText("Your exercise")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
  });

  it("not found", async () => {
    serve({});
    await render(
      <Providers>
        <ExerciseScreen exerciseId="gone" context="browse" />
      </Providers>,
    );
    expect(
      await screen.findByText("This exercise isn't available"),
    ).toBeTruthy();
  });
});
