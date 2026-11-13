import fs from "node:fs";
import path from "node:path";
import {
  API_ERROR_CODES,
  ERROR_CODES,
  type ActionResult,
} from "@overload/shared/contracts/errors";
import type { IsJsonSafe } from "@overload/shared/contracts/wire";
import type { Capability } from "@overload/shared/billing/plans";
import { SHARED_SRC } from "../support/code-roots";
import type * as account from "@overload/shared/contracts/account";
import type * as appConfig from "@overload/shared/contracts/app-config";
import type * as cardio from "@overload/shared/contracts/cardio";
import type * as errors from "@overload/shared/contracts/errors";
import type * as exercises from "@overload/shared/contracts/exercises";
import type * as goals from "@overload/shared/contracts/goals";
import type * as gyms from "@overload/shared/contracts/gyms";
import type * as history from "@overload/shared/contracts/history";
import type * as logging from "@overload/shared/contracts/logging";
import type * as plan from "@overload/shared/contracts/plan";
import type * as progression from "@overload/shared/contracts/progression";
import type * as releaseNotes from "@overload/shared/contracts/release-notes";
import type * as requests from "@overload/shared/contracts/requests";
import type * as views from "@overload/shared/contracts/views";

/**
 * Pitch 21b: the mobile API contracts (types only; 21c serves them). Every
 * contract must cross the wire unchanged: JSON values only, dates as ISO
 * strings, null kept distinct from zero, and gated results carrying `locked`.
 *
 * Most of these assertions are compile-time: ts-jest and `npm run typecheck`
 * type-check this file, so a contract that gains a Date, Set, Map, function,
 * or bigint stops the build. `jsonSafe<T>()` only accepts its argument when
 * `IsJsonSafe<T>` is true.
 */
function jsonSafe<T>(name: IsJsonSafe<T> extends true ? string : never) {
  return name;
}

