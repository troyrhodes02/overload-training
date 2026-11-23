/**
 * OVE-237 (Pitch 21h owner acceptance): two layout defects on X1 Exercise.
 *
 * 1. A blank band above the exercise name. X1 is pushed onto the Plan and
 *    More stacks, whose roots use the native large title; X1 inherited it.
 *    It now declares the standard inline header in every context, and an
 *    exercise without an image reserves no image frame.
 * 2. "Secondary muscles" crushed to one letter a line. ListRow gave the title
 *    a zero flex basis and the value no way to shrink. Now the title keeps a
 *    readable share and the value wraps; a list of muscles sits under its
 *    label.
 *
 * Jest has no layout engine, so these pin the structure and the flex rules
 * that caused each defect, not pixel positions. How it looks on an iPhone is
 * an owner check (runbook §10).
 */
import { StyleSheet } from "react-native";
import { render, screen, within } from "@testing-library/react-native";
import type { ExerciseDetailDto } from "@overload/shared/contracts/exercises";
import { ApiError } from "../src/api/errors";
import {
  EXERCISE_SCREEN_OPTIONS,
  ExerciseScreen,
} from "../src/library/ExerciseScreen";
import { stackScreenOptions } from "../src/ui/stackOptions";
import { GroupedList, ListRow } from "../src/ui/GroupedList";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: { ok: true, config: { apiOrigin: "https://staging.test" } },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
const mockScreenOptions: unknown[] = [];
jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      mockScreenOptions.push(options);
      return null;
    },
  },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

const detail = (over: Partial<ExerciseDetailDto> = {}): ExerciseDetailDto => ({
  id: "e-squat",
  name: "Barbell Squat",
  primaryMuscle: "quads",
  primaryMuscleLabel: "Quads",
  equipmentLabel: "Barbell",
  equipmentType: "barbell",
  isCustom: false,
  isFavorite: false,
  imageUrl: "https://img.test/squat.jpg",
  secondaryMuscleLabels: ["Calves", "Glutes", "Hamstrings", "Lower Back"],
  isArchived: false,
  canArchive: false,
  ...over,
});

const SLED_PUSH = detail({
  id: "e-sled",
  name: "Sled Push",
  equipmentLabel: "Other",
  equipmentType: "other",
  isCustom: true,
  canArchive: true,
  imageUrl: null,
  secondaryMuscleLabels: [],
});

function serve(d: ExerciseDetailDto) {
  mockApi.request.mockImplementation(async (path: string) => {
    if (path === `/exercises/${d.id}`) return d;
    throw new ApiError("not_found", "nope", 404);
  });
}

async function open(d: ExerciseDetailDto, context: "browse" | "workout") {
  serve(d);
  await render(
    <Providers>
      <ExerciseScreen exerciseId={d.id} context={context} />
    </Providers>,
  );
  await screen.findByText(d.name);
}

/** The row whose accessible label starts with `title`. */
const row = (title: string) =>
  screen.getByLabelText(new RegExp(`^${title},`), { exact: false });

const flat = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) ?? {};

/** Every rendered string, in document order. */
function textsInOrder(node: unknown): string[] {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(textsInOrder);
  const children = (node as { children?: unknown }).children;
  return children ? textsInOrder(children) : [];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScreenOptions.length = 0;
});

