/**
 * Pitch 21d spec §7 (RD-3): the staging access key is attached only to the
 * staging API origin, only in the staging environment, and never to Supabase
 * or Cloudflare. A future production build can't attach it.
 */
import {
  STAGING_API_ORIGIN,
  type MobileEnvironmentCheck,
} from "@overload/shared/mobile/environment";
import {
  BYPASS_HEADER,
  bypassHeaderFor,
  isPlausibleKey,
  stagingAccessAllowed,
} from "../src/staging-access/key";

const staging: MobileEnvironmentCheck = {
  ok: true,
  config: {
    environment: "staging",
    apiOrigin: STAGING_API_ORIGIN,
    localApi: false,
    supabaseUrl: "https://x.supabase.co",
    supabaseRef: "x",
    supabaseAnonKey: "k",
  },
};
const KEY = "0123456789abcdef0123456789abcdef";

describe("staging access key", () => {
  it("attaches only to the staging API origin", () => {
    expect(
      bypassHeaderFor(`${STAGING_API_ORIGIN}/api/mobile/v1/me`, KEY, staging),
    ).toEqual({ [BYPASS_HEADER]: KEY });
    for (const url of [
      "https://vdxrmfadikwzodjljbdi.supabase.co/auth/v1/token",
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
      `${STAGING_API_ORIGIN}.evil.example/api`,
      "http://localhost:3200/api/mobile/v1/me",
    ]) {
      expect(bypassHeaderFor(url, KEY, staging)).toEqual({});
    }
  });

  it("refuses outside staging (a future production build) and without a key", () => {
    const production = {
      ok: true,
      config: { ...staging.config, environment: "production" },
    } as unknown as MobileEnvironmentCheck;
    expect(stagingAccessAllowed(production)).toBe(false);
    expect(bypassHeaderFor(`${STAGING_API_ORIGIN}/x`, KEY, production)).toEqual(
      {},
    );
    expect(bypassHeaderFor(`${STAGING_API_ORIGIN}/x`, null, staging)).toEqual(
      {},
    );
    expect(stagingAccessAllowed({ ok: false, problems: [] })).toBe(false);
  });

  it("accepts only key-shaped input", () => {
    expect(isPlausibleKey(KEY)).toBe(true);
    expect(isPlausibleKey("short")).toBe(false);
    expect(isPlausibleKey("has spaces in it but long enough")).toBe(false);
  });
});