/** Every contract a client receives or sends. */
const CONTRACTS = [
  jsonSafe<account.AccountInventoryDto>("account.AccountInventoryDto"),
  jsonSafe<account.SettingsProfile>("account.SettingsProfile"),
  jsonSafe<account.EmailVerificationDto>("account.EmailVerificationDto"),
  jsonSafe<account.TrialNoticePhase>("account.TrialNoticePhase"),
  jsonSafe<account.TrialNoticeData>("account.TrialNoticeData"),
  jsonSafe<account.ProfileDto>("account.ProfileDto"),
  jsonSafe<account.EntitlementDto>("account.EntitlementDto"),
  jsonSafe<account.TourStateDto>("account.TourStateDto"),
  jsonSafe<account.TrialNoticeDto>("account.TrialNoticeDto"),
  jsonSafe<account.MeDto>("account.MeDto"),
  jsonSafe<account.MePlanDto>("account.MePlanDto"),
  jsonSafe<appConfig.AppConfigDto>("appConfig.AppConfigDto"),
  jsonSafe<cardio.CardioOccurrenceDto>("cardio.CardioOccurrenceDto"),
  jsonSafe<errors.ActionError>("errors.ActionError"),
  jsonSafe<errors.ApiError>("errors.ApiError"),
  jsonSafe<errors.ApiErrorBody>("errors.ApiErrorBody"),
  jsonSafe<exercises.ExerciseListItemDto>("exercises.ExerciseListItemDto"),
  jsonSafe<exercises.ExerciseDetailDto>("exercises.ExerciseDetailDto"),
  jsonSafe<exercises.ExerciseList>("exercises.ExerciseList"),
  jsonSafe<goals.GoalContextDto>("goals.GoalContextDto"),
  jsonSafe<goals.GoalBestDto>("goals.GoalBestDto"),
  jsonSafe<goals.ActiveGoalDto>("goals.ActiveGoalDto"),
  jsonSafe<goals.GoalHistoryDto>("goals.GoalHistoryDto"),
  jsonSafe<goals.GoalReachedDto>("goals.GoalReachedDto"),
  jsonSafe<goals.GoalDetailDto>("goals.GoalDetailDto"),
  jsonSafe<goals.SessionGoalRowDto>("goals.SessionGoalRowDto"),
  jsonSafe<goals.GoalFormContextDto>("goals.GoalFormContextDto"),
  jsonSafe<goals.ExerciseGoalsDto>("goals.ExerciseGoalsDto"),
  jsonSafe<gyms.GymListItemDto>("gyms.GymListItemDto"),
  jsonSafe<history.BlockRef>("history.BlockRef"),
  jsonSafe<history.LoggedHistoryDay>("history.LoggedHistoryDay"),
  jsonSafe<history.EarlierBlock>("history.EarlierBlock"),
  jsonSafe<history.HistoryWeekView>("history.HistoryWeekView"),
  jsonSafe<history.HistoryWeekDto>("history.HistoryWeekDto"),
  jsonSafe<logging.DashboardExercisePreview>(
    "logging.DashboardExercisePreview",
  ),
  jsonSafe<logging.MissedDayInfo>("logging.MissedDayInfo"),
  jsonSafe<logging.DashboardTodayDto>("logging.DashboardTodayDto"),
  jsonSafe<logging.DashboardDto>("logging.DashboardDto"),
  jsonSafe<logging.ExerciseCardDto>("logging.ExerciseCardDto"),
  jsonSafe<logging.PreviousPerformanceDto>("logging.PreviousPerformanceDto"),
  jsonSafe<logging.WorkoutDto>("logging.WorkoutDto"),
  jsonSafe<logging.SwapCandidate>("logging.SwapCandidate"),
  jsonSafe<logging.SwapContextDto>("logging.SwapContextDto"),
  jsonSafe<logging.WeekDayDto>("logging.WeekDayDto"),
  jsonSafe<logging.WeekScheduleDto>("logging.WeekScheduleDto"),
  jsonSafe<logging.LoggedWorkoutDetailDto>("logging.LoggedWorkoutDetailDto"),
  jsonSafe<logging.MissedDayResolutionDto>("logging.MissedDayResolutionDto"),
  jsonSafe<plan.MesocycleSummaryDto>("plan.MesocycleSummaryDto"),
  jsonSafe<plan.SessionSummaryDto>("plan.SessionSummaryDto"),
  jsonSafe<plan.PlannedExerciseDto>("plan.PlannedExerciseDto"),
  jsonSafe<plan.PlannedCardioDto>("plan.PlannedCardioDto"),
  jsonSafe<plan.MesocycleWeekDto>("plan.MesocycleWeekDto"),
  jsonSafe<plan.MesocycleHomeDto>("plan.MesocycleHomeDto"),
  jsonSafe<plan.DayOccupancyDto>("plan.DayOccupancyDto"),
  jsonSafe<plan.SessionDetailDto>("plan.SessionDetailDto"),
  jsonSafe<progression.OccurrenceProgressionDto>(
    "progression.OccurrenceProgressionDto",
  ),
  jsonSafe<progression.SessionProgressionSummaryDto>(
    "progression.SessionProgressionSummaryDto",
  ),
  jsonSafe<progression.PlannedProgressionDto>(
    "progression.PlannedProgressionDto",
  ),
  jsonSafe<progression.ExerciseHistoryDto>("progression.ExerciseHistoryDto"),
  jsonSafe<progression.ExerciseRecordsDto>("progression.ExerciseRecordsDto"),
  jsonSafe<progression.HistoryNextDto>("progression.HistoryNextDto"),
  jsonSafe<progression.HistoryScopeDto>("progression.HistoryScopeDto"),
  jsonSafe<progression.RecordSetDto>("progression.RecordSetDto"),
  jsonSafe<progression.SessionRowDto>("progression.SessionRowDto"),
  jsonSafe<progression.TrendDto>("progression.TrendDto"),
  jsonSafe<progression.TrendPointDto>("progression.TrendPointDto"),
  jsonSafe<releaseNotes.WhatsNewDialogData>("releaseNotes.WhatsNewDialogData"),
  jsonSafe<releaseNotes.ReleaseNotesDto>("releaseNotes.ReleaseNotesDto"),
  jsonSafe<requests.LogSetInput>("requests.LogSetInput"),
  jsonSafe<requests.EditLoggedSetInput>("requests.EditLoggedSetInput"),
  jsonSafe<requests.LogSetRequest>("requests.LogSetRequest"),
  jsonSafe<requests.EditLoggedSetRequest>("requests.EditLoggedSetRequest"),
  jsonSafe<requests.StartWorkoutRequest>("requests.StartWorkoutRequest"),
  jsonSafe<requests.ChangeGymRequest>("requests.ChangeGymRequest"),
  jsonSafe<requests.SwapExerciseRequest>("requests.SwapExerciseRequest"),
  jsonSafe<requests.SetSkippedRequest>("requests.SetSkippedRequest"),
  jsonSafe<requests.EditPlannedSetsRequest>("requests.EditPlannedSetsRequest"),
  jsonSafe<requests.ResolveMissedDayRequest>(
    "requests.ResolveMissedDayRequest",
  ),
  jsonSafe<requests.LogCardioRequest>("requests.LogCardioRequest"),
  jsonSafe<requests.EditCardioLogRequest>("requests.EditCardioLogRequest"),
  jsonSafe<requests.CreateGoalRequest>("requests.CreateGoalRequest"),
  jsonSafe<requests.CreateGymRequest>("requests.CreateGymRequest"),
  jsonSafe<requests.CreateCustomExerciseRequest>(
    "requests.CreateCustomExerciseRequest",
  ),
  jsonSafe<requests.SetFavoriteRequest>("requests.SetFavoriteRequest"),
  jsonSafe<requests.UpdateProfileRequest>("requests.UpdateProfileRequest"),
  jsonSafe<requests.UpdateAppearanceRequest>(
    "requests.UpdateAppearanceRequest",
  ),
  jsonSafe<requests.TourOutcomeRequest>("requests.TourOutcomeRequest"),
  jsonSafe<requests.FeedbackRequest>("requests.FeedbackRequest"),
  jsonSafe<requests.DeleteAccountRequest>("requests.DeleteAccountRequest"),
  jsonSafe<views.TodayDto>("views.TodayDto"),
  jsonSafe<views.WorkoutViewDto>("views.WorkoutViewDto"),
  jsonSafe<views.LoggedWorkoutDetailViewDto>(
    "views.LoggedWorkoutDetailViewDto",
  ),
  jsonSafe<views.LoggedSetDto>("views.LoggedSetDto"),
  jsonSafe<errors.ActionResult<{ id: string }>>("errors.ActionResult"),
];

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

