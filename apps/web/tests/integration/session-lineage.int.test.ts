import { DomainError } from "@/lib/actions/result";
import { cloneMesocycle, createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, duplicateSession } from "@/lib/plan/sessions";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import {
  createTestMesocycle,
  createTestSession,
} from "./support/plan-factories";
import { createTestAccount, defaultAccount } from "./support/accounts";

/**
 * Prescription-Aware Intelligence (spec §5, §8; RD-2..RD-4): a session's
 * lineage is its recurring-workout identity. Clone carries it forward; every
 * other session create mints a fresh one; it never changes; and it is unique
 * within a mesocycle.
 */
const prisma = () => getTestPrisma();

let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

async function block() {
  const m = await createTestMesocycle({
    name: "Block 2",
    status: "archived",
    splitType: "custom",
    startDate: new Date("2026-09-28T00:00:00Z"),
    lengthWeeks: 5,
    deloadEveryWeeks: 5,
  });
  const push = await createTestSession(m.id, { name: "Push", dayOfWeek: 6 });
  const upper = await createTestSession(m.id, { name: "Upper", dayOfWeek: 3 });
  return { m, push, upper };
}

const cloneInput = (sourceMesocycleId: string) => ({
  sourceMesocycleId,
  name: "Block 3",
  startDate: "2026-11-02",
  lengthWeeks: "5",
  deloadEveryWeeks: "5",
});

describe("session lineage", () => {
  it("a new session has a lineage of its own", async () => {
    const { push, upper } = await block();
    expect(push.lineageId).toMatch(/^[0-9a-f-]{36}$/);
    expect(upper.lineageId).not.toBe(push.lineageId);
  });

  it("clone carries every session's lineage into the new block", async () => {
    const { m, push, upper } = await block();
    const { id } = await cloneMesocycle(account, cloneInput(m.id));
    const cloned = await prisma().session.findMany({
      where: { mesocycleId: id },
      orderBy: { position: "asc" },
    });
    expect(cloned.map((s) => [s.name, s.lineageId])).toEqual([
      ["Push", push.lineageId],
      ["Upper", upper.lineageId],
    ]);
    // New rows, same identity.
    expect(cloned.map((s) => s.id)).not.toContain(push.id);
  });

  it("a clone of a clone keeps the original lineage", async () => {
    const { m, push } = await block();
    const b3 = await cloneMesocycle(account, cloneInput(m.id));
    await prisma().mesocycle.update({
      where: { id: b3.id },
      data: { status: "archived" },
    });
    const b4 = await cloneMesocycle(account, {
      ...cloneInput(b3.id),
      name: "Block 4",
    });
    const pushInB4 = await prisma().session.findFirstOrThrow({
      where: { mesocycleId: b4.id, name: "Push" },
    });
    expect(pushInB4.lineageId).toBe(push.lineageId);
  });

  it("duplicating a session starts a fresh lineage (decision 8)", async () => {
    const m = await createTestMesocycle({ status: "draft" });
    const s = await createTestSession(m.id, { name: "Push", dayOfWeek: 1 });
    const { id } = await duplicateSession(account, {
      sessionId: s.id,
      dayOfWeek: 4,
    });
    const copy = await prisma().session.findUniqueOrThrow({ where: { id } });
    expect(copy.lineageId).not.toBe(s.lineageId);
  });

  it("adding a session and creating a preset block mint distinct lineages", async () => {
    const { id } = await createMesocycle(account, {
      name: "Strength Block",
      startDate: "",
      lengthWeeks: "5",
      deloadEveryWeeks: "5",
      splitType: "ppl",
    });
    const added = await addSession(account, {
      mesocycleId: id,
      name: "Arms",
      dayOfWeek: 7,
    });
    const rows = await prisma().session.findMany({
      where: { mesocycleId: id },
    });
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((r) => r.id)).toContain(added.id);
    expect(new Set(rows.map((r) => r.lineageId)).size).toBe(rows.length);
  });

  it("a lineage never changes", async () => {
    const { push } = await block();
    await expect(
      prisma().session.update({
        where: { id: push.id },
        data: { lineageId: "00000000-0000-4000-8000-000000000999" },
      }),
    ).rejects.toThrow(/lineage never changes/);
    // Other edits are unaffected.
    await prisma().session.update({
      where: { id: push.id },
      data: { name: "Push A", dayOfWeek: 7 },
    });
    const after = await prisma().session.findUniqueOrThrow({
      where: { id: push.id },
    });
    expect(after.lineageId).toBe(push.lineageId);
  });

  it("two sessions of one block cannot share a lineage", async () => {
    const { m, push } = await block();
    await expect(
      createTestSession(m.id, {
        name: "Push copy",
        dayOfWeek: 1,
        lineageId: push.lineageId,
      }),
    ).rejects.toThrow();
  });

  it("another account cannot clone this account's block to inherit its lineage", async () => {
    const { m } = await block();
    const other = await createTestAccount();
    const err = await cloneMesocycle(other, cloneInput(m.id)).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("not_found");
    expect(
      await prisma().session.count({ where: { userId: other.userId } }),
    ).toBe(0);
  });

  it("an old-code insert (no lineage_id) gets a database lineage that a clone then carries (OVE-197, RD-21)", async () => {
    const { m, push } = await block();
    // The columns the pre-feature application writes: no lineage_id.
    const [row] = await prisma().$queryRawUnsafe<
      { id: string; lineage_id: string }[]
    >(
      `INSERT INTO "sessions" (id, user_id, mesocycle_id, name, day_of_week, position, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'Legs', 2, 5, now(), now())
       RETURNING id::text, lineage_id::text`,
      account.userId,
      m.id,
    );
    expect(row.lineage_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.lineage_id).not.toBe(push.lineageId);
    const { id } = await cloneMesocycle(account, cloneInput(m.id));
    const legs = await prisma().session.findFirstOrThrow({
      where: { mesocycleId: id, name: "Legs" },
    });
    expect(legs.lineageId).toBe(row.lineage_id);
  });
});
