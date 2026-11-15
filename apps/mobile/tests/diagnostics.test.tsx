/**
 * Diagnostics (design M3) is a developer surface: available only in the
 * staging environment, unreachable elsewhere by row, route, or deep link, and
 * it never shows a secret.
 */
import { Text } from "react-native";
import { Stack } from "expo-router";
import { renderRouter, screen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import type { MobileEnvironmentCheck } from "@overload/shared/mobile/environment";
import { ThemeProvider } from "../src/ui/ThemeProvider";
import MoreLayout from "../src/app/(tabs)/more/_layout";
import DiagnosticsRoute from "../src/app/(tabs)/more/diagnostics";

const SECRET_KEY = "sEcReTbYpAsSkEy_0123456789abcdef";
const ANON_KEY = "anon.jwt.value-not-for-display";

let mockAvailable = true;
jest.mock("../src/diagnostics/availability", () => {
  const actual = jest.requireActual("../src/diagnostics/availability");
  return {
    ...actual,
    diagnosticsAvailable: (env?: unknown) =>
      env === undefined ? mockAvailable : actual.diagnosticsAvailable(env),
  };
});
jest.mock("../src/config/env", () => ({
  ENV: {
    ok: true,
    config: {
      environment: "staging",
      apiOrigin:
        "https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app",
      localApi: false,
      supabaseUrl: "https://vdxrmfadikwzodjljbdi.supabase.co",
      supabaseRef: "vdxrmfadikwzodjljbdi",
      supabaseAnonKey: "anon.jwt.value-not-for-display",
    },
  },
  APP_VERSION: "0.1.0",
  SOURCE_COMMIT: "30b8bb57b8cdba31c41aaba1e75df31625276856",
  webOrigin: () => null,
}));
jest.mock("expo-updates", () => ({
  isEmbeddedLaunch: false,
  updateId: "60fd1959-122c-45e1-ba69-3b1d3eb0cd9e",
  channel: "staging",
  manifest: {
    metadata: { updateGroup: "60fd1959-122c-45e1-ba69-3b1d3eb0cd9e" },
  },
  runtimeVersion: "f98506f7aaaaaaaa",
  createdAt: new Date("2026-11-14T18:00:00Z"),
}));

// The real gate, unmocked (the mock above only fixes the build's own value).
const { diagnosticsAvailable } = jest.requireActual(
  "../src/diagnostics/availability",
) as typeof import("../src/diagnostics/availability");

const env = (environment: string): MobileEnvironmentCheck =>
  ({
    ok: true,
    config: {
      environment,
      apiOrigin: "https://x.test",
      localApi: false,
      supabaseUrl: "https://ref.supabase.co",
      supabaseRef: "ref",
      supabaseAnonKey: "k",
    },
  }) as MobileEnvironmentCheck;

describe("diagnosticsAvailable", () => {
  it("is on for staging only, and off for any other or misconfigured environment", () => {
    expect(diagnosticsAvailable(env("staging"))).toBe(true);
    // Pitch 21l's Production environment is excluded by the allowlist.
    expect(diagnosticsAvailable(env("production"))).toBe(false);
    expect(diagnosticsAvailable(env("preview"))).toBe(false);
    expect(diagnosticsAvailable({ ok: false, problems: ["x"] })).toBe(false);
  });
});

function routes() {
  return {
    _layout: () => <Stack />,
    "(tabs)/_layout": () => <Stack />,
    "(tabs)/more/_layout": MoreLayout,
    "(tabs)/more/index": () => <Text>More screen</Text>,
    "(tabs)/more/diagnostics": DiagnosticsRoute,
  };
}

async function open(url: string) {
  return renderRouter(routes(), { initialUrl: url, wrapper: ThemeProvider });
}

describe("the Diagnostics route", () => {
  beforeEach(() => {
    (SecureStore as unknown as { __store: Map<string, string> }).__store.set(
      "overload.staging-access",
      SECRET_KEY,
    );
  });

  it("opens in a staging build and shows facts, never a secret", async () => {
    mockAvailable = true;
    const r = await open("/more/diagnostics");
    expect(await screen.findByText("Stored")).toBeTruthy();
    expect(r.getPathname()).toBe("/more/diagnostics");
    expect(screen.getByText("vdxrmfadikwzodjljbdi")).toBeTruthy();
    expect(screen.getByText("Remove access key")).toBeTruthy();
    // Jest runs as a development bundle, so it reports Metro, not an update.
    expect(screen.getByText("Metro (development)")).toBeTruthy();
    expect(screen.getByText("30b8bb5")).toBeTruthy();
    const json = JSON.stringify(r.toJSON());
    expect(json).not.toContain(SECRET_KEY);
    expect(json).not.toContain(ANON_KEY);
    expect(json).not.toMatch(/@|password|Bearer/i);
  });

  it("is unreachable by deep link in a non-developer build: it lands on More", async () => {
    mockAvailable = false;
    const r = await open("/more/diagnostics");
    expect(await screen.findByText("More screen")).toBeTruthy();
    expect(r.getPathname()).toBe("/more");
    expect(screen.queryByText("Remove access key")).toBeNull();
    expect(JSON.stringify(r.toJSON())).not.toContain(SECRET_KEY);
  });
});
