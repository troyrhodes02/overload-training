import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import type { JsonValue } from "@overload/shared/contracts/wire";
import { apiErrorResponse, apiJson, ApiFailure } from "./errors";

/**
 * Retry-safe creates for the mobile API (Pitch 21c spec §12; RD-7).
 *
 * A create request carries an `Idempotency-Key` the app generates once per
 * user intent and resends unchanged on a retry. In ONE transaction on the
 * account's scoped client:
 *
 *   1. claim  — insert (account, key, scope, request hash). A concurrent
 *               request with the same key blocks on the (user_id, key) unique
 *               index until this transaction ends;
 *   2. run    — the create itself, on the same transaction;
 *   3. record — the successful status and body on the claimed row.
 *
 * Create and claim commit or roll back together, so a failed request leaves
 * no record and the same key can be retried. Afterwards, any failure is
 * answered from what is committed for the key:
 *   - same scope and hash → the stored answer, `Idempotent-Replayed: true`
 *     (a retry, or the loser of a concurrent duplicate);
 *   - different scope or hash → 409 conflict (the key was reused);
 *   - nothing → the original failure.
 *
 * Keys are per account: the scoped client and the (user_id, key) index never
 * look at another account's rows, so reusing someone else's key just runs the
 * request for this account. No client-supplied primary key exists anywhere.
 * Records are kept until the account is deleted (no scheduler to prune them).
 */

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const REPLAYED_HEADER = "Idempotent-Replayed";

const KEY = /^[A-Za-z0-9._:-]{8,255}$/;
const TRANSACTION_TIMEOUT_MS = 15_000;

/** The header's key, or the 400 to answer with. */
export function parseIdempotencyKey(raw: string | null): string | ApiFailure {
  const key = raw?.trim() ?? "";
  if (KEY.test(key)) return key;
  return new ApiFailure(
    "validation_error",
    key === ""
      ? "Send an Idempotency-Key with this request."
      : "That Idempotency-Key isn't valid.",
    {
      [IDEMPOTENCY_HEADER]:
        "Send 8 to 255 characters: letters, digits, '.', '_', ':', or '-'.",
    },
  );
}

/** Stable JSON: object keys sorted at every depth; undefined values dropped. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** SHA-256 of the scope and the canonical body: what makes two requests "the same". */
export function requestFingerprint(scope: string, body: unknown): string {
  return createHash("sha256")
    .update(`${scope}\n${canonicalJson(body)}`)
    .digest("hex");
}

/**
 * A create's success: a 2xx status other than 204 with a non-null JSON body
 * (a Prisma Json column can't store null, and a 204 can't carry a body to
 * replay; review audit #6).
 */
export type IdempotentBody = Exclude<JsonValue, null>;
export type IdempotentResult<T extends IdempotentBody> = {
  status: number;
  body: T;
};

export async function withIdempotency<T extends IdempotentBody>(
  account: Account,
  args: { key: string; scope: string; body: unknown },
  run: (tx: AccountTx) => Promise<IdempotentResult<T>>,
): Promise<Response> {
  const requestHash = requestFingerprint(args.scope, args.body);
  try {
    const result = await account.db.$transaction(
      async (tx) => {
        const claim = await tx.apiIdempotencyKey.create({
          data: {
            userId: account.userId,
            key: args.key,
            scope: args.scope,
            requestHash,
          },
          select: { id: true },
        });
        const outcome = await run(tx);
        if (
          outcome.status < 200 ||
          outcome.status > 299 ||
          outcome.status === 204 ||
          outcome.body === null
        ) {
          // Only successes with a body are recorded; a handler signals failure
          // by throwing.
          throw new Error("withIdempotency: not a recordable success");
        }
        await tx.apiIdempotencyKey.update({
          where: { id: claim.id },
          data: {
            responseStatus: outcome.status,
            responseBody: outcome.body as Prisma.InputJsonValue,
          },
        });
        return outcome;
      },
      { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS },
    );
    return apiJson(result.body, { status: result.status });
  } catch (error) {
    // If this lookup fails too (say, the same exhausted pool), answer with the
    // ORIGINAL failure, never the lookup's (release review #6).
    const stored = await account.db.apiIdempotencyKey
      .findFirst({
        where: { key: args.key },
        select: {
          scope: true,
          requestHash: true,
          responseStatus: true,
          responseBody: true,
        },
      })
      .catch(() => null);
    if (stored && stored.responseStatus !== null) {
      if (stored.scope === args.scope && stored.requestHash === requestHash) {
        return apiJson(stored.responseBody, {
          status: stored.responseStatus,
          headers: { [REPLAYED_HEADER]: "true" },
        });
      }
      return apiErrorResponse(
        new ApiFailure(
          "conflict",
          "This Idempotency-Key was already used for a different request.",
        ),
      );
    }
    // Nothing committed for this key: the request simply failed. Answer with
    // its own error (the pipeline maps it); the key stays free to retry.
    throw error;
  }
}
