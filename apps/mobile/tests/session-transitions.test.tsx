/**
 * The auth session, the query cache, and the gate across sign-out, restore,
 * and foreground resume (spec §5, §10; RD-4, RD-5). Regression for the
 * simulator bug on PR #215: sign-out left the app on "Opening Overload…"
 * forever, because the cache was cleared twice and the second clear removed
 * the app-config refetch in flight, which TanStack cancels silently.
 *
 * Supabase Auth is a fake that behaves like supabase-js: `signOut` removes the
 * stored session and emits SIGNED_OUT before it returns.
 */
import { useState } from "react";
import { AppState, Text } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import {
  clearAccountQueries,
  QUERY_KEYS,
  useAppConfig,
  useMe,
} from "../src/api/queries";
import { ApiError } from "../src/api/errors";
import { decideGate, toLoadable } from "../src/app-state/gate";
import { SessionProvider, useSession } from "../src/auth/session";
import { appConfig, meDto } from "./harness";

type Listener = (event: string, session: unknown) => void;
const mockListeners = new Set<Listener>();
const mockStore = new Map<string, string>();
const mockSession = { access_token: "a", refresh_token: "r" };
const mockAuth = {
  getSession: jest.fn(),
  refreshSession: jest.fn(),
  signInWithPassword: jest.fn(),
  setSession: jest.fn(),
  signOut: jest.fn(),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
  onAuthStateChange: jest.fn((cb: Listener) => {
    mockListeners.add(cb);
    return {
      data: { subscription: { unsubscribe: () => mockListeners.delete(cb) } },
    };
  }),
};
jest.mock("../src/auth/supabase", () => ({
  // A getter: jest.mock is hoisted above `mockAuth`'s initialization.
  get auth() {
    return mockAuth;
  },
  AUTH_STORAGE_KEY: "overload.auth",
  isAuthRetryableFetchError: (e: { retryable?: boolean } | null) =>
    e?.retryable === true,
}));
jest.mock("../src/auth/secure-storage", () => ({
  secureStorage: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => void mockStore.delete(k),
  },
}));
const mockApi = { request: jest.fn() };
jest.mock("../src/api/ApiProvider", () => ({ useApi: () => mockApi }));

const tick = () => new Promise((r) => setTimeout(r, 0));
const emit = (event: string, session: unknown = null) =>
  mockListeners.forEach((l) => l(event, session));

/** Deferred responses, so a test decides when a request settles. */
const pending: (() => void)[] = [];
function deferred<T>(value: T): Promise<T> {
  return new Promise((resolve) => pending.push(() => resolve(value)));
}

/** The root gate, as `src/app/_layout.tsx` computes it. */
function GateProbe() {
  const session = useSession();
  const config = useAppConfig();
  const me = useMe(session.status === "present");
  const gate = decideGate({
    envOk: true,
    config: toLoadable(config),
    session: session.status,
    me: session.status === "present" ? toLoadable(me) : "idle",
    appVersion: "0.1.0",
    upgradeRequiredSeen: false,
  });
  return (
    <>
      <Text testID="gate">{gate}</Text>
      <Text onPress={() => void session.signOut()}>Sign out</Text>
    </>
  );
}

