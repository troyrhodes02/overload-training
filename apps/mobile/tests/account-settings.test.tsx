/**
 * Pitch 21j design M1, A1–A7 (spec §13 "Mobile"): More's groups, the profile
 * form with the web's rules, the read-only plan, What's New (list and the
 * once-per-launch sheet), help, and feedback sent once per intent.
 */
import { Alert, Linking } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { QueryClient } from "@tanstack/react-query";
import type {
  MePlanDto,
  ProfileViewDto,
} from "@overload/shared/contracts/account";
import { ApiError } from "../src/api/errors";
import { ProfileScreen } from "../src/account/ProfileScreen";
import { PlanAccessScreen } from "../src/account/PlanAccessScreen";
import { WhatsNewScreen } from "../src/account/WhatsNewScreen";
import { WhatsNewSheet } from "../src/account/WhatsNewSheet";
import { HelpScreen } from "../src/account/HelpScreen";
import { FeedbackScreen } from "../src/account/FeedbackScreen";
import MoreScreen from "../src/app/(tabs)/more/index";
import {
  checkProfile,
  deviceZoneSuggestion,
  filterZones,
  isDirty,
  pickTimeZone,
} from "../src/account/profile-model";
import {
  resetFeedbackDraft,
  updateFeedbackDraft,
  useFeedbackDraft,
} from "../src/account/feedback-model";
import { planSections } from "../src/account/plan-model";
import { resetWhatsNewLaunch } from "../src/account/whats-new-model";
import { ACCOUNT_KEYS } from "../src/api/account";
import { clearAccountQueries, QUERY_KEYS } from "../src/api/queries";
import { appConfig, meDto, Providers } from "./harness";

const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
let mockPathname = "/today";
const mockPrevent: {
  active: boolean;
  cb?: (o: { repeat: () => void }) => void;
} = { active: false };
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
  useLocalSearchParams: () => mockParams,
  usePathname: () => mockPathname,
  useFocusEffect: () => {},
  usePreventRemove: (
    active: boolean,
    cb: (o: { repeat: () => void }) => void,
  ) => {
    mockPrevent.active = active;
    mockPrevent.cb = cb;
  },
}));
jest.mock("../src/auth/session", () => ({
  useSession: () => ({ signOut: jest.fn() }),
}));

type Call = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  formData?: FormData;
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

const PROFILE: ProfileViewDto = {
  profile: {
    firstName: "Sam",
    lastName: "Ortiz",
    username: "sam_lifts",
    timeZone: "America/Chicago",
  },
  timeZones: ["America/Chicago", "America/New_York", "Europe/London", "UTC"],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockParams = {};
  mockPathname = "/today";
  mockPrevent.active = false;
  resetFeedbackDraft();
  resetWhatsNewLaunch();
});

