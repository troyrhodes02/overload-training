const createGym = jest.fn();
const archiveGym = jest.fn();
const restoreGym = jest.fn();

jest.mock("@/lib/gyms/gyms", () => ({ createGym, archiveGym, restoreGym }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));

import { requireUser } from "@/lib/auth";
import {
  archiveGymAction,
  createGymAction,
  restoreGymAction,
  type GymFormState,
} from "@/app/(app)/gyms/actions";
import { gymInputFromFormData, parseGymInput } from "@/lib/gyms/validation";

const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";
const initial: GymFormState = {
  result: null,
  values: { name: "", address: "" },
};

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("gym server actions re-check auth before doing anything", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
  });

  it.each([
    [
      "createGymAction",
      () => createGymAction(initial, form({ name: "Downtown Gym" })),
    ],
    ["archiveGymAction", () => archiveGymAction(ID)],
    ["restoreGymAction", () => restoreGymAction(ID)],
  ])(
    "%s redirects an unauthenticated caller and writes nothing",
    async (_n, call) => {
      await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(createGym).not.toHaveBeenCalled();
      expect(archiveGym).not.toHaveBeenCalled();
      expect(restoreGym).not.toHaveBeenCalled();
    },
  );
});

describe("gym server actions (authenticated)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockResolvedValue({ id: "user" });
  });

  it("create redirects to the gym list on success", async () => {
    createGym.mockResolvedValue({ id: ID });
    await expect(
      createGymAction(
        initial,
        form({ name: "Downtown Gym", address: "Downtown" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/gyms?created=1");
    expect(createGym).toHaveBeenCalledWith({
      name: "Downtown Gym",
      address: "Downtown",
    });
  });

  it("archive returns ok and never leaks internals", async () => {
    archiveGym.mockResolvedValue({ id: ID });
    expect(await archiveGymAction(ID)).toEqual({ ok: true, data: { id: ID } });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    archiveGym.mockRejectedValue(
      new Error("connection string postgres://secret"),
    );
    expect(await archiveGymAction(ID)).toEqual({
      ok: false,
      error: {
        code: "internal_error",
        message: "Couldn't archive. Nothing changed.",
      },
    });
    spy.mockRestore();
  });
});

describe("gym validation", () => {
  it("name required; location optional free text, blank → null", () => {
    expect(parseGymInput({ name: "" })).toEqual({
      ok: false,
      details: { name: "Enter a name." },
    });
    expect(parseGymInput({ name: " Home Garage ", address: "  " })).toEqual({
      ok: true,
      value: { name: "Home Garage", address: null },
    });
    expect(
      parseGymInput({ name: "G", address: "x".repeat(201) }),
    ).toMatchObject({
      ok: false,
      details: { address: expect.any(String) },
    });
    expect(
      parseGymInput({ name: "G", address: { lat: 1, lng: 2 } }),
    ).toMatchObject({
      ok: false,
      details: { address: expect.any(String) },
    });
  });

  it("reads only name and address from the form (no coordinates)", () => {
    expect(
      gymInputFromFormData(
        form({ name: "A", address: "B", latitude: "1", longitude: "2" }),
      ),
    ).toEqual({ name: "A", address: "B" });
  });
});
