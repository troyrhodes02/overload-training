import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { Account } from "@/lib/data/account";
import {
  authenticateMobileRequest,
  type MobileAuthDeps,
} from "@/lib/data/mobile-auth";
import { apiErrorResponse, ApiFailure, toApiFailure } from "./errors";
import {
  APP_VERSION_HEADER,
  checkAppVersion,
  type AppVersion,
} from "./version";

/**
 * The mobile API request pipeline (Pitch 21c spec §6.3). Every route under
 * src/app/api/mobile is built with one of these two wrappers (static guard),
 * so no endpoint can skip the version gate, token verification, the
 * suspension check, the rate limit, or the error envelope.
 *
 *   connection() → version gate → token → account → suspension
 *     → last-active → rate limit → handler → JSON (or the error envelope)
 *
 * Handlers never redirect, never call notFound(), never read cookies, and
 * never take an account id from the request: the account is handed to them.
 */

export type MobileContext = {
  account: Account;
  /** The verified email from Supabase Auth (for `me`), never from the request. */
  email: string;
  request: Request;
  appVersion: AppVersion;
};

type RouteArgs<P> = { params: Promise<P> };

export type PipelineDeps = MobileAuthDeps;

/**
 * Request-time work first, OUTSIDE the error envelope: during `next build`,
 * `connection()` throws Next's own prerender bail-out, which must reach Next
 * (so the route is dynamic) instead of being answered as a 500. Inside, any
 * other Next control-flow error is re-thrown the same way.
 */
async function run(fn: () => Promise<Response>): Promise<Response> {
  await connection();
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    return apiErrorResponse(toApiFailure(error));
  }
}

/** An authenticated endpoint. */
export function mobileRoute<P = Record<string, never>>(
  handler: (ctx: MobileContext, params: P) => Promise<Response>,
  deps: PipelineDeps = {},
): (request: Request, route: RouteArgs<P>) => Promise<Response> {
  return (request, route) =>
    run(async () => {
      const version = checkAppVersion(request.headers.get(APP_VERSION_HEADER));
      if (version instanceof ApiFailure) return apiErrorResponse(version);

      const auth = await authenticateMobileRequest(request, deps);
      if (!auth.ok) return apiErrorResponse(auth.failure);

      const params = (await route?.params) ?? ({} as P);
      return handler(
        {
          account: auth.account,
          email: auth.email,
          request,
          appVersion: version,
        },
        params,
      );
    });
}

/**
 * A public endpoint: no token, no version gate, no rate limit. Only app config
 * (an old app must still be able to read it) and the unknown-path 404 use it;
 * a static guard pins that list.
 */
export function publicMobileRoute<P = Record<string, never>>(
  handler: (request: Request, params: P) => Promise<Response>,
): (request: Request, route: RouteArgs<P>) => Promise<Response> {
  return (request, route) =>
    run(async () => {
      const params = (await route?.params) ?? ({} as P);
      return handler(request, params);
    });
}
