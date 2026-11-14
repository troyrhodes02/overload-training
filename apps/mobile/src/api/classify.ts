import { ApiError, isApiErrorCode, MESSAGES } from "./errors";

/**
 * Turn one HTTP answer into data or an ApiError (spec §6 step 4). Pure: it
 * takes what fetch returned, so every case is unit-tested.
 *
 * Vercel Deployment Protection answers an unauthorized request with a 302 to
 * vercel.com/sso-api (fetch follows it and lands on another host) or a 401
 * or 403 HTML page. The API itself always answers JSON, so any non-JSON
 * answer from the staging host is either protection or an outage, never a
 * reason to sign out.
 */
export type RawResponse = {
  status: number;
  /** The final URL after redirects. */
  url: string;
  contentType: string | null;
  retryAfter: string | null;
  bodyText: string;
};

export function classifyResponse<T>(
  res: RawResponse,
  apiOrigin: string,
): { ok: true; data: T } | { ok: false; error: ApiError } {
  const finalOrigin = /^(https?:\/\/[^/?#]+)/.exec(res.url)?.[1] ?? apiOrigin;
  const isJson = (res.contentType ?? "")
    .toLowerCase()
    .includes("application/json");
  const retryAfter = parseRetryAfter(res.retryAfter);

  if (finalOrigin !== apiOrigin) {
    return {
      ok: false,
      error: new ApiError(
        "staging_protected",
        MESSAGES.staging_protected,
        res.status,
      ),
    };
  }
  if (!isJson) {
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: new ApiError(
          "staging_protected",
          MESSAGES.staging_protected,
          res.status,
        ),
      };
    }
    return {
      ok: false,
      error: new ApiError("unavailable", MESSAGES.unavailable, res.status),
    };
  }

  let body: unknown;
  try {
    body = res.bodyText ? JSON.parse(res.bodyText) : null;
  } catch {
    return {
      ok: false,
      error: new ApiError("unavailable", MESSAGES.unavailable, res.status),
    };
  }

  if (res.status >= 200 && res.status < 300)
    return { ok: true, data: body as T };

  const envelope = (body as { error?: unknown } | null)?.error as
    { code?: unknown; message?: unknown; details?: unknown } | undefined;
  if (envelope && typeof envelope.message === "string") {
    const code = isApiErrorCode(envelope.code)
      ? envelope.code
      : "internal_error";
    const details =
      envelope.details && typeof envelope.details === "object"
        ? Object.fromEntries(
            Object.entries(envelope.details as Record<string, unknown>).filter(
              (e): e is [string, string] => typeof e[1] === "string",
            ),
          )
        : {};
    return {
      ok: false,
      error: new ApiError(
        code,
        envelope.message,
        res.status,
        details,
        retryAfter,
      ),
    };
  }
  return {
    ok: false,
    error: new ApiError(
      res.status >= 500 ? "unavailable" : "internal_error",
      MESSAGES.unavailable,
      res.status,
    ),
  };
}

function parseRetryAfter(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
