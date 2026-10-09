import { DomainError } from "@/lib/actions/result";
import {
  activateMesocycle,
  archiveDraftMesocycle,
  cloneMesocycle,
} from "@/lib/plan/mesocycles";
import { getMesocycleWeek } from "@/lib/plan/queries";
import { addSession } from "@/lib/plan/sessions";
import { lockMesocycle, mapDbErrors } from "@/lib/plan/write-support";
import { getTestPrisma } from "./support/db";
import {
  createReadyDraft,
  createTestMesocycle,
} from "./support/plan-factories";

/** Split & Mesocycle Builder — regressions for the PR #17 review findings. */
const prisma = () => getTestPrisma();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("status checks happen under a row lock (review #2)", () => {
  it("an activation that waits on an archive of the same draft sees the archive and changes nothing", async () => {
    const active = await createReadyDraft({ name: "Active block" });
    await activateMesocycle({
      mesocycleId: active.mesocycle.id,
      expectedActiveId: null,
    });
    const draft = await createReadyDraft({ name: "Draft block" });

    const locked = deferred();
    const release = deferred();
    // Tab A: archive the draft, holding the lock until released.
    const archiving = prisma().$transaction(async (t) => {
      await lockMesocycle(draft.mesocycle.id, t);
      locked.resolve();
      await release.promise;
      return archiveDraftMesocycle({ mesocycleId: draft.mesocycle.id }, t);
    });
    await locked.promise;
    // Tab B: activate the same draft; it must wait for A's lock.
    const activating = activateMesocycle({
      mesocycleId: draft.mesocycle.id,
      expectedActiveId: active.mesocycle.id,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    await new Promise((r) => setTimeout(r, 300));
    release.resolve();
    await archiving;
    const err = await activating;

    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe("invalid_state_transition");
    const rows = await prisma().mesocycle.findMany({
      select: { name: true, status: true },
      orderBy: { name: "asc" },
    });
    // The previously active block was NOT archived as a side effect.
    expect(rows).toEqual([
      { name: "Active block", status: "active" },
      { name: "Draft block", status: "archived" },
    ]);
  });
});

describe("session order is explicit (review #6)", () => {
  it("a clone keeps the source's order of unscheduled sessions", async () => {
    // Created within one transaction, so every createdAt is identical; then
    // archived so it can be a clone source.
    const draft = await createTestMesocycle({ name: "Draft" });
    await prisma().$transaction(async (t) => {
      for (const name of ["Upper A", "Lower A", "Upper B", "Lower B", "Arms"]) {
        await addSession({ mesocycleId: draft.id, name, dayOfWeek: null }, t);
      }
    });
    await prisma().mesocycle.update({
      where: { id: draft.id },
      data: { status: "archived" },
    });
    const sourceOrder = (await getMesocycleWeek(draft.id))?.unscheduled.map(
      (s) => s.name,
    );
    expect(sourceOrder).toEqual([
      "Upper A",
      "Lower A",
      "Upper B",
      "Lower B",
      "Arms",
    ]);
    const { id } = await cloneMesocycle({
      sourceMesocycleId: draft.id,
      name: "Clone",
      startDate: "",
      lengthWeeks: "5",
      deloadWeek: "5",
    });
    expect(
      (await getMesocycleWeek(id))?.unscheduled.map((s) => s.name),
    ).toEqual(sourceOrder);
  });
});

describe("database errors are mapped only when the module owns the transaction (review #7)", () => {
  const unique = Object.assign(new Error("unique"), { code: "P2002" });

  it("maps without a caller transaction", async () => {
    const mapped = await mapDbErrors(
      undefined,
      () => Promise.reject(unique),
      () => new DomainError("conflict", "friendly"),
    ).catch((e: unknown) => e);
    expect(mapped).toBeInstanceOf(DomainError);
  });

  it("rethrows the raw error inside a caller's (now aborted) transaction", async () => {
    const raw = await mapDbErrors(
      {} as never,
      () => Promise.reject(unique),
      () => new DomainError("conflict", "friendly"),
    ).catch((e: unknown) => e);
    expect(raw).toBe(unique);
  });
});
