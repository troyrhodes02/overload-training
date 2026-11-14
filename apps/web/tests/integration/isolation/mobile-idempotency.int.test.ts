/**
 * Pitch 21c (spec §12; RD-7): withIdempotency against a real database. The
 * guarded create is the real createGym, run on the claim's transaction —
 * exactly how a later POST /gyms will use it.
 */
import {
  withIdempotency,
  requestFingerprint,
  canonicalJson,
} from "@/lib/api/mobile/idempotency";
import { createGym } from "@/lib/gyms/gyms";
import { DomainError } from "@/lib/actions/result";
import { createTestAccount } from "../support/accounts";
import { getTestPrisma } from "../support/db";
import type { Account } from "@/lib/data/account";

const SCOPE = "POST /v1/gyms";

function createGymOnce(account: Account, key: string, body: { name: string }) {
  return withIdempotency(account, { key, scope: SCOPE, body }, async (tx) => {
    const gym = await createGym(account, body, tx);
    return {
      status: 201,
      body: { id: gym.id, name: gym.name, address: gym.address },
    };
  });
}

const gymCount = (userId: string) =>
  getTestPrisma().gym.count({ where: { userId } });
const keyRows = (userId: string) =>
  getTestPrisma().apiIdempotencyKey.findMany({ where: { userId } });

describe("withIdempotency", () => {
  it("records the first success and replays it for a retry, creating once", async () => {
    const a = await createTestAccount();
    const first = await createGymOnce(a, "key-0000-aaaa", { name: "Downtown" });
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    const body = await first.json();

    const retry = await createGymOnce(a, "key-0000-aaaa", { name: "Downtown" });
    expect(retry.status).toBe(201);
    expect(retry.headers.get("idempotent-replayed")).toBe("true");
    expect(await retry.json()).toEqual(body);
    expect(await gymCount(a.userId)).toBe(1);
    const rows = await keyRows(a.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "key-0000-aaaa",
      scope: SCOPE,
      responseStatus: 201,
    });
  });

  it("the same key with a different request is a 409 conflict and creates nothing", async () => {
    const a = await createTestAccount();
    await createGymOnce(a, "key-0000-bbbb", { name: "Downtown" });
    const reused = await createGymOnce(a, "key-0000-bbbb", {
      name: "Campus Rec",
    });
    expect(reused.status).toBe(409);
    expect(await reused.json()).toEqual({
      error: { code: "conflict", message: expect.any(String) },
    });
    expect(await gymCount(a.userId)).toBe(1);
  });

  it("a different scope with the same key is a conflict too", async () => {
    const a = await createTestAccount();
    await createGymOnce(a, "key-0000-cccc", { name: "Downtown" });
    const other = await withIdempotency(
      a,
      {
        key: "key-0000-cccc",
        scope: "POST /v1/goals",
        body: { name: "Downtown" },
      },
      async () => ({ status: 201, body: { ok: true } }),
    );
    expect(other.status).toBe(409);
  });

  it("a failed request records nothing, and the same key then succeeds", async () => {
    const a = await createTestAccount();
    await expect(
      createGymOnce(a, "key-0000-dddd", { name: "" }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await keyRows(a.userId)).toHaveLength(0);
    expect(await gymCount(a.userId)).toBe(0);

    // A failure AFTER the create rolls the create back too.
    await expect(
      withIdempotency(
        a,
        { key: "key-0000-dddd", scope: SCOPE, body: { name: "X" } },
        async (tx) => {
          await createGym(a, { name: "X" }, tx);
          throw new DomainError("conflict", "late failure");
        },
      ),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await gymCount(a.userId)).toBe(0);
    expect(await keyRows(a.userId)).toHaveLength(0);

    const ok = await createGymOnce(a, "key-0000-dddd", { name: "Downtown" });
    expect(ok.status).toBe(201);
    expect(await gymCount(a.userId)).toBe(1);
  });

  it("concurrent duplicates create once and both answer the same body", async () => {
    const a = await createTestAccount();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        createGymOnce(a, "key-0000-eeee", { name: "Downtown" }),
      ),
    );
    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const r of responses) expect(r.status).toBe(201);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(
      responses.filter((r) => r.headers.get("idempotent-replayed") === "true"),
    ).toHaveLength(3);
    expect(await gymCount(a.userId)).toBe(1);
    expect(await keyRows(a.userId)).toHaveLength(1);
  });

  it("another account's key is invisible: B gets its own fresh result and A's row is untouched", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const ra = await createGymOnce(a, "key-0000-ffff", { name: "A Gym" });
    const aBody = await ra.json();
    const aRows = await keyRows(a.userId);

    const rb = await createGymOnce(b, "key-0000-ffff", { name: "A Gym" });
    expect(rb.status).toBe(201);
    expect(rb.headers.get("idempotent-replayed")).toBeNull();
    const bBody = await rb.json();
    expect(bBody.id).not.toBe(aBody.id);
    expect(await gymCount(b.userId)).toBe(1);
    expect(await keyRows(a.userId)).toEqual(aRows);

    // And B reusing it differently is B's conflict, saying nothing about A.
    const rb2 = await createGymOnce(b, "key-0000-ffff", { name: "Other" });
    expect(rb2.status).toBe(409);
  });

  it("the fingerprint ignores key order and undefined, and differs by scope", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe(
      '{"a":{"d":2},"b":1}',
    );
    expect(requestFingerprint(SCOPE, { a: 1, b: 2 })).toBe(
      requestFingerprint(SCOPE, { b: 2, a: 1 }),
    );
    expect(requestFingerprint(SCOPE, { a: 1 })).not.toBe(
      requestFingerprint("POST /v1/goals", { a: 1 }),
    );
  });

  it("a success without a body is not recordable: it fails and rolls the create back", async () => {
    const a = await createTestAccount();
    await expect(
      withIdempotency(
        a,
        { key: "key-0000-gggg", scope: SCOPE, body: { name: "X" } },
        async (tx) => {
          await createGym(a, { name: "X" }, tx);
          return { status: 204, body: {} };
        },
      ),
    ).rejects.toThrow();
    expect(await gymCount(a.userId)).toBe(0);
    expect(await keyRows(a.userId)).toHaveLength(0);
  });
});
