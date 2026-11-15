import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import { ENV } from "../config/env";
import { secureStorage } from "./secure-storage";

// Error classification only (a pure helper): temporary versus definitive.
export { isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Supabase AUTH for the iPhone app (spec §5, §10; RD-4). This is the only
 * module that imports supabase-js (boundary rule B9), and it exports only
 * the auth client, so no file in the app can reach a database table, a
 * function, Storage, or Realtime. Application data comes only from the
 * mobile API.
 */

export const AUTH_STORAGE_KEY = "overload.auth";

function createAuth() {
  // A misconfigured build never reaches here: the root layout shows the
  // misconfigured gate first. The placeholder values keep module load safe.
  const url = ENV.ok ? ENV.config.supabaseUrl : "https://invalid.invalid";
  const key = ENV.ok ? ENV.config.supabaseAnonKey : "invalid";
  return createClient(url, key, {
    auth: {
      storage: secureStorage,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  }).auth;
}

export const auth = createAuth();
export type AuthClient = typeof auth;