describe("M1 More", () => {
  it("groups the account: Profile, Plan, What's New, feedback, help", async () => {
    serve({});
    await render(
      <Providers>
        <MoreScreen />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: /Sam Ortiz, @sam_lifts.*Profile/ }),
    );
    expect(mockRouter.push).toHaveBeenLastCalledWith("/more/profile");
    await fireEvent.press(screen.getByRole("button", { name: /^Plan/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith("/more/plan");
    for (const [name, href] of [
      ["What's New", "/more/whats-new"],
      ["Send feedback", "/feedback"],
      ["Get help", "/more/help"],
    ] as const) {
      await fireEvent.press(screen.getByRole("button", { name }));
      expect(mockRouter.push).toHaveBeenLastCalledWith(href);
    }
    // Nothing on More offers to buy anything.
    expect(screen.queryByText(/subscribe|upgrade|\$/i)).toBeNull();
  });
});

describe("A1 Profile", () => {
  it("Save is off until something changes; a save updates me and says Saved", async () => {
    let seeded: QueryClient | undefined;
    serve({
      "GET /me/profile": PROFILE,
      "PUT /me/profile": ({ body }: Call) => ({
        profile: { ...(body as object), username: "sam_lifts" },
      }),
    });
    await render(
      <Providers seed={(c) => (seeded = c)}>
        <ProfileScreen />
      </Providers>,
    );
    const save = await screen.findByRole("button", { name: "Save" });
    expect(save.props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("First name"), "Jordan");
    expect(mockPrevent.active).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(writes()).toEqual([
      {
        path: "/me/profile",
        method: "PUT",
        body: {
          firstName: "Jordan",
          lastName: "Ortiz",
          username: "sam_lifts",
          timeZone: "America/Chicago",
        },
      },
    ]);
    expect(
      seeded?.getQueryData<ReturnType<typeof meDto>>(QUERY_KEYS.me)?.profile
        .firstName,
    ).toBe("Jordan");
  });

  it("the web's messages stop a bad save before it is sent", async () => {
    serve({ "GET /me/profile": PROFILE });
    await render(
      <Providers>
        <ProfileScreen />
      </Providers>,
    );
    await fireEvent.changeText(
      await screen.findByLabelText("First name"),
      "  ",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter your first name.")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("a server refusal goes on its field; a failure keeps every typed value", async () => {
    serve({
      "GET /me/profile": PROFILE,
      "PUT /me/profile": new ApiError(
        "validation_error",
        "Check the highlighted fields.",
        400,
        { username: "That username isn't available." },
      ),
    });
    await render(
      <Providers>
        <ProfileScreen />
      </Providers>,
    );
    await fireEvent.changeText(
      await screen.findByLabelText("Username"),
      "lifter_two",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("That username isn't available."),
    ).toBeTruthy();
    serve({
      "GET /me/profile": PROFILE,
      "PUT /me/profile": new ApiError("network", "offline"),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(/Your changes are still here\./),
    ).toBeTruthy();
    expect(screen.getByLabelText("Username").props.value).toBe("lifter_two");
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("a zone picked on Time zone comes back into the draft, unsaved", async () => {
    serve({ "GET /me/profile": PROFILE });
    await render(
      <Providers>
        <ProfileScreen />
      </Providers>,
    );
    await screen.findByLabelText("First name");
    await act(async () => pickTimeZone("Europe/London"));
    expect(
      await screen.findByRole("button", { name: /Time zone, Europe\/London/ }),
    ).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("a failed load is described, never an empty form", async () => {
    serve({ "GET /me/profile": new ApiError("network", "offline") });
    await render(
      <Providers>
        <ProfileScreen />
      </Providers>,
    );
    expect(await screen.findByText("Try again")).toBeTruthy();
    expect(screen.queryByLabelText("First name")).toBeNull();
  });
});

describe("profile model", () => {
  it("dirty, rules, device-zone suggestion, search", () => {
    const saved = PROFILE.profile;
    expect(isDirty(saved, saved)).toBe(false);
    expect(isDirty({ ...saved, lastName: "X" }, saved)).toBe(true);
    expect(checkProfile({ ...saved, username: "" }, saved)).toHaveProperty(
      "username",
    );
    expect(
      checkProfile({ ...saved, username: "" }, { ...saved, username: "" }),
    ).toEqual({});
    expect(
      deviceZoneSuggestion("Europe/London", "UTC", PROFILE.timeZones),
    ).toBe("Europe/London");
    expect(deviceZoneSuggestion("UTC", "UTC", PROFILE.timeZones)).toBeNull();
    expect(
      deviceZoneSuggestion("Mars/Base", "UTC", PROFILE.timeZones),
    ).toBeNull();
    expect(filterZones(PROFILE.timeZones, "new york")).toEqual([
      "America/New_York",
    ]);
  });
});

describe("A3 Plan & access", () => {
  const plan = (over: Partial<MePlanDto> = {}): MePlanDto => ({
    displayState: "trial",
    label: "Pro — trial · 9 days left",
    shortLabel: "Pro — trial · 9d",
    explanation:
      "You have full Pro during your trial. After it ends you move to Free, with nothing lost.",
    trialDaysLeft: 9,
    problem: false,
    cancelAtPeriodEnd: false,
    endsOn: null,
    proIncludes: ["Estimated one-rep max trends and stall detection"],
    ...over,
  });

  it("shows the server's words and what's included, with no purchase path", async () => {
    serve({ "GET /me/plan": plan() });
    await render(
      <Providers>
        <PlanAccessScreen />
      </Providers>,
    );
    expect(await screen.findByText("Pro — trial · 9 days left")).toBeTruthy();
    expect(screen.getByText("Included in your plan")).toBeTruthy();
    expect(screen.getByText("Your data export")).toBeTruthy();
    expect(
      screen.getByText(
        "Plans and billing are managed on the Overload website.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /subscribe|upgrade|manage|buy/i }),
    ).toBeNull();
  });

  it("the free-Pro period (OVE-266): the server's words, 'Included in your plan', and no purchase path", async () => {
    serve({
      "GET /me/plan": plan({
        displayState: "included",
        label: "Pro — included for everyone",
        shortLabel: "Pro — included",
        explanation:
          "Pro is currently included for everyone at no charge. Paid subscriptions are temporarily unavailable. When this ends, your account returns to its usual plan, with nothing you logged lost.",
      }),
    });
    await render(
      <Providers>
        <PlanAccessScreen />
      </Providers>,
    );
    expect(await screen.findByText("Pro — included for everyone")).toBeTruthy();
    expect(screen.getByText("Included in your plan")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /subscribe|upgrade|manage|buy/i }),
    ).toBeNull();
  });

  it("Free reads 'Pro adds'; a payment problem says so", () => {
    expect(planSections(plan({ displayState: "free" })).proHeading).toBe(
      "Pro adds",
    );
    expect(
      planSections(plan({ displayState: "grace", problem: true }))
        .problemBanner,
    ).toBe("We couldn't take your last payment.");
  });
});

describe("A4 What's New and the A5 sheet", () => {
  const entry = {
    id: "2026-11-15-x",
    date: "2026-11-15",
    title: "Each workout remembers its own weights",
    body: "Body text.",
  };

  it("lists the catalog with dates; reading marks nothing", async () => {
    serve({ "GET /release-notes": { entries: [entry] } });
    await render(
      <Providers>
        <WhatsNewScreen />
      </Providers>,
    );
    expect(
      await screen.findByText("Each workout remembers its own weights"),
    ).toBeTruthy();
    expect(screen.getByText("Nov 15, 2026")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("the sheet opens once per launch and Got it marks seen once", async () => {
    serve({ "POST /me/release-notes/seen": { moved: true } });
    const due = { entries: [entry], throughId: "2026-11-15-x" };
    const view = await render(
      <Providers me={meDto({ whatsNew: due })}>
        <WhatsNewSheet />
      </Providers>,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Got it" }),
    );
    await waitFor(() =>
      expect(writes()).toEqual([
        {
          path: "/me/release-notes/seen",
          method: "POST",
          body: { throughId: "2026-11-15-x" },
        },
      ]),
    );
    await view.unmount();
    // Same launch, still due on the server: not shown again.
    const again = await render(
      <Providers me={meDto({ whatsNew: due })}>
        <WhatsNewSheet />
      </Providers>,
    );
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
    await again.unmount();
  });

  it("never opens over a workout, and not when nothing is due", async () => {
    mockPathname = "/workout/ls-1";
    await render(
      <Providers
        me={meDto({ whatsNew: { entries: [entry], throughId: entry.id } })}
      >
        <WhatsNewSheet />
      </Providers>,
    );
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
  });
});

describe("A7 Get help", () => {
  it("Send feedback opens the form on Question; Email support opens Mail", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(
      <Providers config={appConfig({ supportEmail: "help@overload.test" })}>
        <HelpScreen />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Send feedback" }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/feedback?category=question");
    await fireEvent.press(
      screen.getByRole("button", { name: "Email support" }),
    );
    expect(open).toHaveBeenCalledWith("mailto:help@overload.test");
    expect(screen.getByText("help@overload.test")).toBeTruthy();
  });

  it("with no configured address, only Send feedback is offered", async () => {
    await render(
      <Providers config={appConfig({ supportEmail: null })}>
        <HelpScreen />
      </Providers>,
    );

    expect(screen.queryByRole("button", { name: "Email support" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeTruthy();
  });

  it("when Mail can't open, it says so and keeps the address visible", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no mail"));
    await render(
      <Providers config={appConfig({ supportEmail: "help@overload.test" })}>
        <HelpScreen />
      </Providers>,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Email support" }),
    );
    expect(await screen.findByText(/Couldn't open Mail/)).toBeTruthy();
  });
});

describe("A6 Send feedback", () => {
  it("sends category and message once with the draft's key, then thanks", async () => {
    let resolve: (v: unknown) => void = () => {};
    serve({
      "POST /feedback": () => new Promise((r) => (resolve = r)),
    });
    await render(
      <Providers>
        <FeedbackScreen />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Bug" }));
    await fireEvent.changeText(
      screen.getByLabelText("Message"),
      "The rest day shows Upper B.",
    );
    const send = screen.getByRole("button", { name: "Send" });
    await fireEvent.press(send);
    await fireEvent.press(send);
    await act(async () => resolve({ sent: true }));
    expect(await screen.findByText("Thanks — sent to the owner.")).toBeTruthy();
    const posts = writes();
    expect(posts).toHaveLength(1);
    expect(posts[0].headers?.["Idempotency-Key"]).toMatch(/^ovl-/);
    const fd = posts[0].formData as unknown as {
      getAll: (k: string) => unknown[];
    };
    expect(fd.getAll("category")).toEqual(["bug"]);
    expect(fd.getAll("message")).toEqual(["The rest day shows Upper B."]);
  });

  it("a failure keeps the draft and its key, so a retry is the same intent", async () => {
    serve({ "POST /feedback": new ApiError("network", "offline") });
    await render(
      <Providers>
        <FeedbackScreen />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Idea" }));
    await fireEvent.changeText(screen.getByLabelText("Message"), "More charts");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Couldn't send. Your message is still here."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Message").props.value).toBe("More charts");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    const [a, b] = writes();
    expect(a.headers?.["Idempotency-Key"]).toBe(b.headers?.["Idempotency-Key"]);
  });

  it("the daily limit is said plainly", async () => {
    serve({
      "POST /feedback": new ApiError("conflict", "limit", 409, {
        reason: "daily_limit",
      }),
    });
    updateFeedbackDraft({ category: "bug", message: "x" });
    await render(
      <Providers>
        <FeedbackScreen />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(
        "You've sent a lot of feedback today. Try again tomorrow.",
      ),
    ).toBeTruthy();
  });

  it("Get help's link preselects Question; Cancel with a draft asks first", async () => {
    mockParams = { category: "question" };
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(
      <Providers>
        <FeedbackScreen />
      </Providers>,
    );
    expect(
      screen.getByRole("button", { name: "Question" }).props.accessibilityState
        ?.selected,
    ).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(alert).toHaveBeenCalledWith(
      "Discard this feedback?",
      undefined,
      expect.any(Array),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("sign-out forgets the draft", async () => {
    updateFeedbackDraft({ category: "bug", message: "private words" });
    clearAccountQueries(new QueryClient());
    let seen = "";
    function Probe() {
      seen = useFeedbackDraft().message;
      return null;
    }
    await render(<Probe />);
    expect(seen).toBe("");
  });
});

// ACCOUNT_KEYS is part of the module's surface the cleanup relies on.
it("account query keys are distinct from app-config", () => {
  for (const key of Object.values(ACCOUNT_KEYS)) {
    expect(key[0]).not.toBe(QUERY_KEYS.appConfig[0]);
  }
});
