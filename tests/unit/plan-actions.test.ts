/**
 * Split & Mesocycle Builder — every plan server action re-checks the auth
 * session FIRST and writes nothing for an unauthenticated caller. The test
 * enumerates the module's exports, so an action added later is covered too.
 */
const writes: Record<string, jest.Mock> = {};
const mockWrite = (name: string) => (writes[name] ??= jest.fn());
const writeModule = () =>
  new Proxy(
    {},
    {
      get: (_t, name: string) => {
        if (name === "__esModule") return true;
        writes[name] ??= jest.fn();
        return writes[name];
      },
    },
  );

jest.mock("@/lib/plan/mesocycles", () => writeModule());
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));

import { requireUser } from "@/lib/auth";
import * as actions from "@/app/(app)/plan/actions";

const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";

const callable = Object.entries(actions).filter(
  ([, v]) => typeof v === "function",
) as [string, (...args: unknown[]) => Promise<unknown>][];

describe("plan server actions re-check auth before doing anything", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
  });

  it("exports the plan actions", () => {
    expect(callable.map(([n]) => n)).toEqual(
      expect.arrayContaining([
        "createMesocycleAction",
        "updateMesocycleDetailsAction",
        "activateMesocycleAction",
        "archiveDraftMesocycleAction",
      ]),
    );
  });

  it.each(callable)(
    "%s redirects an unauthenticated caller and writes nothing",
    async (_name, action) => {
      const fd = new FormData();
      fd.set("name", "Strength Block");
      await expect(
        action(
          { mesocycleId: ID, sessionId: ID, expectedActiveId: null },
          { result: null, values: {} },
          fd,
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/login");
      for (const fn of Object.values(writes)) expect(fn).not.toHaveBeenCalled();
    },
  );
});

describe("plan server actions (authenticated)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockResolvedValue({ id: "user" });
  });

  it("create passes only the form's fields and lands on the new draft", async () => {
    mockWrite("createMesocycle").mockResolvedValue({ id: ID });
    const fd = new FormData();
    fd.set("name", "Strength Block");
    fd.set("startDate", "");
    fd.set("lengthWeeks", "5");
    fd.set("deloadWeek", "5");
    fd.set("splitType", "ppl");
    fd.set("status", "active"); // smuggled; must be ignored
    await expect(
      actions.createMesocycleAction(
        {
          result: null,
          values: {
            name: "",
            startDate: "",
            lengthWeeks: "",
            deloadWeek: "",
            splitType: "",
          },
        },
        fd,
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/plan/${ID}?created=1`);
    expect(mockWrite("createMesocycle")).toHaveBeenCalledWith({
      name: "Strength Block",
      startDate: "",
      lengthWeeks: "5",
      deloadWeek: "5",
      splitType: "ppl",
    });
  });

  it("activation passes the confirmed active block through", async () => {
    mockWrite("activateMesocycle").mockResolvedValue({
      id: ID,
      archivedId: null,
    });
    const result = await actions.activateMesocycleAction({
      mesocycleId: ID,
      expectedActiveId: null,
    });
    expect(result).toEqual({ ok: true, data: { id: ID, archivedId: null } });
    expect(mockWrite("activateMesocycle")).toHaveBeenCalledWith({
      mesocycleId: ID,
      expectedActiveId: null,
    });
  });
});
