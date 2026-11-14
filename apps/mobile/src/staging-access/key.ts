import * as SecureStore from "expo-secure-store";
import { STAGING_API_ORIGIN } from "@overload/shared/mobile/environment";
import { ENV } from "../config/env";

/**
 * The staging access key (spec §7, RD-3): a Vercel "Protection Bypass for
 * Automation" secret dedicated to mobile development builds. It is never in
 * source, configuration, a build, or an update. The owner enters it once
 * per device, it lives only in this device's Keychain (excluded from backups
 * and other devices), and it is attached only to requests for the staging
 * API origin. Supabase Auth and Cloudflare never see it.
 *
 * Every function refuses outside the staging environment, so a future
 * production build can't attach it even if a key were somehow stored.
 */

const KEY = "overload.staging-access";
export const BYPASS_HEADER = "x-vercel-protection-bypass";

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Vercel bypass secrets are 32 URL-safe characters; accept a sane range. */
const SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

export function stagingAccessAllowed(env = ENV): boolean {
  return env.ok && env.config.environment === "staging";
}

export function isPlausibleKey(value: string): boolean {
  return SHAPE.test(value.trim());
}

let cached: string | null | undefined;

export async function readStagingKey(): Promise<string | null> {
  if (!stagingAccessAllowed()) return null;
  if (cached !== undefined) return cached;
  try {
    cached = await SecureStore.getItemAsync(KEY, OPTIONS);
  } catch {
    cached = null;
  }
  return cached;
}

export async function saveStagingKey(value: string): Promise<void> {
  if (!stagingAccessAllowed()) throw new Error("Staging access is unavailable");
  const trimmed = value.trim();
  if (!isPlausibleKey(trimmed))
    throw new Error("That doesn't look like an access key");
  await SecureStore.setItemAsync(KEY, trimmed, OPTIONS);
  cached = trimmed;
}

export async function removeStagingKey(): Promise<void> {
  cached = null;
  await SecureStore.deleteItemAsync(KEY, OPTIONS).catch(() => {});
}

/**
 * The bypass header for one request: only for the staging API origin
 * exactly, only in the staging environment, and only when a key is stored.
 */
export function bypassHeaderFor(
  url: string,
  key: string | null,
  env = ENV,
): Record<string, string> {
  if (!key || !stagingAccessAllowed(env)) return {};
  const origin = /^(https:\/\/[^/?#]+)/.exec(url)?.[1];
  return origin === STAGING_API_ORIGIN ? { [BYPASS_HEADER]: key } : {};
}
