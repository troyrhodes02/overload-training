import "server-only";
import type { ImportSession } from "@prisma/client";
import { DomainError, isUniqueViolation } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { requireCapability } from "@/lib/entitlements/require";
import { createMesocycle } from "@/lib/plan/mesocycles";
import { addSession, addSessionExercise } from "@/lib/plan/sessions";
import { createCustomExercise } from "@/lib/exercises/exercises";
import { deriveBlockers } from "./draft/build";
import { removeSourceObjects } from "./storage";
import type { DraftExercise, ImportDraft } from "./draft/types";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the CONFIRM adapter. It is
 * the single authoritative write that turns a reviewed draft into a DRAFT
 * mesocycle, modelled EXACTLY on scripts/import/real-plan/import.ts::applyImport:
 * every write goes through the EXISTING plan writers composed in ONE
 * `account.db.$transaction`. There is no rival plan writer here.
 *
 * Hard guarantees (CLAUDE.md invariants, spec §14.3):
 *  - ZERO LoggedSet, LoggedExercise, LoggedSession, GymExerciseBaseline, or any
 *    history/baseline write. A plan is created; no training history is touched.
 *  - Capability is RE-CHECKED server-side; blockers are RE-DERIVED from the
 *    STORED draft (a client "resolved" flag can never waive them).
 *  - Idempotent: the created mesocycle is attached via the unique
 *    `ImportSession.mesocycleId`. A double-click / dropped-connection retry
 *    returns the SAME mesocycle, never a second plan.
 *  - A failed nested write (e.g. a custom-exercise insert) rolls the WHOLE plan
 *    back — no partial mesocycle, session, or orphan custom exercise.
 *  - Source load/rest/tempo/%/RPE/superset are NOT persisted (no plan column);
 *    they were review context only and are dropped here (spec RD-3).
 *  - Source cleanup is queued AFTER commit; a failed blob delete never undoes the
 *    plan.
 */

async function requireConfirmSession(
  account: Account,
  sessionId: string,
): Promise<ImportSession> {
  const session = await account.db.importSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw new DomainError("not_found", "That import could not be found.");
  }
  return session;
}

/** A day the confirm will write: a non-empty label + its resolved exercises. */
type ResolvableExercise =
  | {
      kind: "library";
      exerciseId: string;
      sets: number;
      repMin: number;
      repMax: number;
    }
  | {
      kind: "custom";
      name: string;
      primaryMuscle: string;
      equipmentType: string;
      sets: number;
      repMin: number;
      repMax: number;
    };

function resolveExercise(ex: DraftExercise): ResolvableExercise {
  const sets = ex.sets.value;
  const repMin = ex.repMin.value;
  const repMax = ex.repMax.value;
  // deriveBlockers already guaranteed these are valid, but re-assert defensively.
  if (sets == null || repMin == null || repMax == null) {
    throw new DomainError(
      "validation_error",
      "This import still has blockers.",
    );
  }
  if (ex.match.kind === "matched") {
    return {
      kind: "library",
      exerciseId: ex.match.exerciseId,
      sets,
      repMin,
      repMax,
    };
  }
  if (ex.match.kind === "custom_staged") {
    return {
      kind: "custom",
      name: ex.match.name,
      primaryMuscle: ex.match.primaryMuscle,
      equipmentType: ex.match.equipmentType,
      sets,
      repMin,
      repMax,
    };
  }
  // ambiguous / unknown are blockers; deriveBlockers would have stopped us.
  throw new DomainError("validation_error", "This import still has blockers.");
}

/**
 * Confirm an import into a draft mesocycle. Idempotent and atomic.
 */
