import { APP_VERSION, ENV } from "../config/env";
import { bypassHeaderFor, readStagingKey } from "../staging-access/key";
import { classifyResponse } from "./classify";
import { ApiError, MESSAGES } from "./errors";

/**
 * The one client for `/api/mobile/v1` (spec §6). Every request carries
 * `X-Overload-App-Version`, an authenticated request carries the bearer
 * token, and a 401 gets exactly one refresh-and-retry. Nothing is logged
 * except the method, path, status, and code: never a header, a body, or a
 * token.
 */

export const TIMEOUT_MS = 15_000;

export type TokenSource = {
  /** The current access token, refreshed first if it has expired. */
  accessToken(): Promise<string | null>;
  /** Refresh after a 401. Throws an ApiError for a temporary failure. */
  refresh(): Promise<string | null>;
};

export type ClientDeps = {
  fetch: typeof fetch;
  apiOrigin: string;
  appVersion: string;
  tokens: TokenSource;
  stagingKey: () => Promise<string | null>;
  onUpgradeRequired: () => void;
  now?: () => number;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send the bearer token (default true). */
  auth?: boolean;
  signal?: AbortSignal;
  /**
   * Extra headers, such as a create's `Idempotency-Key` (Pitch 21h). They
   * can never replace the version, auth, or content headers set here.
   */
  headers?: Record<string, string>;
};

export function createApiClient(deps: ClientDeps) {
  async function send(
    path: string,
    opts: RequestOptions,
    token: string | null,
  ) {
    const url = `${deps.apiOrigin}/api/mobile/v1${path}`;
    const headers: Record<string, string> = {
      ...opts.headers,
      Accept: "application/json",
      "X-Overload-App-Version": deps.appVersion,
      ...bypassHeaderFor(url, await deps.stagingKey()),
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const forward = () => controller.abort();
    opts.signal?.addEventListener("abort", forward);
    try {
      const res = await deps.fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      return {
        status: res.status,
        url: res.url || url,
        contentType: res.headers.get("content-type"),
        retryAfter: res.headers.get("retry-after"),
        bodyText: await res.text(),
      };
    } catch {
      throw new ApiError("network", MESSAGES.network);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", forward);
    }
  }

  async function request<T>(
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const authed = opts.auth !== false;
    let token: string | null = null;
    if (authed) {
      token = await deps.tokens.accessToken();
      if (!token) throw new ApiError("signed_out", MESSAGES.signed_out);
    }

    let result = classifyResponse<T>(
      await send(path, opts, token),
      deps.apiOrigin,
    );

    // One refresh-and-retry on the API's own 401 (never on a Vercel page).
    if (!result.ok && authed && result.error.code === "unauthorized") {
      const fresh = await deps.tokens.refresh();
      if (!fresh) throw new ApiError("signed_out", MESSAGES.signed_out);
      result = classifyResponse<T>(
        await send(path, opts, fresh),
        deps.apiOrigin,
      );
    }

    if (result.ok) return result.data;
    if (result.error.code === "upgrade_required") deps.onUpgradeRequired();
    if (__DEV__) {
      console.warn(
        `api ${opts.method ?? "GET"} ${path} → ${result.error.status ?? "-"} ${result.error.code}`,
      );
    }
    throw result.error;
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** The default origin for this build (the misconfigured gate stops earlier). */
export function apiOrigin(): string {
  return ENV.ok ? ENV.config.apiOrigin : "https://invalid.invalid";
}

export const defaultClientDeps = {
  appVersion: APP_VERSION,
  stagingKey: readStagingKey,
};
