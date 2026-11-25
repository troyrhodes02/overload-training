/**
 * Pitch 21j — feedback from the iPhone app, end to end through the route
 * handler (spec §6 E6, §13 "Feedback"). Replaced: Supabase Auth's token check
 * and the private Storage bucket (an in-memory recorder). The pipeline, the
 * shared submission, the idempotency claim, and every row are real.
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
const stored = new Set<string>();
const uploads: string[] = [];
jest.mock("@/lib/feedback/screenshots", () => ({
  uploadFeedbackScreenshots: jest.fn(
    async (
      prefix: string,
      files: { contentType: string; sizeBytes: number }[],
    ) =>
      files.map((f, i) => {
        const objectPath = `${prefix}/${i}.${f.contentType === "image/png" ? "png" : "jpg"}`;
        stored.add(objectPath);
        uploads.push(objectPath);
        return {
          objectPath,
          contentType: f.contentType,
          sizeBytes: f.sizeBytes,
        };
      }),
  ),
  removeFeedbackScreenshots: jest.fn(async (paths: string[]) => {
    for (const p of paths) stored.delete(p);
  }),
}));

import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { POST as feedbackRoute } from "@/app/api/mobile/v1/feedback/route";
import { FEEDBACK_DAILY_LIMIT } from "@overload/shared/feedback/validation";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const db = () => getTestPrisma();
const PNG = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

function form(
  fields: { category?: string; message?: string },
  shots: { bytes: Uint8Array; type: string; name?: string }[] = [],
) {
  const fd = new FormData();
  if (fields.category !== undefined) fd.set("category", fields.category);
  if (fields.message !== undefined) fd.set("message", fields.message);
  for (const s of shots) {
    fd.append(
      "screenshots",
      new File([s.bytes as Uint8Array<ArrayBuffer>], s.name ?? "shot", {
        type: s.type,
      }),
    );
  }
  return fd;
}

async function send(account: Account, body: FormData, key?: string | null) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
  });
  if (key !== null) headers.set("idempotency-key", key ?? randomUUID());
  const res = await (feedbackRoute as Handler)(
    new Request("http://localhost/api/mobile/v1/feedback", {
      method: "POST",
      headers,
      body,
    }),
    { params: Promise.resolve({}) as Promise<never> },
  );
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? JSON.parse(text) : null,
  };
}

const feedbackFor = (userId: string) =>
  db().feedback.findMany({
    where: { userId },
    include: { attachments: true },
  });

beforeEach(() => {
  stored.clear();
  uploads.length = 0;
});

describe("E6 POST /feedback", () => {
  it("text only: 201, one entry in the owner's inbox data", async () => {
    const a = await createTestAccount();
    const r = await send(a, form({ category: "bug", message: "  It broke. " }));
    expect([r.status, r.body]).toEqual([201, { sent: true }]);
    const rows = await feedbackFor(a.userId);
    expect(
      rows.map((f) => [f.category, f.message, f.attachments.length]),
    ).toEqual([["bug", "It broke.", 0]]);
  });

  it("a retry with the same key and body is replayed: one entry, no second upload", async () => {
    const a = await createTestAccount();
    const key = `fb-${randomUUID()}`;
    const shot = [{ bytes: PNG(), type: "image/png" }];
    const first = await send(
      a,
      form({ category: "idea", message: "More" }, shot),
      key,
    );
    const again = await send(
      a,
      form({ category: "idea", message: "More" }, shot),
      key,
    );
    expect([first.status, again.status]).toEqual([201, 201]);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(await feedbackFor(a.userId)).toHaveLength(1);
    expect(uploads).toHaveLength(1);
    expect(stored.size).toBe(1);
  });

  it("the same key with a different message is a 409, and nothing new is stored", async () => {
    const a = await createTestAccount();
    const key = `fb-${randomUUID()}`;
    await send(a, form({ category: "idea", message: "One" }), key);
    const r = await send(a, form({ category: "idea", message: "Two" }), key);
    expect([r.status, r.body.error.code]).toEqual([409, "conflict"]);
    expect(await feedbackFor(a.userId)).toHaveLength(1);
  });

  it("with a PNG: the row is A's and the object sits under A's prefix", async () => {
    const a = await createTestAccount();
    const r = await send(
      a,
      form({ category: "bug", message: "See this" }, [
        { bytes: PNG(), type: "image/png" },
      ]),
    );
    expect(r.status).toBe(201);
    const [row] = await feedbackFor(a.userId);
    expect(row.attachments).toHaveLength(1);
    expect(row.attachments[0]).toMatchObject({
      userId: a.userId,
      contentType: "image/png",
      position: 0,
    });
    expect(row.attachments[0].objectPath.startsWith(`${a.userId}/`)).toBe(true);
  });

  it("bytes that aren't the declared type are refused before any upload", async () => {
    const a = await createTestAccount();
    for (const shot of [
      { bytes: JPEG(), type: "image/png" },
      { bytes: new TextEncoder().encode("hello"), type: "image/png" },
      { bytes: PNG(), type: "image/gif" },
    ]) {
      const r = await send(a, form({ category: "bug", message: "x" }, [shot]));
      expect([
        r.status,
        r.body.error.code,
        Object.keys(r.body.error.details),
      ]).toEqual([400, "validation_error", ["screenshots"]]);
    }
    expect(uploads).toHaveLength(0);
    expect(await feedbackFor(a.userId)).toHaveLength(0);
  });

  it("a screenshot over 3 MB is refused", async () => {
    const a = await createTestAccount();
    const big = new Uint8Array(3_000_001);
    big.set(PNG());
    const r = await send(
      a,
      form({ category: "bug", message: "x" }, [
        { bytes: big, type: "image/png" },
      ]),
    );
    expect([r.status, Object.keys(r.body.error.details)]).toEqual([
      400,
      ["screenshots"],
    ]);
    expect(uploads).toHaveLength(0);
  });

  it("bad fields are a 400 per field", async () => {
    const a = await createTestAccount();
    const r = await send(a, form({ category: "rant", message: "" }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.details).sort()).toEqual([
      "category",
      "message",
    ]);
  });

  it("at the daily limit: 409 daily_limit, nothing uploaded or written", async () => {
    const a = await createTestAccount();
    await db().feedback.createMany({
      data: Array.from({ length: FEEDBACK_DAILY_LIMIT }, (_, i) => ({
        userId: a.userId,
        category: "other" as const,
        message: `m${i}`,
      })),
    });
    const r = await send(
      a,
      form({ category: "bug", message: "one more" }, [
        { bytes: PNG(), type: "image/png" },
      ]),
    );
    expect([r.status, r.body.error.code, r.body.error.details]).toEqual([
      409,
      "conflict",
      { reason: "daily_limit" },
    ]);
    expect(uploads).toHaveLength(0);
    expect(await db().feedback.count({ where: { userId: a.userId } })).toBe(
      FEEDBACK_DAILY_LIMIT,
    );
  });

  it("a missing key and a non-multipart body are 400s", async () => {
    const a = await createTestAccount();
    const noKey = await send(a, form({ category: "bug", message: "x" }), null);
    expect([noKey.status, noKey.body.error.code]).toEqual([
      400,
      "validation_error",
    ]);
    const res = await (feedbackRoute as Handler)(
      new Request("http://localhost/api/mobile/v1/feedback", {
        method: "POST",
        headers: {
          "x-overload-app-version": "9.9.9",
          authorization: `Bearer t.${a.userId}.s`,
          "idempotency-key": randomUUID(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ category: "bug", message: "x" }),
      }),
      { params: Promise.resolve({}) as Promise<never> },
    );
    expect(res.status).toBe(400);
    expect(await feedbackFor(a.userId)).toHaveLength(0);
  });
});
