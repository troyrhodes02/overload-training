import { addDays, isoDateInZone } from "@/lib/plan/calendar";
import type { AdminOverviewDto, CohortRowDto } from "./types";

/**
 * The Overview's arithmetic (Admin Center & Feedback, spec section 9;
 * R12-R14): a pure function of account metadata and of two SETS of account
 * ids (accounts with a plan, accounts with a logged set). The admin metrics
 * layer (src/lib/data/admin/metrics.ts) gathers those inputs through the
 * gated admin client; this file only counts.
 */

export type MetricProfile = {
  /** The account's id. */
  id: string;
  createdAt: Date;
  timeZone: string;
  status: "active" | "suspended";
  /** "YYYY-MM-DD" or null. */
  lastActiveOn: string | null;
};

const pct = (n: number, of: number): number | null =>
  of === 0 ? null : Math.round((100 * n) / of);

/**
 * An account's signup day: its creation instant as a calendar date in its
 * own timezone (UTC if the stored zone is unusable). Shared by the metrics
 * and the directory.
 */
export function signupDay(createdAt: Date, timeZone: string): string {
  try {
    return isoDateInZone(createdAt, timeZone);
  } catch {
    return isoDateInZone(createdAt, "UTC");
  }
}

const signupDate = (p: MetricProfile) => signupDay(p.createdAt, p.timeZone);

/** "YYYY-MM" of the month `offset` months before `month` ("YYYY-MM"). */
function monthBefore(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) - offset;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

export const COHORT_MONTHS = 6;

/**
 * The Overview, as a pure function of metadata (spec §9). `today` is the
 * admin's calendar date. Windows count today and the 6 (or 29) days before;
 * "came back" means last active on a later calendar day than the signup day
 * (each in the account's own timezone); "this month" starts on the 1st of
 * today's month.
 */
export function computeOverview(input: {
  profiles: MetricProfile[];
  withPlan: ReadonlySet<string>;
  loggedWorkout: ReadonlySet<string>;
  today: string;
  timeZone: string;
}): AdminOverviewDto {
  const { profiles, today } = input;
  const from7 = addDays(today, -6);
  const from30 = addDays(today, -29);
  const monthStart = `${today.slice(0, 7)}-01`;

  const seen = (p: MetricProfile, from: string) =>
    p.lastActiveOn !== null && p.lastActiveOn >= from;

  const registered = profiles.length;
  const active7 = profiles.filter((p) => seen(p, from7)).length;
  const active30 = profiles.filter((p) => seen(p, from30)).length;
  const newThisMonth = profiles.filter(
    (p) => signupDate(p) >= monthStart,
  ).length;
  const withPlan = profiles.filter((p) => input.withPlan.has(p.id)).length;
  const loggedWorkout = profiles.filter((p) =>
    input.loggedWorkout.has(p.id),
  ).length;

  const thisMonth = today.slice(0, 7);
  const cohorts: CohortRowDto[] = [];
  for (let i = 0; i < COHORT_MONTHS; i++) {
    const month = monthBefore(thisMonth, i);
    const members = profiles.filter((p) => signupDate(p).slice(0, 7) === month);
    if (members.length === 0) {
      cohorts.push({
        month,
        signedUp: 0,
        cameBack: null,
        cameBackPct: null,
        active30: null,
        active30Pct: null,
      });
      continue;
    }
    const cameBack = members.filter(
      (p) => p.lastActiveOn !== null && p.lastActiveOn > signupDate(p),
    ).length;
    const recent = members.filter((p) => seen(p, from30)).length;
    cohorts.push({
      month,
      signedUp: members.length,
      cameBack,
      cameBackPct: pct(cameBack, members.length),
      active30: recent,
      active30Pct: pct(recent, members.length),
    });
  }

  return {
    timeZone: input.timeZone,
    registered,
    suspended: profiles.filter((p) => p.status === "suspended").length,
    active7,
    active30,
    newThisMonth,
    withPlan,
    loggedWorkout,
    pct: {
      active7: pct(active7, registered),
      active30: pct(active30, registered),
      withPlan: pct(withPlan, registered),
      loggedWorkout: pct(loggedWorkout, registered),
    },
    monthStart,
    cohorts,
  };
}
