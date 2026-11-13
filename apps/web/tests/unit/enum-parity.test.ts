import { $Enums } from "@prisma/client";
import { APPEARANCES } from "@overload/shared/appearance/appearance";
import { FEEDBACK_CATEGORIES } from "@overload/shared/feedback/validation";
import { SPLIT_TYPES } from "@overload/shared/plan/presets";
import { RESOLVABLE_OUTCOMES } from "@/lib/logging/missed-days";
import type { MesocycleStatusValue } from "@/lib/plan/queries";
import type { LockedMesocycle } from "@/lib/data/locks";
import type {
  EffectiveOccurrence,
  ScheduleLoggedSession,
  ScheduleResolution,
} from "@overload/shared/logging/schedule";
import type { DashboardDto } from "@/lib/logging/queries";
import type { DashboardKind } from "@overload/shared/goals/dashboard";

/**
 * OVE-140 (mobile audit D-6): every hand-copied mirror of a Prisma enum (and
 * the dashboard kind) must match its source, so drift fails CI instead of
 * surfacing as a bad value at runtime — before the mobile app depends on them.
 *
 * Runtime mirrors (const tuples) are compared value-for-value. Type-only
 * mirrors are compared at the type level: ts-jest type-checks this file and
 * `npm run typecheck` includes tests, so a mismatch fails the build too.
 */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

const sorted = (values: readonly string[]) => [...values].sort();

describe("runtime enum mirrors match Prisma.$Enums", () => {
  it.each([
    ["appearance", APPEARANCES, $Enums.Appearance],
    ["feedback category", FEEDBACK_CATEGORIES, $Enums.FeedbackCategory],
    ["split type", SPLIT_TYPES, $Enums.SplitType],
  ] as const)("%s", (_name, mirror, source) => {
    expect(sorted(mirror)).toEqual(sorted(Object.values(source)));
  });

  it("the missed-day outcomes this write path records are real outcomes", () => {
    for (const outcome of RESOLVABLE_OUTCOMES) {
      expect(Object.values($Enums.MissedDayOutcome)).toContain(outcome);
    }
  });
});

describe("type-only enum mirrors match Prisma.$Enums", () => {
  it("mesocycle status", () => {
    const queries: Equal<MesocycleStatusValue, $Enums.MesocycleStatus> = true;
    const locks: Equal<LockedMesocycle["status"], $Enums.MesocycleStatus> =
      true;
    expect([queries, locks]).toEqual([true, true]);
  });

  it("missed-day outcome", () => {
    const schedule: Equal<
      ScheduleResolution["outcome"],
      $Enums.MissedDayOutcome
    > = true;
    const occurrence: Equal<
      NonNullable<EffectiveOccurrence["resolution"]>,
      $Enums.MissedDayOutcome
    > = true;
    expect([schedule, occurrence]).toEqual([true, true]);
  });

  it("logged session status", () => {
    const schedule: Equal<
      ScheduleLoggedSession["status"],
      $Enums.LoggedSessionStatus
    > = true;
    const occurrence: Equal<
      NonNullable<EffectiveOccurrence["loggedStatus"]>,
      $Enums.LoggedSessionStatus
    > = true;
    expect([schedule, occurrence]).toEqual([true, true]);
  });

  it("dashboard kind (goals/dashboard.ts mirrors DashboardDto)", () => {
    const kind: Equal<DashboardKind, DashboardDto["kind"]> = true;
    expect(kind).toBe(true);
  });
});
