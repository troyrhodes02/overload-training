/**
 * OVE-237 (Pitch 21h owner acceptance): two layout defects on X1 Exercise.
 *
 * 1. A blank band above the exercise name. The tab stacks asked for the
 *    native large title, which only pushed screens ever showed (tab roots
 *    draw their own header) and which renders as an empty band on the device
 *    (21e RD-24). Every stack now uses the inline title, and an exercise
 *    without an image reserves no image frame.
 * 2. "Secondary muscles" crushed to one letter a line. ListRow let a long
 *    value take the whole row. A trailing value is now capped at 60% and
 *    wraps inside it, and a list of muscles sits under its label.
 *
 * Jest has no layout engine, so these pin the structure and the flex rules
 * that caused each defect, not pixel positions. How it looks on an iPhone is
 * an owner check (runbook §10).
 */
import fs from "node:fs";
import path from "node:path";
import { StyleSheet } from "react-native";
import { render, screen, within } from "@testing-library/react-native";
import type { ExerciseDetailDto } from "@overload/shared/contracts/exercises";
import { ApiError } from "../src/api/errors";
import { ExerciseScreen } from "../src/library/ExerciseScreen";
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

beforeEach(() => {
  jest.clearAllMocks();
  mockScreenOptions.length = 0;
});

const TABS = path.join(__dirname, "..", "src", "app", "(tabs)");

describe("OVE-237 defect 1: no band above the exercise name", () => {
  it("the shared stack header is the inline title", () => {
    expect(stackScreenOptions({ colors: {} } as never).headerLargeTitle).toBe(
      false,
    );
  });

  it("no tab stack asks for the large title (it renders as an empty band)", () => {
    const layouts = fs
      .readdirSync(TABS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(TABS, d.name, "_layout.tsx"))
      .filter((f) => fs.existsSync(f));
    expect(layouts.length).toBeGreaterThanOrEqual(5);
    for (const f of layouts) {
      const src = fs.readFileSync(f, "utf8");
      expect(src).toContain("stackScreenOptions(theme)");
      expect(src).not.toMatch(/largeTitle|headerLargeTitle:\s*true/);
    }
  });

  it.each(["browse", "workout"] as const)(
    "a custom exercise with no image (%s): no image frame, nothing turns the large title on",
    async (context) => {
      await open(SLED_PUSH, context);
      expect(mockScreenOptions.at(-1)).toEqual({ title: "Exercise" });
      expect(screen.queryByTestId("exercise-hero")).toBeNull();
      expect(screen.getByText("Custom")).toBeTruthy();
      expect(screen.getByText("Quads · Other")).toBeTruthy();
    },
  );

  it("a library exercise with an image keeps its framed hero", async () => {
    await open(detail(), "browse");
    const hero = screen.getByTestId("exercise-hero");
    expect(flat(hero).height).toBeGreaterThan(0);
    expect(flat(hero).overflow).toBe("hidden");
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

  // Jest has no layout engine: these pin the flex rules. The title has a zero
  // basis and takes what the value leaves; the value is capped at 60% (so the
  // title always keeps 40%) and never shrinks below its measured width, so a
  // short value can't break mid-word either. The look is an owner check.
  it("the value is capped at 60% and wraps there; the title takes the rest", async () => {
    await render(
      <Providers>
        <GroupedList>
          <ListRow title="Equipment" value={LONG} />
        </GroupedList>
      </Providers>,
    );
    expect(flat(screen.getByTestId("list-row-title"))).toMatchObject({
      flex: 1,
    });
    const value = flat(screen.getByTestId("list-row-value"));
    expect(value).toMatchObject({ maxWidth: "60%", textAlign: "right" });
    expect(value.flexShrink ?? 0).toBe(0);
    expect(screen.getByText(LONG)).toBeTruthy();
  });

  it("a short value with a chevron keeps its natural width", async () => {
    await render(
      <Providers>
        <GroupedList>
          <ListRow
            title="Monday · Upper Hypertrophy Push A"
            value="12"
            accessory="chevron"
            onPress={() => {}}
          />
        </GroupedList>
      </Providers>,
    );
    expect(flat(screen.getByTestId("list-row-value")).flexShrink ?? 0).toBe(0);
    expect(
      screen.getByRole("button", {
        name: "Monday · Upper Hypertrophy Push A, 12",
      }),
    ).toBeTruthy();
  });
});
