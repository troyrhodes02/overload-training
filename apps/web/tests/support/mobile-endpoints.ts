/**
 * The mobile API endpoint registry (Pitch 21c spec §17; RD-13). Every exported
 * method of every route under src/app/api/mobile is listed here:
 *  - tests/unit/mobile-api-guards.test.ts fails when a route method is missing
 *    from this list (or listed but gone), and pins the public set;
 *  - tests/integration/isolation/mobile-api.int.test.ts fails when an entry
 *    here has no isolation case.
 * Adding an endpoint therefore means adding it here AND giving it cases.
 */
export type MobileEndpoint = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The route directory under src/app, e.g. "api/mobile/v1/me". */
  route: string;
  /** public: no token (app config, the unknown-path 404); account: token required. */
  auth: "public" | "account";
};

const CATCH_ALL = "api/mobile/[...path]";

export const MOBILE_ENDPOINTS: readonly MobileEndpoint[] = [
  { method: "GET", route: "api/mobile/v1/app-config", auth: "public" },
  { method: "GET", route: "api/mobile/v1/me", auth: "account" },
  { method: "GET", route: "api/mobile/v1/today", auth: "account" },
  { method: "GET", route: "api/mobile/v1/gyms", auth: "account" },
  ...(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((method) => ({
    method,
    route: CATCH_ALL,
    auth: "public" as const,
  })),
];

/** The only routes allowed to skip the token (spec §6.3). */
export const PUBLIC_MOBILE_ROUTES: readonly string[] = [
  "api/mobile/v1/app-config",
  CATCH_ALL,
];

export const endpointKey = (e: Pick<MobileEndpoint, "method" | "route">) =>
  `${e.method} ${e.route}`;
