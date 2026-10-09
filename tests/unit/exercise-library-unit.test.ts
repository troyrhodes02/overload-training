const createCustomExercise = jest.fn();
const setExerciseFavorite = jest.fn();
const archiveExercise = jest.fn();
const restoreExercise = jest.fn();

jest.mock("@/lib/exercises/exercises", () => ({
  createCustomExercise,
  setExerciseFavorite,
  archiveExercise,
  restoreExercise,
}));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));

import { requireUser } from "@/lib/auth";
import {
  archiveExerciseAction,
  createCustomExerciseAction,
  restoreExerciseAction,
  setExerciseFavoriteAction,
  type CustomExerciseFormState,
} from "@/app/(app)/exercises/actions";
import { DomainError, toActionResult } from "@/lib/actions/result";
import {
  libraryQueryString,
  parseLibraryParams,
  searchTokens,
} from "@/lib/exercises/library-params";
import {
  customExerciseInputFromFormData,
  parseCustomExerciseInput,
} from "@/lib/exercises/validation";

const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";
const initial: CustomExerciseFormState = {
  result: null,
  values: {
    name: "",
    primaryMuscle: "",
    equipmentType: "",
    secondaryMuscles: [],
  },
};

function form(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("exercise server actions re-check auth before doing anything", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
  });

  it.each([
    ["setExerciseFavoriteAction", () => setExerciseFavoriteAction(ID, true)],
    ["archiveExerciseAction", () => archiveExerciseAction(ID)],
    ["restoreExerciseAction", () => restoreExerciseAction(ID)],
    [
      "createCustomExerciseAction",
      () =>
        createCustomExerciseAction(
          initial,
          form([
            ["name", "X"],
            ["primaryMuscle", "back"],
            ["equipmentType", "band"],
          ]),
        ),
    ],
  ])(
    "%s redirects an unauthenticated caller and writes nothing",
    async (_n, call) => {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
      for (const write of [
        createCustomExercise,
        setExerciseFavorite,
        archiveExercise,
        restoreExercise,
      ]) {
        expect(write).not.toHaveBeenCalled();
      }
    },
  );
});

