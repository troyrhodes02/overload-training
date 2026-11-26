/**
 * Pitch 21k — the native tour's progress endpoints, end to end through the
 * route handlers (spec §6, §11, §13 "API"). Only Supabase Auth is replaced: an
 * opaque token "t.<userId>.s" verifies as that user. Everything behind the
 * handlers is production code (`tour/progress.ts`) against a real database.
 * Cross-account cases live in the isolation suite.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

import type { Account } from "@/lib/data/account";
import { PUT as outcomeRoute } from "@/app/api/mobile/v1/me/tour/outcome/route";
import { POST as offeredRoute } from "@/app/api/mobile/v1/me/tour/offered/route";
import { GET as meRoute } from "@/app/api/mobile/v1/me/route";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();

async function call(
  handler: unknown,
  account: Account,
  opts: { method?: string; json?: unknown; raw?: string } = {},
) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
  });
  const body =
    opts.raw ??
    (opts.json === undefined ? undefined : JSON.stringify(opts.json));
  if (body !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request("http://localhost/api/mobile/v1/x", {
      method: opts.method ?? "POST",
      headers,
      body,
    }),
    { params: Promise.resolve({}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const row = (userId: string) =>
  db().tourProgress.findUnique({ where: { userId } });

/** A brand-new account as signup leaves it: due its tour (Pitch 11 R6). */
async function dueAccount(): Promise<Account> {
  const a = await createTestAccount();
  await db().tourProgress.create({ data: { userId: a.userId } });
  return a;
}

const autoStart = async (a: Account) =>
  (await call(meRoute, a, { method: "GET" })).body.tour.autoStart;

describe("PUT /me/tour/outcome (T1)", () => {
  it("records the latest outcome; a repeat is safe and moves only outcomeAt", async () => {
    const a = await dueAccount();
    expect(await autoStart(a)).toBe(true);

    const done = await call(outcomeRoute, a, {
      method: "PUT",
      json: { outcome: "completed" },
    });
    expect([done.status, done.body]).toEqual([200, { outcome: "completed" }]);
    const first = await row(a.userId);
    expect(first?.outcome).toBe("completed");

    // A finished tour never becomes due again (RD-8).
    expect(await autoStart(a)).toBe(false);

    const again = await call(outcomeRoute, a, {
      method: "PUT",
      json: { outcome: "completed" },
    });
    expect(again.status).toBe(200);
    const second = await row(a.userId);
    expect(second?.outcome).toBe("completed");
    expect(second?.offeredAt).toEqual(first?.offeredAt);

    // A skipped replay is the latest outcome (Pitch 11 R7); still not due.
    const skipped = await call(outcomeRoute, a, {
      method: "PUT",
      json: { outcome: "skipped" },
    });
    expect([skipped.status, skipped.body]).toEqual([
      200,
      { outcome: "skipped" },
    ]);
    expect((await row(a.userId))?.outcome).toBe("skipped");
    expect(await autoStart(a)).toBe(false);
  });

  it("an account without a row gets one that can never be due", async () => {
    const a = await createTestAccount();
    expect(await row(a.userId)).toBeNull();
    const r = await call(outcomeRoute, a, {
      method: "PUT",
      json: { outcome: "skipped" },
    });
    expect(r.status).toBe(200);
    const created = await row(a.userId);
    expect(created?.outcome).toBe("skipped");
    expect(created?.offeredAt).not.toBeNull();
    expect(await autoStart(a)).toBe(false);
  });

  it("an unknown outcome or a non-object body is a validation error and writes nothing", async () => {
    const a = await dueAccount();
    for (const json of [{ outcome: "finished" }, { outcome: null }, {}, [1]]) {
      const r = await call(outcomeRoute, a, { method: "PUT", json });
      expect([JSON.stringify(json), r.status, r.body.error.code]).toEqual([
        JSON.stringify(json),
        400,
        "validation_error",
      ]);
    }
    const bad = await call(outcomeRoute, a, {
      method: "PUT",
      raw: "{not json",
    });
    expect(bad.status).toBe(400);
    const untouched = await row(a.userId);
    expect([untouched?.offeredAt, untouched?.outcome]).toEqual([null, null]);
    expect(await autoStart(a)).toBe(true);
  });
});

describe("POST /me/tour/offered (T2)", () => {
  it("spends a due offer once; a repeat changes nothing", async () => {
    const a = await dueAccount();
    const first = await call(offeredRoute, a);
    expect([first.status, first.body]).toEqual([200, { spent: true }]);
    const spentAt = (await row(a.userId))?.offeredAt;
    expect(spentAt).not.toBeNull();
    expect(await autoStart(a)).toBe(false);

    const again = await call(offeredRoute, a);
    expect([again.status, again.body]).toEqual([200, { spent: false }]);
    expect((await row(a.userId))?.offeredAt).toEqual(spentAt);
    expect((await row(a.userId))?.outcome).toBeNull();
  });

  it("an account that was never due gets spent:false and no row", async () => {
    const a = await createTestAccount();
    const r = await call(offeredRoute, a);
    expect([r.status, r.body]).toEqual([200, { spent: false }]);
    expect(await row(a.userId)).toBeNull();
  });

  it("an account that already finished stays finished and is never due again", async () => {
    const a = await dueAccount();
    await call(outcomeRoute, a, {
      method: "PUT",
      json: { outcome: "completed" },
    });
    // recordTourOutcome's update leaves offeredAt as it was, so this call may
    // stamp it; it never touches the outcome or re-arms the tour (Pitch 11 R5).
    const r = await call(offeredRoute, a);
    expect(r.status).toBe(200);
    expect((await row(a.userId))?.outcome).toBe("completed");
    expect(await autoStart(a)).toBe(false);
    expect((await call(offeredRoute, a)).body).toEqual({ spent: false });
  });
});
