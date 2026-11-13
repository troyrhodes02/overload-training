import { $Enums } from "@prisma/client";
import type { Plan } from "@overload/shared/billing/plans";
import {
  SHARED_ENUMS,
  type LoggedSessionStatusValue,
  type MesocycleStatusValue as RegistryMesocycleStatus,
  type MissedDayOutcomeValue,
} from "@overload/shared/enums";
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

/**
 * Pitch 21b: the shared enum registry. Every tuple a client can use equals its
 * Prisma enum, and every Prisma enum is classified: shared, or deliberately
 * web-only. A new Prisma enum fails here until someone decides which.
 */
const WEB_ONLY_ENUMS = [
  "SignupCampaign", // marketing attribution, admin only
  "EntitlementSource", // entitlement resolution stays on the server
  "CompReason", // admin comp grants
  "SubscriptionStatus", // the Stripe mirror; clients see DisplayState
  "BillingInterval", // the Stripe mirror
  "AdminAuditAction", // admin audit log
  "AuthThrottleAction", // signup and recovery throttle
  "ImportStatus", // plan import is web-only for the beta
  "ImportSourceKind", // plan import is web-only for the beta
] as const;

describe("the shared enum registry (Pitch 21b)", () => {
  it.each(Object.entries(SHARED_ENUMS))("%s", (name, tuple) => {
    const source = ($Enums as Record<string, Record<string, string>>)[name];
    expect(source).toBeDefined();
    expect(sorted(tuple)).toEqual(sorted(Object.values(source)));
  });

  it("classifies every Prisma enum as shared or web-only, never both", () => {
    const shared = Object.keys(SHARED_ENUMS);
    const webOnly: readonly string[] = WEB_ONLY_ENUMS;
    expect(shared.filter((n) => webOnly.includes(n))).toEqual([]);
    expect(Object.keys($Enums).sort()).toEqual([...shared, ...webOnly].sort());
  });

  it("the former type mirrors are the registry's unions", () => {
    const status: Equal<RegistryMesocycleStatus, $Enums.MesocycleStatus> = true;
    const plan: Equal<Plan, $Enums.Plan> = true;
    const outcome: Equal<MissedDayOutcomeValue, $Enums.MissedDayOutcome> = true;
    const logged: Equal<LoggedSessionStatusValue, $Enums.LoggedSessionStatus> =
      true;
    expect([status, plan, outcome, logged]).toEqual([true, true, true, true]);
  });
});