describe("mobile API contracts (Pitch 21b)", () => {
  it("every contract is JSON-safe", () => {
    expect(CONTRACTS).toHaveLength(94);
  });

  it("the JSON-safety check refuses what JSON cannot carry", () => {
    const date: IsJsonSafe<{ at: Date }> = false;
    const set: IsJsonSafe<{ caps: ReadonlySet<string> }> = false;
    const fn: IsJsonSafe<{ run: () => void }> = false;
    const nested: IsJsonSafe<{ a: { b: { c: Date | null } }[] }> = false;
    const variant: IsJsonSafe<
      { kind: "a"; x: string } | { kind: "b"; y: Date }
    > = false;
    const ok: IsJsonSafe<{ a?: string; b: number | null; c: boolean[] }> = true;
    expect([date, set, fn, nested, variant, ok]).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("gated Pro results keep `locked` (the capability that withheld them, or null)", () => {
    const gated = [
      true as Equal<
        progression.OccurrenceProgressionDto["locked"],
        Capability | null
      >,
      true as Equal<
        progression.SessionProgressionSummaryDto["locked"],
        Capability | null
      >,
      true as Equal<
        progression.PlannedProgressionDto["locked"],
        Capability | null
      >,
      true as Equal<
        progression.ExerciseHistoryDto["locked"],
        Capability | null
      >,
    ];
    expect(gated).toEqual([true, true, true, true]);
  });

  it("missing stays null, never zero: weights and RIR are nullable", () => {
    const weight: Equal<views.LoggedSetDto["weightLbs"], number | null> = true;
    const rir: Equal<views.LoggedSetDto["rir"], number | null> = true;
    const cardWeight: Equal<
      logging.ExerciseCardDto["sets"][number]["weightLbs"],
      number | null
    > = true;
    expect([weight, rir, cardWeight]).toEqual([true, true, true]);
  });

  it("the entitlement on the wire lists capabilities as an array", () => {
    const caps: Equal<account.EntitlementDto["capabilities"], Capability[]> =
      true;
    expect(caps).toBe(true);
  });

  it("the API error codes are every action code plus the two the API adds", () => {
    expect([...API_ERROR_CODES]).toEqual([
      ...ERROR_CODES,
      "account_suspended",
      "upgrade_required",
    ]);
    const shape: Equal<
      Extract<ActionResult<number>, { ok: false }>["error"]["code"],
      (typeof ERROR_CODES)[number]
    > = true;
    expect(shape).toBe(true);
  });

  it("app config never carries the invite mode or a code", () => {
    const mode: Equal<
      appConfig.AppConfigDto["signupMode"],
      "public" | "closed"
    > = true;
    expect(mode).toBe(true);
  });

  it("contract sources hold no Date type and import only shared modules", () => {
    const dir = path.join(SHARED_SRC, "contracts");
    for (const f of fs.readdirSync(dir)) {
      const code = fs
        .readFileSync(path.join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // wire.ts names Date only to refuse it.
      if (f !== "wire.ts")
        expect([f, /\bDate\b/.test(code)]).toEqual([f, false]);
      for (const m of code.matchAll(/from\s+"([^"]+)"/g)) {
        expect([f, m[1]]).toEqual([f, expect.stringMatching(/^\.\.?\//)]);
      }
    }
  });
});
