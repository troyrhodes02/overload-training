/**
 * Root navigation across the auth transitions, on the real Expo Router (spec
 * §5). Regression for the simulator bugs on PR #215: sign-in landed on
 * "Unmatched Route" at `/`, because a guarded-out `(auth)` redirected to
 * `/(tabs)`, which has no index.
 *
 * The root layout here is the app's own RootNavigator, rendered in place of a
 * gate exactly as `src/app/_layout.tsx` does: "launching" unmounts the
 * navigator, as the gate does while `me` loads after sign-in.
 */
import { useSyncExternalStore } from "react";
import { Text } from "react-native";
import { Stack } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";
import {
  RootNavigator,
  SIGNED_IN_HOME,
  SIGNED_OUT_HOME,
} from "../src/app-state/RootNavigator";
import NotFound from "../src/app/+not-found";

type Phase = "signed_out" | "launching" | "signed_in";
let mockPhase: Phase = "signed_out";
const listeners = new Set<() => void>();
function setPhase(next: Phase) {
  mockPhase = next;
  listeners.forEach((l) => l());
}
function usePhase(): Phase {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mockPhase,
  );
}

function RootLayout() {
  const phase = usePhase();
  if (phase === "launching") return <Text>Opening Overload…</Text>;
  return <RootNavigator signedIn={phase === "signed_in"} background="#fff" />;
}

function label(text: string) {
  function Screen() {
    return <Text>{text}</Text>;
  }
  return Screen;
}
const routes = {
  _layout: RootLayout,
  "(auth)/_layout": () => <Stack />,
  "(auth)/index": label("Welcome"),
  "(auth)/sign-in": label("Sign in screen"),
  "(auth)/sign-up": label("Sign up screen"),
  // The real tabs layout is NativeTabs (UIKit); a stack has the same routes.
  "(tabs)/_layout": () => <Stack />,
  "(tabs)/today/_layout": () => <Stack />,
  "(tabs)/today/index": label("Today"),
  "(tabs)/more/_layout": () => <Stack />,
  "(tabs)/more/index": label("More"),
  "+not-found": NotFound,
};

async function launch(phase: Phase, initialUrl = "/") {
  mockPhase = phase;
  return renderRouter(routes, { initialUrl });
}

afterEach(() => listeners.clear());

describe("root navigation", () => {
  it("homes are real routes", () => {
    expect(SIGNED_IN_HOME).toBe("/today");
    expect(SIGNED_OUT_HOME).toBe("/");
  });

  it("cold launch without a session opens Welcome at /", async () => {
    const r = await launch("signed_out");
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(r.getPathname()).toBe("/");
  });

  it("cold launch with a saved session at / opens Today, never Unmatched", async () => {
    const r = await launch("signed_in");
    expect(await screen.findByText("Today")).toBeTruthy();
    expect(r.getPathname()).toBe("/today");
    expect(screen.queryByText(/Unmatched|could not be found/i)).toBeNull();
  });

  it("sign-in from the Sign in screen lands on Today through the launching gate", async () => {
    const r = await launch("signed_out", "/sign-in");
    expect(await screen.findByText("Sign in screen")).toBeTruthy();

    // The session is present; the gate shows "launching" while `me` loads.
    await act(async () => setPhase("launching"));
    expect(screen.getByText("Opening Overload…")).toBeTruthy();

    await act(async () => setPhase("signed_in"));
    expect(await screen.findByText("Today")).toBeTruthy();
    expect(r.getPathname()).toBe("/today");
    expect(screen.queryByText(/Unmatched|could not be found/i)).toBeNull();
  });

  it("sign-in with the navigator kept mounted also lands on Today", async () => {
    const r = await launch("signed_out", "/sign-in");
    await screen.findByText("Sign in screen");
    await act(async () => setPhase("signed_in"));
    expect(await screen.findByText("Today")).toBeTruthy();
    expect(r.getPathname()).toBe("/today");
  });

  it("sign-out from More returns to Welcome", async () => {
    const r = await launch("signed_in", "/more");
    expect(await screen.findByText("More")).toBeTruthy();
    await act(async () => setPhase("signed_out"));
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(r.getPathname()).toBe("/");
  });

  it("a signed-out deep link into the tabs goes to Welcome", async () => {
    const r = await launch("signed_out", "/more");
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(r.getPathname()).toBe("/");
  });

  it("a signed-in deep link to an auth screen goes to Today", async () => {
    const r = await launch("signed_in", "/sign-up");
    expect(await screen.findByText("Today")).toBeTruthy();
    expect(r.getPathname()).toBe("/today");
  });

  it("sign out, then sign in again, round-trips without a loop", async () => {
    const r = await launch("signed_in", "/today");
    await screen.findByText("Today");
    await act(async () => setPhase("signed_out"));
    await screen.findByText("Welcome");
    await act(async () => setPhase("launching"));
    await act(async () => setPhase("signed_in"));
    expect(await screen.findByText("Today")).toBeTruthy();
    expect(r.getPathname()).toBe("/today");
  });

  // Checkpoint C on the iPhone: an unknown URL showed Expo Router's
  // "Unmatched Route", whose Sitemap crashes outside Metro. The app's own
  // +not-found sends every unknown URL home instead.
  it("an unknown URL, signed out, goes to Welcome", async () => {
    const r = await launch("signed_out", "/no/such/screen");
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(r.getPathname()).toBe("/");
    expect(
      screen.queryByText(/Unmatched|Sitemap|could not be found/i),
    ).toBeNull();
  });

  it("an unknown URL, signed in, goes to Today", async () => {
    const r = await launch("signed_in", "/no/such/screen");
    expect(await screen.findByText("Today")).toBeTruthy();
    expect(r.getPathname()).toBe("/today");
    expect(
      screen.queryByText(/Unmatched|Sitemap|could not be found/i),
    ).toBeNull();
  });

  it("the not-found route changes none of the auth transitions", async () => {
    const r = await launch("signed_out", "/sign-in");
    await screen.findByText("Sign in screen");
    await act(async () => setPhase("launching"));
    await act(async () => setPhase("signed_in"));
    expect(await screen.findByText("Today")).toBeTruthy();
    await act(async () => setPhase("signed_out"));
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(r.getPathname()).toBe("/");
  });
});
