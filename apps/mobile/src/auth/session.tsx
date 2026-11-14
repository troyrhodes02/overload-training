import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import type { MobileSessionDto } from "@overload/shared/contracts/account";
import { ApiError, MESSAGES } from "../api/errors";
import type { TokenSource } from "../api/client";
import { secureStorage } from "./secure-storage";
import { auth, AUTH_STORAGE_KEY, isAuthRetryableFetchError } from "./supabase";

/**
 * The auth session for the whole app (spec §5, §10; RD-4, RD-5).
 *
 * - restoring: reading the Keychain at launch;
 * - none: signed out;
 * - present: a stored session exists. It may be unverified offline: a stored
 *   session whose refresh failed for a temporary reason stays present, and
 *   the gate shows "unreachable" instead of signing out (rabbit hole C).
 *
 * Only two things end a session: the user's own sign-out, and a definitive
 * refusal from Supabase Auth (an invalid or revoked refresh token, for which
 * supabase-js removes the stored session and emits SIGNED_OUT).
 */
export type SessionStatus = "restoring" | "none" | "present";

type SessionContextValue = {
  status: SessionStatus;
  tokens: TokenSource;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<
    { ok: true } | { ok: false; error: { code?: string; status?: number } }
  >;
  adoptSession: (session: MobileSessionDto) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Called when the API refuses the account itself (no profile). */
  forgetSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function hasStoredSession(): Promise<boolean> {
  return (await secureStorage.getItem(AUTH_STORAGE_KEY)) !== null;
}

export const tokens: TokenSource = {
  async accessToken() {
    const { data, error } = await auth.getSession();
    if (data.session) return data.session.access_token;
    if (error && isAuthRetryableFetchError(error)) {
      throw new ApiError("network", MESSAGES.network);
    }
    return null;
  },
  async refresh() {
    const { data, error } = await auth.refreshSession();
    if (data.session) return data.session.access_token;
    if (
      error &&
      (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)
    ) {
      throw new ApiError("unavailable", MESSAGES.unavailable);
    }
    // Definitive: supabase-js removed the stored session and emits SIGNED_OUT.
    return null;
  },
};

export function SessionProvider({
  children,
  onSignedOut,
}: {
  children: React.ReactNode;
  onSignedOut: () => void;
}) {
  const [status, setStatusState] = useState<SessionStatus>("restoring");
  const statusRef = useRef<SessionStatus>("restoring");
  const setStatus = useCallback((next: SessionStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
  const onSignedOutRef = useRef(onSignedOut);
  useEffect(() => {
    onSignedOutRef.current = onSignedOut;
  }, [onSignedOut]);

  // One sign-out runs this twice (Supabase's SIGNED_OUT event, then the
  // sign-out call returning), so the cache is cleared only on the transition
  // from a present session.
  const markNone = useCallback(() => {
    const wasPresent = statusRef.current === "present";
    setStatus("none");
    if (wasPresent) onSignedOutRef.current();
  }, [setStatus]);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await auth.getSession();
      if (!live) return;
      if (data.session) setStatus("present");
      else if (
        error &&
        isAuthRetryableFetchError(error) &&
        (await hasStoredSession())
      ) {
        // Offline with an expired token: keep it; the gate says unreachable.
        setStatus("present");
      } else setStatus((await hasStoredSession()) ? "present" : "none");
    })().catch(() => live && setStatus("none"));

    const { data: sub } = auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION is handled by the explicit restore above, which knows
      // the difference between "no session" and "offline with a session".
      if (event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") markNone();
      else if (session) setStatus("present");
    });

    // Refresh only while the app is in the foreground (Supabase's React
    // Native pattern); a background app does no network work.
    if (AppState.currentState === "active") auth.startAutoRefresh();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") auth.startAutoRefresh();
      else auth.stopAutoRefresh();
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
      appState.remove();
      auth.stopAutoRefresh();
    };
  }, [markNone, setStatus]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      tokens,
      async signInWithPassword(email, password) {
        const { data, error } = await auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.session) {
          return { ok: false, error: error ?? { status: 500 } };
        }
        setStatus("present");
        return { ok: true };
      },
      async adoptSession(session) {
        const { data, error } = await auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });
        if (error || !data.session) return false;
        setStatus("present");
        return true;
      },
      async signOut() {
        // Revokes this device's refresh token; the web and other devices stay
        // signed in (local scope, as on the web).
        const { error } = await auth.signOut({ scope: "local" });
        // Offline: supabase-js keeps the stored session when the revoke call
        // fails, so remove it here. The user asked to sign out.
        if (error) {
          // Stop the refresh timer first, so no in-flight refresh can write
          // the session back after it is removed (review #3).
          auth.stopAutoRefresh();
          await secureStorage.removeItem(AUTH_STORAGE_KEY);
        }
        markNone();
      },
      async forgetSession() {
        auth.stopAutoRefresh();
        await secureStorage.removeItem(AUTH_STORAGE_KEY);
        markNone();
      },
    }),
    [status, markNone, setStatus],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
