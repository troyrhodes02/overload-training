/**
 * Pitch 21h design G1–G3 (spec §12 "Mobile"): gyms are listed as the server
 * has them, archived with a confirmation and an Undo, and added once per
 * intent with the shared rules. No map, no baseline.
 */
import { Alert, Text } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { GymsResponseDto } from "@overload/shared/contracts/gyms";
import { ApiError } from "../src/api/errors";
import { GymScreen } from "../src/gyms/GymScreen";
import { GymsScreen } from "../src/gyms/GymsScreen";
import { NewGymScreen } from "../src/gyms/NewGymScreen";
import { gymArchiveConfirmation } from "../src/gyms/gym-model";
import { resetNotices, useNotice } from "../src/ui/notice-store";
import { Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
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
function serve(routes: Record<string, unknown>) {
  mockApi.request.mockImplementation(async (path: string, opts: Call = {}) => {
    const key = `${opts.method ?? "GET"} ${path}`;
    const r = routes[key];
    if (r === undefined) throw new ApiError("not_found", "nope", 404);
    if (r instanceof Error) throw r;
    return typeof r === "function" ? (r as (o: Call) => unknown)(opts) : r;
  });
}
const writes = () =>
  mockApi.request.mock.calls
    .filter(([, o]) => o?.method && o.method !== "GET")
    .map(([p, o]) => ({ path: p as string, ...(o as Call) }));

const GYMS: GymsResponseDto = {
  gyms: [
    { id: "g-harbor", name: "Harbor Barbell", address: null },
    { id: "g-north", name: "Northside Strength", address: "410 Main St" },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetNotices();
});

describe("G1 Gyms", () => {
  it("lists the gyms with their locations; a row opens the gym", async () => {
    serve({ "GET /gyms": GYMS });
    await render(
      <Providers>
        <GymsScreen />
      </Providers>,
    );
    expect(await screen.findByText("Harbor Barbell")).toBeTruthy();
    expect(screen.getByText("410 Main St")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Northside Strength, 410 Main St" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/more/gyms/g-north");
    await fireEvent.press(screen.getByRole("button", { name: "Add a gym" }));
    expect(mockRouter.push).toHaveBeenLastCalledWith("/gym-new");
  });

  it("no gyms: one sentence and Add a gym", async () => {
    serve({ "GET /gyms": { gyms: [] } });
    await render(
      <Providers>
        <GymsScreen />
      </Providers>,
    );
    expect(
      await screen.findByText("No gyms yet. Add the gym you train at."),
    ).toBeTruthy();
  });
});

describe("G2 Gym", () => {
  it("archive asks, keeps the gym on screen marked, and Undo restores", async () => {
    jest
      .spyOn(Alert, "alert")
      .mockImplementation((_t, _m, buttons) =>
        buttons?.find((b) => b.text === "Archive")?.onPress?.(),
      );
    serve({
      "GET /gyms": GYMS,
      "PUT /gyms/g-north/archived": ({ body }: Call) => ({
        id: "g-north",
        archived: (body as { archived: boolean }).archived,
      }),
    });
    await render(
      <Providers>
        <GymScreen gymId="g-north" />
      </Providers>,
    );
    expect(await screen.findByText("Northside Strength")).toBeTruthy();
    expect(screen.getByText(/A new gym starts fresh/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Archive gym" }));
    expect(Alert.alert).toHaveBeenCalledWith(
      gymArchiveConfirmation("Northside Strength").title,
      "It leaves the gym pickers. Past workouts keep it, and its machine weights stay with it.",
      expect.anything(),
    );
    expect(
      await screen.findByText("Archived. Past workouts keep it."),
    ).toBeTruthy();
    expect(screen.getByText("Northside Strength")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Restored.")).toBeTruthy();
    expect(writes().map((w) => [w.method, w.path, w.body])).toEqual([
      ["PUT", "/gyms/g-north/archived", { archived: true }],
      ["PUT", "/gyms/g-north/archived", { archived: false }],
    ]);
  });

  it("a gym not in the list says so, with a way back", async () => {
    serve({ "GET /gyms": GYMS });
    await render(
      <Providers>
        <GymScreen gymId="g-gone" />
      </Providers>,
    );
    expect(await screen.findByText("This gym isn't available")).toBeTruthy();
  });
});

function NoticeProbe() {
  const n = useNotice("gyms");
  return n ? <Text>{n.message}</Text> : null;
}

describe("G3 New gym", () => {
  const save = () =>
    fireEvent.press(screen.getByRole("button", { name: "Save" }));

  it("checks the shared rules before sending anything", async () => {
    serve({});
    await render(
      <Providers>
        <NewGymScreen />
      </Providers>,
    );
    await save();
    expect(screen.getByText("Enter a name.")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("a retry resends the same key and the gym is created once", async () => {
    let fail = true;
    serve({
      "POST /gyms": ({ body }: Call) => {
        if (fail) throw new ApiError("unavailable", "down", 502);
        return { id: "g-new", ...(body as object) };
      },
    });
    await render(
      <Providers>
        <NewGymScreen />
        <NoticeProbe />
      </Providers>,
    );
    await fireEvent.changeText(screen.getByLabelText("Name"), "Riverside Iron");
    await fireEvent.changeText(screen.getByLabelText("Location"), "  ");
    await save();
    expect(
      await screen.findByText(
        "Couldn't add the gym — Overload isn't responding. Your entries are still here.",
      ),
    ).toBeTruthy();
    fail = false;
    await save();
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const [first, retry] = writes();
    expect(first!.headers?.["Idempotency-Key"]).toBe(
      retry!.headers?.["Idempotency-Key"],
    );
    // The shared parser's value is sent: trimmed name, empty location null.
    expect(retry!.body).toEqual({ name: "Riverside Iron", address: null });
    expect(screen.getByText("Added Riverside Iron.")).toBeTruthy();
  });
});