describe("OVE-237 defect 1: no band above the exercise name", () => {
  it("the tab stacks X1 is pushed onto use the large title, which X1 turns off", () => {
    // The cause: the Plan and More roots ask for the large title…
    const tabRoot = stackScreenOptions({ colors: {} } as never, {
      largeTitle: true,
    });
    expect(tabRoot.headerLargeTitle).toBe(true);
    // …and X1 overrides it, so it never inherits the band.
    expect(EXERCISE_SCREEN_OPTIONS).toEqual({
      title: "Exercise",
      headerLargeTitle: false,
    });
  });

  it.each(["browse", "workout"] as const)(
    "a custom exercise with no image (%s): inline header, no image frame, name first",
    async (context) => {
      await open(SLED_PUSH, context);
      expect(mockScreenOptions.at(-1)).toEqual(EXERCISE_SCREEN_OPTIONS);
      expect(screen.queryByTestId("exercise-hero")).toBeNull();
      // The header is the content's first text: nothing sits above it.
      expect(textsInOrder(screen.toJSON())[0]).toBe("Sled Push");
      expect(screen.getByText("Custom")).toBeTruthy();
      expect(screen.getByText("Quads · Other")).toBeTruthy();
    },
  );

  it("a library exercise with an image keeps its framed hero above the name", async () => {
    await open(detail(), "browse");
    const hero = screen.getByTestId("exercise-hero");
    expect(flat(hero).height).toBeGreaterThan(0);
    expect(flat(hero).overflow).toBe("hidden");
    expect(mockScreenOptions.at(-1)).toEqual(EXERCISE_SCREEN_OPTIONS);
  });
});

describe("OVE-237 defect 2: Secondary muscles stays readable", () => {
  it("several muscles: the list wraps under its label, read as one row", async () => {
    await open(detail(), "browse");
    const secondary = row("Secondary muscles");
    expect(secondary.props.accessibilityLabel).toBe(
      "Secondary muscles, Calves, Glutes, Hamstrings, Lower Back",
    );
    // Stacked: the value is inside the title column, not beside it.
    const column = within(secondary).getByTestId("list-row-title");
    expect(
      within(column).getByText("Calves, Glutes, Hamstrings, Lower Back"),
    ).toBeTruthy();
    expect(within(column).getByText("Secondary muscles")).toBeTruthy();
    // No trailing column competes for the width.
    expect(flat(column).minWidth).toBeUndefined();
  });

  it.each([
    ["no secondary muscles", [], "None"],
    ["one secondary muscle", ["Glutes"], "Glutes"],
  ])(
    "%s: stays a trailing value like the other rows",
    async (_, labels, text) => {
      await open(detail({ secondaryMuscleLabels: labels }), "browse");
      const secondary = row("Secondary muscles");
      const column = within(secondary).getByTestId("list-row-title");
      expect(within(column).queryByText(text)).toBeNull();
      expect(within(secondary).getByText(text)).toBeTruthy();
    },
  );

  it("the other rows keep the label and value layout", async () => {
    await open(SLED_PUSH, "browse");
    for (const [title, value] of [
      ["Primary muscle", "Quads"],
      ["Equipment", "Other"],
      ["Type", "Your exercise"],
    ]) {
      expect(row(title).props.accessibilityLabel).toBe(`${title}, ${value}`);
    }
  });
});

describe("ListRow: a long trailing value can't crush its title", () => {
  const LONG = "A very long value that would not fit beside its title at all";

  it("the value shrinks and wraps; the title grows, shrinks, and keeps 40%", async () => {
    await render(
      <Providers>
        <GroupedList>
          <ListRow title="Equipment" value={LONG} />
        </GroupedList>
      </Providers>,
    );
    const title = screen.getByTestId("list-row-title");
    const value = screen.getByTestId("list-row-value");
    // The defect: flex: 1 is a zero basis, and the value's default
    // flexShrink of 0 let a long value take the whole row.
    expect(flat(title).flex).toBeUndefined();
    expect(flat(title)).toMatchObject({
      flexGrow: 1,
      flexShrink: 1,
      minWidth: "40%",
    });
    expect(flat(value)).toMatchObject({ flexShrink: 1, textAlign: "right" });
    expect(screen.getByText(LONG)).toBeTruthy();
  });

  it("a row without a value gives the title the whole row", async () => {
    await render(
      <Providers>
        <GroupedList>
          <ListRow title="Gyms" accessory="chevron" onPress={() => {}} />
        </GroupedList>
      </Providers>,
    );
    expect(flat(screen.getByTestId("list-row-title")).minWidth).toBeUndefined();
    expect(screen.queryByTestId("list-row-value")).toBeNull();
  });
});
