import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { AccountScopeError } from "@/lib/data/scope";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { RELEASE_NOTES_FIXTURE as FIXTURE } from "../support/release-notes";
import {
  getWhatsNewDialog,
  markReleaseNotesSeen,
} from "@/lib/release-notes/seen";

/**
 * Cross-account isolation — ReleaseSeen (What's New, spec §9, §14.2; R15,
 * R21). Release notes are shared content, but whether an account has seen
 * them is private: A's dialog and mark never move B's seen point, and B's
 * scoped client can't read, count, change, delete, or create A's row.
 */

const catalog = FIXTURE;
let a: Account;
let b: Account;

const rowOf = (userId: string) =>
  getTestPrisma().$queryRawUnsafe(
    `SELECT to_jsonb(t) AS row FROM "release_seen" t WHERE t.user_id = $1::uuid`,
    userId,
  );

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  await markReleaseNotesSeen(a, catalog[0].id, { catalog });
});

it("A having seen everything leaves B's dialog untouched", async () => {
  expect(await getWhatsNewDialog(a, catalog)).toBeNull();
  expect(
    (await getWhatsNewDialog(b, catalog))?.entries.map((e) => e.id),
  ).toEqual([catalog[0].id, catalog[2].id]);
});

it("B's mark touches only B's row", async () => {
  const aBefore = await rowOf(a.userId);
  await markReleaseNotesSeen(b, catalog[2].id, { catalog });
  expect(await rowOf(a.userId)).toEqual(aBefore);
  const all = await getTestPrisma().releaseSeen.findMany();
  expect(all.map((r) => [r.userId, r.lastSeenReleaseId]).sort()).toEqual(
    [
      [a.userId, catalog[0].id],
      [b.userId, catalog[2].id],
    ].sort(),
  );
});

it("B's scoped client can't read, count, change, or delete A's row", async () => {
  const aBefore = await rowOf(a.userId);
  expect(
    await b.db.releaseSeen.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
  expect(await b.db.releaseSeen.findMany()).toEqual([]);
  expect(await b.db.releaseSeen.count()).toBe(0);
  expect(await b.db.releaseSeen.count({ where: { userId: a.userId } })).toBe(0);
  const updated = await b.db.releaseSeen.updateMany({
    where: { userId: a.userId },
    data: { lastSeenReleaseId: catalog[2].id, lastSeenAt: new Date() },
  });
  expect(updated.count).toBe(0);
  const deleted = await b.db.releaseSeen.deleteMany({
    where: { userId: a.userId },
  });
  expect(deleted.count).toBe(0);
  expect(await rowOf(a.userId)).toEqual(aBefore);
});

it("B can't create a row for A, and an upsert naming A never reaches A's row", async () => {
  await expect(
    b.db.releaseSeen.create({
      data: {
        userId: a.userId,
        lastSeenReleaseId: catalog[2].id,
        lastSeenAt: new Date(),
      },
    }),
  ).rejects.toBeInstanceOf(AccountScopeError);
  const aBefore = await rowOf(a.userId);
  await b.db.releaseSeen
    .upsert({
      where: { userId: a.userId },
      create: {
        userId: b.userId,
        lastSeenReleaseId: catalog[2].id,
        lastSeenAt: new Date(),
      },
      update: { lastSeenReleaseId: catalog[2].id, lastSeenAt: new Date() },
    })
    .catch(() => undefined);
  expect(await rowOf(a.userId)).toEqual(aBefore);
});

it("an account id never reaches the mark: the only input is an entry id", async () => {
  // The action's input is an entry id; a uuid (an account id) is not one.
  await expect(
    markReleaseNotesSeen(b, a.userId, { catalog }),
  ).rejects.toMatchObject({ code: "validation_error" });
  await expect(
    markReleaseNotesSeen(b, randomUUID(), { catalog }),
  ).rejects.toMatchObject({ code: "validation_error" });
  expect(await b.db.releaseSeen.count()).toBe(0);
});
