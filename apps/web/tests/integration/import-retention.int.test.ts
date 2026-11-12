import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import {
  sweepExpiredImports,
  retryTombstones,
  runImportRetention,
} from "@/lib/import/retention";

/**
 * Workout Plan Import & Review (OVE-109, spec §14.10, blueprint §4.4/§8) —
 * retention & cleanup on the throwaway Postgres.
 *
 * Proves the IMPLEMENTABLE retention backstops (the reliable <=24h *scheduled*
 * purge of a never-reopened session is BLOCKED on scheduling infra the repo
 * lacks — see retention.ts):
 *  - the lazy sweep expires only the acting account's OWN overdue unconfirmed
 *    sessions, never another account's and never a confirmed one;
 *  - a terminal session whose blob delete has not completed is a RETRIABLE,
 *    OBSERVABLE tombstone (sourcesPurgedAt null), cleared on a successful retry.
 *
 * Supabase Storage is not configured in the test DB, so removeSourceObjects is a
 * best-effort no-op (it never throws), which models the "removal succeeded"
 * branch — exactly what clears a tombstone. The failed-removal branch (tombstone
 * stays) is proven in the unit test with an injected failing remover.
 */

const HOUR = 60 * 60 * 1000;

async function seedSession(
  account: Account,
  opts: {
    status?:
      | "created"
      | "uploaded"
      | "extracting"
      | "review"
      | "confirmed"
      | "discarded";
    expiresAt: Date;
    sourcesPurgedAt?: Date | null;
    withObject?: boolean;
    draft?: object | null;
  },
): Promise<string> {
  const prisma = getTestPrisma();
  const session = await prisma.importSession.create({
    data: {
      userId: account.userId,
      status: opts.status ?? "uploaded",
      sourceKind: "image",
      expiresAt: opts.expiresAt,
      sourcesPurgedAt: opts.sourcesPurgedAt ?? null,
      draft: opts.draft ?? undefined,
    },
    select: { id: true },
  });
  if (opts.withObject) {
    await prisma.importSourcePart.create({
      data: {
        userId: account.userId,
        sessionId: session.id,
        position: 0,
        objectPath: `${account.userId}/${session.id}/0.png`,
        contentType: "image/png",
        sizeBytes: 10,
      },
    });
  }
  return session.id;
}

describe("lazy expiry sweep (P22-04)", () => {
  it("purges the acting account's OWN overdue unconfirmed session, clearing its draft and parts", async () => {
    const a = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await seedSession(a, {
      status: "review",
      expiresAt: new Date(Date.now() - HOUR),
      withObject: true,
      draft: { version: 0, title: {}, days: [], issues: [] },
    });

    const { purged } = await sweepExpiredImports(a);
    expect(purged).toBe(1);

    const after = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(after.status).toBe("purged");
    expect(after.draft).toBeNull();
    expect(after.sourcesPurgedAt).not.toBeNull(); // removal "succeeded" (no-op)
    expect(await prisma.importSourcePart.count({ where: { sessionId } })).toBe(
      0,
    );
  });

  it("never touches a session that is not yet overdue", async () => {
    const a = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await seedSession(a, {
      status: "uploaded",
      expiresAt: new Date(Date.now() + HOUR), // future
    });
    const { purged } = await sweepExpiredImports(a);
    expect(purged).toBe(0);
    expect(
      (
        await prisma.importSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).status,
    ).toBe("uploaded");
  });

  it("never purges a CONFIRMED session (it owns a real plan)", async () => {
    const a = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await seedSession(a, {
      status: "confirmed",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: new Date(),
    });
    const { purged } = await sweepExpiredImports(a);
    expect(purged).toBe(0);
    expect(
      (
        await prisma.importSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).status,
    ).toBe("confirmed");
  });

  it("one account's sweep never expires another account's overdue session", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const prisma = getTestPrisma();
    const bSession = await seedSession(b, {
      status: "review",
      expiresAt: new Date(Date.now() - HOUR),
    });
    // A sweeps — B's overdue session is untouched (isolation).
    await runImportRetention(a);
    expect(
      (
        await prisma.importSession.findUniqueOrThrow({
          where: { id: bSession },
        })
      ).status,
    ).toBe("review");
  });
});

describe("retriable blob-delete tombstone (P22-04)", () => {
  it("clears a terminal session's tombstone when the object removal succeeds", async () => {
    const a = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await seedSession(a, {
      status: "confirmed",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: null, // tombstone: blobs still need removing
      withObject: true,
    });

    const { cleared } = await retryTombstones(a);
    expect(cleared).toBe(1);
    expect(
      (
        await prisma.importSession.findUniqueOrThrow({
          where: { id: sessionId },
        })
      ).sourcesPurgedAt,
    ).not.toBeNull();
    // The plan reference (if any) is never touched by the retry.
  });

  it("does not retry a session that is already purged-done (sourcesPurgedAt set)", async () => {
    const a = await createTestAccount();
    const done = new Date(Date.now() - HOUR);
    const sessionId = await seedSession(a, {
      status: "confirmed",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: done,
      withObject: true,
    });
    const { cleared } = await retryTombstones(a);
    expect(cleared).toBe(0);
    const row = await getTestPrisma().importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    // Unchanged.
    expect(row.sourcesPurgedAt?.getTime()).toBe(done.getTime());
  });

  it("only retries the acting account's own tombstones", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const prisma = getTestPrisma();
    const bTomb = await seedSession(b, {
      status: "discarded",
      expiresAt: new Date(Date.now() - HOUR),
      sourcesPurgedAt: null,
      withObject: true,
    });
    await retryTombstones(a); // A retries — B's tombstone is untouched
    expect(
      (await prisma.importSession.findUniqueOrThrow({ where: { id: bTomb } }))
        .sourcesPurgedAt,
    ).toBeNull();
  });
});