export async function confirmImport(
  account: Account,
  input: { sessionId: string; version: number },
): Promise<{ mesocycleId: string }> {
  // Re-check the capability at confirm (a lapsed account can't import a new plan).
  await requireCapability(account, "plan_import");

  const session = await requireConfirmSession(account, input.sessionId);

  // Idempotency: if this session already created a plan, return it unchanged.
  if (session.mesocycleId) {
    return { mesocycleId: session.mesocycleId };
  }
  if (session.status === "confirmed") {
    // Confirmed but somehow no id — defensive; treat as not-found rather than
    // creating a second plan.
    throw new DomainError("conflict", "This import was already completed.");
  }
  if (session.status !== "review") {
    throw new DomainError(
      "invalid_state_transition",
      "This import isn't ready to create a plan.",
    );
  }
  if (session.draftVersion !== input.version) {
    throw new DomainError(
      "conflict",
      "This import changed in another tab. Reopen it to see the latest.",
    );
  }

  const draft = session.draft as unknown as ImportDraft | null;
  if (!draft) {
    throw new DomainError(
      "not_found",
      "There's no draft to create a plan from.",
    );
  }

  // RE-DERIVE blockers server-side from the stored draft. A client cannot waive
  // them; if any remain, refuse.
  const blockers = deriveBlockers(draft);
  if (blockers.length > 0) {
    throw new DomainError(
      "validation_error",
      "Some items still need attention before this plan can be created.",
    );
  }

  const title =
    (draft.title.value ?? "Imported plan").toString().trim() || "Imported plan";

  try {
    const mesocycleId = await account.db.$transaction(async (tx) => {
      // 1) The draft mesocycle via the EXISTING writer (createMesocycle sets
      //    status:"draft"). splitType "custom" → no preset sessions created.
      // A draft needs no start date; it stays a draft until the lifter activates
      // it in the existing builder. The source carries no mesocycle cadence, so a
      // neutral default (4 weeks, deload on the final week) is used — the lifter
      // tunes it before activating. These are the only non-draft-field defaults.
      const { id: mesoId } = await createMesocycle(
        account,
        {
          name: title,
          startDate: "",
          lengthWeeks: "4",
          deloadEveryWeeks: "4",
          splitType: "custom",
        },
        tx,
      );

      // 2) One Session per day, one SessionExercise per exercise, via the
      //    EXISTING writers. Custom staged exercises are created here (same tx),
      //    so a failure rolls them back with the plan.
      for (const day of draft.days) {
        const label = (day.label.value ?? "").toString().trim() || "Day";
        const { id: sessionId } = await addSession(
          account,
          { mesocycleId: mesoId, name: label, dayOfWeek: null },
          tx,
        );
        for (const ex of day.exercises) {
          const resolved = resolveExercise(ex);
          let exerciseId: string;
          if (resolved.kind === "library") {
            exerciseId = resolved.exerciseId;
          } else {
            const created = await createCustomExercise(
              account,
              {
                name: resolved.name,
                primaryMuscle: resolved.primaryMuscle,
                equipmentType: resolved.equipmentType,
                secondaryMuscles: [],
              },
              tx,
            );
            exerciseId = created.id;
          }
          await addSessionExercise(
            account,
            {
              sessionId,
              exerciseId,
              plannedSets: String(resolved.sets),
              targetRepMin: String(resolved.repMin),
              targetRepMax: String(resolved.repMax),
            },
            tx,
          );
        }
      }

      // 3) Attach provenance via the UNIQUE mesocycleId and flip to confirmed,
      //    in the SAME transaction. The unique constraint is the idempotency key.
      const attached = await tx.importSession.updateMany({
        where: { id: session.id, status: "review", mesocycleId: null },
        data: { status: "confirmed", mesocycleId: mesoId },
      });
      if (attached.count !== 1) {
        // A concurrent confirm won; abort this plan so there's exactly one.
        throw new DomainError("conflict", "This import was just completed.");
      }
      return mesoId;
    });

    // 4) Queue source cleanup AFTER commit. A failed blob delete never undoes the
    //    plan: it only leaves a RETRIABLE TOMBSTONE (sourcesPurgedAt stays null)
    //    for the lazy sweep / operator script to retry. The lazy sweep and account
    //    deletion are the other backstops.
    await cleanupSources(account, session.id);

    return { mesocycleId };
  } catch (error) {
    // A racing confirm that tripped the unique mesocycleId index: return the one
    // plan rather than surfacing a raw error (idempotency on a dropped retry).
    if (isUniqueViolation(error)) {
      const latest = await account.db.importSession.findUnique({
        where: { id: session.id },
        select: { mesocycleId: true },
      });
      if (latest?.mesocycleId) return { mesocycleId: latest.mesocycleId };
    }
    throw error;
  }
}

/**
 * Best-effort source-object cleanup after a confirmed plan. On success the
 * session's `sourcesPurgedAt` tombstone is cleared (marked done); on ANY failure
 * it is left null so the lazy sweep (retention.ts) and the operator cleanup script
 * retry it. A failed blob delete never undoes the plan — it is a hygiene concern.
 */
async function cleanupSources(
  account: Account,
  sessionId: string,
): Promise<void> {
  try {
    const parts = await account.db.importSourcePart.findMany({
      where: { sessionId },
      select: { objectPath: true },
    });
    const paths = parts
      .map((p) => p.objectPath)
      .filter((p): p is string => p !== null);
    if (paths.length > 0) await removeSourceObjects(paths);
    // Mark the tombstone done: the stored objects are gone (or there were none).
    await account.db.importSession.updateMany({
      where: { id: sessionId, sourcesPurgedAt: null },
      data: { sourcesPurgedAt: new Date() },
    });
  } catch {
    // Cleanup is a hygiene concern, never a correctness one. The plan stands and
    // the tombstone (sourcesPurgedAt still null) is retried later.
  }
}
