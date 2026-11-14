/**
 * Pitch 21d design S2, S3, S5, M1, M2: render and behavior tests, in both
 * appearances. The session and the API client are fakes; nothing touches the
 * network.
 */
import { Appearance } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { ApiError } from "../src/api/errors";
import { appConfig, meDto, Providers } from "./harness";
import SignInScreen from "../src/app/(auth)/sign-in";
import SignUpScreen from "../src/app/(auth)/sign-up";
import ResetPasswordScreen from "../src/app/(auth)/reset-password";
import MoreScreen from "../src/app/(tabs)/more/index";
import AppearanceScreen from "../src/app/(tabs)/more/appearance";

const mockSession = {
  status: "none",
  signInWithPassword: jest.fn(),
  adoptSession: jest.fn(async () => true),
  signOut: jest.fn(async () => {}),
  forgetSession: jest.fn(),
  tokens: {},
};
jest.mock("../src/auth/session", () => ({ useSession: () => mockSession }));
const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));
jest.mock("../src/config/env", () => ({
  ENV: {
    ok: true,
    config: {
      environment: "staging",
      apiOrigin: "https://staging.test",
      localApi: false,
      supabaseRef: "ref",
    },
  },
  APP_VERSION: "0.1.0",
  webOrigin: () => "https://staging.test",
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: "s", Warning: "w" },
}));
jest.mock("react-native-webview", () => ({ WebView: () => null }));

beforeEach(() => jest.clearAllMocks());

describe.each(["light", "dark"] as const)("in %s appearance", (scheme) => {
  beforeAll(() => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue(scheme);
  });

  it("S2 shows the web's message for a wrong password and keeps the email", async () => {
    mockSession.signInWithPassword.mockResolvedValue({
      ok: false,
      error: { code: "invalid_credentials", status: 400 },
    });
    await render(
      <Providers>
        <SignInScreen />
      </Providers>,
    );
    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "sam@example.com",
    );
    await fireEvent.changeText(screen.getByLabelText("Password"), "nope");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Wrong email or password.")).toBeTruthy();
    expect(screen.getByLabelText("Email").props.value).toBe("sam@example.com");
  });

  it("S3 shows the server's field errors, keeps the typed values, and sends no invite code", async () => {
    mockApi.request.mockRejectedValue(
      new ApiError("validation_error", "Check the highlighted fields.", 400, {
        username: "That username is taken.",
      }),
    );
    await render(
      <Providers>
        <SignUpScreen />
      </Providers>,
    );
    const type = (label: string, v: string) =>
      fireEvent.changeText(screen.getByLabelText(label), v);
    await type("First name", "Sam");
    await type("Last name", "Ortiz");
    await type("Username", "taken_name");
    await type("Email", "sam@example.com");
    await type("Password", "barbell-315");
    await type("Confirm password", "barbell-315");
    await fireEvent.press(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(await screen.findByText("That username is taken.")).toBeTruthy();
    expect(screen.getByLabelText("Username").props.value).toBe("taken_name");
    const [path, opts] = mockApi.request.mock.calls[0];
    expect(path).toBe("/accounts");
    expect(opts).toMatchObject({ method: "POST", auth: false });
    expect(opts.body).not.toHaveProperty("inviteCode");
    expect(opts.body.timeZone).toEqual(expect.any(String));
  });

  it("S3 adopts the returned session on success", async () => {
    const sessionDto = {
      accessToken: "a",
      refreshToken: "r",
      expiresAt: 1,
      tokenType: "bearer",
    };
    mockApi.request.mockResolvedValue({ session: sessionDto });
    await render(
      <Providers>
        <SignUpScreen />
      </Providers>,
    );
    for (const [label, v] of [
      ["First name", "Sam"],
      ["Last name", "Ortiz"],
      ["Username", "sam_new"],
      ["Email", "s@example.com"],
      ["Password", "barbell-315"],
      ["Confirm password", "barbell-315"],
    ]) {
      await fireEvent.changeText(screen.getByLabelText(label), v);
    }
    await fireEvent.press(
      screen.getByRole("button", { name: "Create account" }),
    );
    await waitFor(() =>
      expect(mockSession.adoptSession).toHaveBeenCalledWith(sessionDto),
    );
  });

  it("S3 waits for the challenge when the server requires one, and refuses when it can't be shown", async () => {
    await render(
      <Providers
        config={appConfig({
          botChallenge: {
            provider: "turnstile",
            siteKey: "k",
            origin: "https://w.example",
          },
        })}
      >
        <SignUpScreen />
      </Providers>,
    );
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeDisabled();
    await render(
      <Providers
        config={appConfig({
          botChallenge: { provider: "turnstile", siteKey: null, origin: null },
        })}
      >
        <SignUpScreen />
      </Providers>,
    );
    expect(
      screen.getByText(/Signup isn't available in the app right now/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeDisabled();
  });

  it("S5 shows the web's identical sent copy", async () => {
    mockApi.request.mockResolvedValue({ sent: true });
    await render(
      <Providers>
        <ResetPasswordScreen />
      </Providers>,
    );
    await fireEvent.changeText(
      screen.getByLabelText("Email"),
      "Nobody@Example.com",
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Send reset link" }),
    );
    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(
      screen.getByText(
        /a link to reset its password is on the way\. The link works once and expires in 1 hour\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText("nobody@example.com")).toBeTruthy();
  });

  it("M1 shows the account, the server's plan words, and no purchase path", async () => {
    await render(
      <Providers me={meDto()}>
        <MoreScreen />
      </Providers>,
    );
    expect(screen.getByText("Sam Ortiz")).toBeTruthy();
    expect(screen.getByText("Pro — trial · 9d")).toBeTruthy();
    expect(screen.queryByText(/upgrade|subscribe|buy|price|\$/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("M2 serializes saves: a tap during a save is queued and the last choice wins", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    mockApi.request.mockImplementation(
      (_path: string, opts: { body: { appearance: string } }) =>
        new Promise((resolve) =>
          resolvers.push(() => resolve({ appearance: opts.body.appearance })),
        ),
    );
    await render(
      <Providers>
        <AppearanceScreen />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Dark" }));
    await fireEvent.press(screen.getByRole("button", { name: "Light" }));
    await fireEvent.press(screen.getByRole("button", { name: "System" }));
    await fireEvent.press(screen.getByRole("button", { name: "Light" }));
    // Only one save in flight; the newest queued choice goes next.
    expect(mockApi.request).toHaveBeenCalledTimes(1);
    resolvers[0](undefined);
    await waitFor(() => expect(mockApi.request).toHaveBeenCalledTimes(2));
    expect(mockApi.request.mock.calls[1][1]).toEqual({
      method: "PUT",
      body: { appearance: "light" },
    });
    resolvers[1](undefined);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Light" })).toBeSelected(),
    );
  });

  it("M2 applies a choice and returns the saved one when the save fails", async () => {
    mockApi.request.mockRejectedValue(new ApiError("network", "offline"));
    await render(
      <Providers>
        <AppearanceScreen />
      </Providers>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Dark" }));
    expect(
      await screen.findByText("Couldn't save your appearance. Try again."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "System" })).toBeSelected();
    expect(mockApi.request).toHaveBeenCalledWith("/me/appearance", {
      method: "PUT",
      body: { appearance: "dark" },
    });
  });
});