function App({
  client,
  onSignedOut,
}: {
  client: QueryClient;
  onSignedOut: () => void;
}) {
  const [c] = useState(client);
  return (
    <QueryClientProvider client={c}>
      <SessionProvider onSignedOut={onSignedOut}>
        <GateProbe />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

const gate = () => screen.getByTestId("gate").props.children as string;

beforeEach(() => {
  jest.clearAllMocks();
  mockListeners.clear();
  mockStore.clear();
  pending.length = 0;
});

function signedInDevice() {
  mockStore.set("overload.auth", "stored");
  mockAuth.getSession.mockResolvedValue({
    data: { session: mockSession },
    error: null,
  });
}

/** First app-config and me answer at once; later requests wait (deferred). */
function api() {
  let configCalls = 0;
  mockApi.request.mockImplementation((path: string) => {
    if (path === "/app-config") {
      configCalls += 1;
      return configCalls === 1
        ? Promise.resolve(appConfig())
        : deferred(appConfig());
    }
    if (path === "/me") return Promise.resolve(meDto());
    throw new Error(`unexpected ${path}`);
  });
  return { configCalls: () => configCalls };
}

describe("sign-out", () => {
  it("returns to signed-out (Welcome), never stuck on launching, and clears the account's data once", async () => {
    signedInDevice();
    api();
    // Like supabase-js: remove the session, emit SIGNED_OUT, then return.
    mockAuth.signOut.mockImplementation(async () => {
      await tick();
      mockStore.delete("overload.auth");
      emit("SIGNED_OUT");
      await tick();
      await tick();
      return { error: null };
    });
    const client = newClient();
    const onSignedOut = jest.fn(() => clearAccountQueries(client));
    await render(<App client={client} onSignedOut={onSignedOut} />);
    await waitFor(() => expect(gate()).toBe("signed_in"));

    await act(async () => {
      screen.getByText("Sign out").props.onPress();
      for (let i = 0; i < 6; i += 1) await tick();
    });
    // Any app-config request still in flight may now settle.
    await act(async () => {
      pending.splice(0).forEach((settle) => settle());
      await tick();
    });

    await waitFor(() => expect(gate()).toBe("signed_out"));
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    // Another account never sees this account's data (RD-5); the config,
    // which is everyone's, stays.
    expect(client.getQueryData(QUERY_KEYS.me)).toBeUndefined();
    expect(client.getQueryData(QUERY_KEYS.appConfig)).toEqual(appConfig());
  });

  it("offline: removes the stored session itself and still returns to signed-out", async () => {
    signedInDevice();
    api();
    mockAuth.signOut.mockResolvedValue({ error: { retryable: true } });
    const client = newClient();
    await render(
      <App client={client} onSignedOut={() => clearAccountQueries(client)} />,
    );
    await waitFor(() => expect(gate()).toBe("signed_in"));
    await act(async () => {
      screen.getByText("Sign out").props.onPress();
      await tick();
    });
    await waitFor(() => expect(gate()).toBe("signed_out"));
    expect(mockStore.has("overload.auth")).toBe(false);
    expect(mockAuth.stopAutoRefresh).toHaveBeenCalled();
  });

  it("a later definitive refusal (SIGNED_OUT) also lands on signed-out", async () => {
    signedInDevice();
    api();
    const client = newClient();
    const onSignedOut = jest.fn(() => clearAccountQueries(client));
    await render(<App client={client} onSignedOut={onSignedOut} />);
    await waitFor(() => expect(gate()).toBe("signed_in"));
    await act(async () => emit("SIGNED_OUT"));
    await waitFor(() => expect(gate()).toBe("signed_out"));
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});

describe("launch and resume", () => {
  it("cold launch without a saved session is signed-out", async () => {
    api();
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const onSignedOut = jest.fn();
    await render(<App client={newClient()} onSignedOut={onSignedOut} />);
    await waitFor(() => expect(gate()).toBe("signed_out"));
    // Nothing was signed out, so nothing is cleared.
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("cold launch with a saved session is signed-in", async () => {
    signedInDevice();
    api();
    await render(<App client={newClient()} onSignedOut={jest.fn()} />);
    await waitFor(() => expect(gate()).toBe("signed_in"));
  });

  it("offline at launch keeps the saved session and says unreachable, never signed-out", async () => {
    mockStore.set("overload.auth", "stored");
    mockAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: { retryable: true },
    });
    mockApi.request.mockImplementation((path: string) =>
      path === "/app-config"
        ? Promise.resolve(appConfig())
        : Promise.reject(new ApiError("network", "No connection.")),
    );
    const onSignedOut = jest.fn();
    await render(<App client={newClient()} onSignedOut={onSignedOut} />);
    await waitFor(() => expect(gate()).toBe("unreachable"));
    expect(mockStore.has("overload.auth")).toBe(true);
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("refreshes the session only in the foreground", async () => {
    signedInDevice();
    api();
    const handlers: ((s: string) => void)[] = [];
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, handler) => {
        handlers.push(handler as (s: string) => void);
        return { remove: jest.fn() } as never;
      });
    await render(<App client={newClient()} onSignedOut={jest.fn()} />);
    await waitFor(() => expect(gate()).toBe("signed_in"));
    mockAuth.startAutoRefresh.mockClear();
    await act(async () => handlers.forEach((h) => h("background")));
    expect(mockAuth.stopAutoRefresh).toHaveBeenCalled();
    await act(async () => handlers.forEach((h) => h("active")));
    expect(mockAuth.startAutoRefresh).toHaveBeenCalled();
    // Resuming keeps the session and the signed-in shell.
    expect(gate()).toBe("signed_in");
  });
});