describe("exercise server actions (authenticated)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockResolvedValue({ id: "user" });
  });

  it("create redirects to the new exercise on success", async () => {
    createCustomExercise.mockResolvedValue({ id: ID });
    await expect(
      createCustomExerciseAction(
        initial,
        form([
          ["name", "Landmine Press"],
          ["primaryMuscle", "shoulders"],
          ["equipmentType", "barbell"],
          ["secondaryMuscles", "triceps"],
        ]),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/exercises/${ID}?created=1`);
    expect(createCustomExercise).toHaveBeenCalledWith({
      name: "Landmine Press",
      primaryMuscle: "shoulders",
      equipmentType: "barbell",
      secondaryMuscles: ["triceps"],
    });
  });

  it("create returns field errors and keeps the entered values", async () => {
    createCustomExercise.mockRejectedValue(
      new DomainError("validation_error", "Check the highlighted fields.", {
        primaryMuscle: "Choose a primary muscle.",
      }),
    );
    const state = await createCustomExerciseAction(
      initial,
      form([
        ["name", "Zercher Squat"],
        ["equipmentType", "barbell"],
      ]),
    );
    expect(state.result).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Check the highlighted fields.",
        details: { primaryMuscle: "Choose a primary muscle." },
      },
    });
    expect(state.values).toMatchObject({
      name: "Zercher Squat",
      equipmentType: "barbell",
    });
  });

  it("never leaks internal errors", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    archiveExercise.mockRejectedValue(
      new Error("prisma: connection refused at 10.0.0.1"),
    );
    const result = await archiveExerciseAction(ID);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "internal_error",
        message: "Couldn't archive. Nothing changed.",
      },
    });
    spy.mockRestore();
  });
});

describe("toActionResult", () => {
  it("passes DomainError codes through and hides everything else", async () => {
    expect(await toActionResult(async () => 1)).toEqual({ ok: true, data: 1 });
    expect(
      await toActionResult(async () => {
        throw new DomainError("not_found", "Gone.");
      }),
    ).toEqual({ ok: false, error: { code: "not_found", message: "Gone." } });
  });
});

describe("custom exercise validation", () => {
  it("reads only the four form fields (no image field exists)", () => {
    const raw = customExerciseInputFromFormData(
      form([
        ["name", "A"],
        ["primaryMuscle", "back"],
        ["equipmentType", "band"],
        ["secondaryMuscles", "biceps"],
        ["secondaryMuscles", "forearms"],
        ["image", "x.jpg"],
      ]),
    );
    expect(raw).toEqual({
      name: "A",
      primaryMuscle: "back",
      equipmentType: "band",
      secondaryMuscles: ["biceps", "forearms"],
    });
  });

  it("enforces required fields, vocabulary, distinct secondaries, and primary ∉ secondaries", () => {
    expect(parseCustomExerciseInput({})).toEqual({
      ok: false,
      details: {
        name: "Enter a name.",
        primaryMuscle: "Choose a primary muscle.",
        equipmentType: "Choose the equipment.",
      },
    });
    expect(
      parseCustomExerciseInput({
        name: "x".repeat(101),
        primaryMuscle: "back",
        equipmentType: "band",
      }),
    ).toMatchObject({ ok: false, details: { name: expect.any(String) } });
    expect(
      parseCustomExerciseInput({
        name: "A",
        primaryMuscle: "lats",
        equipmentType: "band",
      }),
    ).toMatchObject({
      ok: false,
      details: { primaryMuscle: expect.any(String) },
    });
    expect(
      parseCustomExerciseInput({
        name: "A",
        primaryMuscle: "back",
        equipmentType: "band",
        secondaryMuscles: ["back"],
      }),
    ).toMatchObject({
      ok: false,
      details: { secondaryMuscles: expect.stringMatching(/primary/) },
    });
    expect(
      parseCustomExerciseInput({
        name: "A",
        primaryMuscle: "back",
        equipmentType: "band",
        secondaryMuscles: ["biceps", "biceps"],
      }),
    ).toMatchObject({
      ok: false,
      details: { secondaryMuscles: expect.stringMatching(/once/) },
    });
    expect(
      parseCustomExerciseInput({
        name: " A ",
        primaryMuscle: "back",
        equipmentType: "band",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "A",
        primaryMuscle: "back",
        equipmentType: "band",
        secondaryMuscles: [],
      },
    });
  });
});

describe("library URL params", () => {
  it("parses tolerantly with defaults", () => {
    expect(parseLibraryParams({})).toEqual({
      view: "all",
      muscle: null,
      search: "",
      limit: 50,
    });
    expect(
      parseLibraryParams({
        view: "favorites",
        muscle: "back",
        q: "row",
        limit: "100",
      }),
    ).toEqual({ view: "favorites", muscle: "back", search: "row", limit: 100 });
    expect(
      parseLibraryParams({ view: "nope", muscle: "lats", limit: "-5" }),
    ).toEqual({ view: "all", muscle: null, search: "", limit: 50 });
    expect(parseLibraryParams({ limit: "999999" }).limit).toBe(1000);
  });

  it("tokenizes search and round-trips to a query string without defaults", () => {
    expect(searchTokens("  press   bench ")).toEqual(["press", "bench"]);
    expect(searchTokens("")).toEqual([]);
    expect(
      libraryQueryString({ view: "all", muscle: null, search: "", limit: 50 }),
    ).toBe("");
    expect(
      libraryQueryString({
        view: "favorites",
        muscle: "back",
        search: " row ",
        limit: 100,
      }),
    ).toBe("?view=favorites&muscle=back&q=row&limit=100");
  });
});

describe("withExtraParams (the session picker reuses the library URL contract)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withExtraParams } = require("@/lib/exercises/library-params");
  it("leaves library URLs unchanged without extras", () => {
    expect(withExtraParams("?muscle=back", undefined)).toBe("?muscle=back");
    expect(withExtraParams("", {})).toBe("");
  });
  it("adds the extras alongside the filters", () => {
    expect(withExtraParams("", { replace: "abc" })).toBe("?replace=abc");
    expect(withExtraParams("?q=row", { replace: "abc" })).toBe(
      "?q=row&replace=abc",
    );
  });
});
