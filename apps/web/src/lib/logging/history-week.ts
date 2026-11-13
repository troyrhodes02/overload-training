import "server-only";
import type { Account } from "@/lib/data/account";
import {
  addDays,
  formatPlanDate,
  formatPlanRange,
  isoWeekday,
  todayIso,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import type { CardioOccurrenceDto } from "@/lib/cardio/queries";
import { getWeekSchedule, type WeekDayDto } from "./queries";
import { resolveRequestedWeek, weekStartFor } from "./history-week-math";

/**
 * All-time history, one week at a time (OVE-141–145). Free on every plan.
 *
 * Account-scoped and framework-free (no cookies, redirects, or React), so the
 * web page and a future mobile API route call the same function.
 *
 * Weeks are seven-day blocks anchored on the ACTIVE block's start weekday, so
 * every week inside the active block is exactly the week the plan shows (and is
 * rendered by the unchanged getWeekSchedule: planned, missed, logged, cardio).
 * With no active block, weeks start on Monday. A week outside the active block
 * — an archived or draft block, or a gap between blocks — shows only what was
 * LOGGED there, workouts and cardio with their block's name. Planned or missed
 * days are never inferred outside the active block.
 *
 * Every read is ranged to one week (plus two `_min`/`_max` aggregates for the
 * navigation bounds and one per earlier block), so it never loads all history.
 * Back navigation stops at the week of the earliest logged workout or cardio
 * (or the active block's first week, if earlier); forward stops at this week,
 * or the active block's last week.
 */

type BlockRef = { mesocycleId: string; name: string; status: string };

export type LoggedHistoryDay = {
  dateIso: string;
  dayLabel: string;
  workouts: (BlockRef & {
    loggedSessionId: string;
    sessionName: string;
    state: "complete" | "in_progress";
  })[];
  cardio: (BlockRef & {
    cardioLogId: string;
    type: string;
    durationMin: number;
  })[];
};

export type EarlierBlock = BlockRef & {
  /** The week to open: the week of the block's first logged day. */
  weekStart: string;
  rangeLabel: string;
};

export type HistoryWeekView =
  | {
      kind: "active";
      blockName: string;
      weekNumber: number;
      lengthWeeks: number;
      days: WeekDayDto[];
      cardio: CardioOccurrenceDto[];
    }
  | {
      kind: "logged";
      /** The blocks whose logged work appears this week (none for a gap). */
      blocks: BlockRef[];
      days: LoggedHistoryDay[];
    };

export type HistoryWeekDto = {
  weekStart: string;
  weekEnd: string;
  rangeLabel: string;
  thisWeekStart: string;
  isThisWeek: boolean;
  prevWeekStart: string | null;
  nextWeekStart: string | null;
  view: HistoryWeekView;
  /** Blocks other than the active one that hold logged work, newest first. */
  earlierBlocks: EarlierBlock[];
  /** False when nothing has ever been logged and there is no active block. */
  hasAnyHistory: boolean;
};

const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);

export async function getHistoryWeek(
  account: Account,
  requested?: string | null,
): Promise<HistoryWeekDto> {
  const db = account.db;
  const today = todayIso(account.timeZone);

  const activeRow = await db.mesocycle.findFirst({
    where: { status: "active" },
    select: { id: true, name: true, startDate: true, lengthWeeks: true },
  });
  const active =
    activeRow && activeRow.startDate
      ? {
          id: activeRow.id,
          name: activeRow.name,
          startDate: toIsoDate(activeRow.startDate),
          lengthWeeks: activeRow.lengthWeeks,
        }
      : null;
  const anchorDow = active ? isoWeekday(active.startDate) : 1;
  const thisWeekStart = weekStartFor(today, anchorDow);

  // Navigation bounds: the earliest logged day (or the active block's start)
  // back to now (or the active block's last week) forward.
  const [firstWorkout, firstCardio] = await Promise.all([
    db.loggedSession.aggregate({ _min: { scheduledFor: true } }),
    db.cardioLog.aggregate({ _min: { scheduledFor: true } }),
  ]);
  const earliestCandidates = [
    firstWorkout._min.scheduledFor,
    firstCardio._min.scheduledFor,
  ]
    .filter((d): d is Date => d !== null)
    .map(toIsoDate);
  if (active) earliestCandidates.push(active.startDate);
  const hasAnyHistory = earliestCandidates.length > 0;
  const minWeekStart = hasAnyHistory
    ? weekStartFor(earliestCandidates.reduce(minIso), anchorDow)
    : thisWeekStart;
  const activeLastWeekStart = active
    ? addDays(active.startDate, (active.lengthWeeks - 1) * 7)
    : null;
  const maxWeekStart = activeLastWeekStart
    ? maxIso(thisWeekStart, activeLastWeekStart)
    : thisWeekStart;

  const wanted = resolveRequestedWeek(requested, {
    thisWeekStart,
    anchorDow,
    active,
  });
  const weekStart = minIso(maxIso(wanted, minWeekStart), maxWeekStart);
  const weekEnd = addDays(weekStart, 6);

  const inActive =
    active !== null &&
    activeLastWeekStart !== null &&
    weekStart >= active.startDate &&
    weekStart <= activeLastWeekStart;

  let view: HistoryWeekView;
  if (inActive && active) {
    const weekNumber =
      Math.round(
        (Date.parse(weekStart) - Date.parse(active.startDate)) / 86_400_000 / 7,
      ) + 1;
    const schedule = await getWeekSchedule(account, weekNumber);
    view = {
      kind: "active",
      blockName: active.name,
      weekNumber,
      lengthWeeks: active.lengthWeeks,
      days: schedule?.days ?? [],
      cardio: schedule?.cardio ?? [],
    };
  } else {
    view = await loggedWeek(account, weekStart, weekEnd);
  }

  return {
    weekStart,
    weekEnd,
    rangeLabel: formatPlanRange(weekStart, weekEnd),
    thisWeekStart,
    isThisWeek: weekStart === thisWeekStart,
    prevWeekStart: weekStart > minWeekStart ? addDays(weekStart, -7) : null,
    nextWeekStart: weekStart < maxWeekStart ? addDays(weekStart, 7) : null,
    view,
    earlierBlocks: await earlierBlocks(account, active?.id ?? null, anchorDow),
    hasAnyHistory,
  };
}

/** What was logged in one week, from every block (never inferred plans). */
async function loggedWeek(
  account: Account,
  weekStart: string,
  weekEnd: string,
): Promise<Extract<HistoryWeekView, { kind: "logged" }>> {
  const range = {
    gte: new Date(`${weekStart}T00:00:00.000Z`),
    lte: new Date(`${weekEnd}T00:00:00.000Z`),
  };
  const block = { select: { id: true, name: true, status: true } } as const;
  const [workouts, cardio] = await Promise.all([
    account.db.loggedSession.findMany({
      where: { scheduledFor: range },
      select: {
        id: true,
        scheduledFor: true,
        status: true,
        session: { select: { name: true } },
        mesocycle: block,
      },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    }),
    account.db.cardioLog.findMany({
      where: { scheduledFor: range },
      select: {
        id: true,
        scheduledFor: true,
        type: true,
        durationMin: true,
        mesocycle: block,
      },
      orderBy: { scheduledFor: "asc" },
    }),
  ]);

  const ref = (m: { id: string; name: string; status: string } | null) => ({
    mesocycleId: m?.id ?? "",
    name: m?.name ?? "",
    status: m?.status ?? "",
  });
  const days = new Map<string, LoggedHistoryDay>();
  const day = (iso: string) => {
    let d = days.get(iso);
    if (!d) {
      d = {
        dateIso: iso,
        dayLabel: formatPlanDate(iso),
        workouts: [],
        cardio: [],
      };
      days.set(iso, d);
    }
    return d;
  };
  const blocks = new Map<string, BlockRef>();
  for (const w of workouts) {
    const b = ref(w.mesocycle);
    if (b.mesocycleId) blocks.set(b.mesocycleId, b);
    day(toIsoDate(w.scheduledFor)).workouts.push({
      ...b,
      loggedSessionId: w.id,
      sessionName: w.session?.name ?? "Workout",
      state: w.status === "complete" ? "complete" : "in_progress",
    });
  }
  for (const c of cardio) {
    const b = ref(c.mesocycle);
    if (b.mesocycleId) blocks.set(b.mesocycleId, b);
    day(toIsoDate(c.scheduledFor)).cardio.push({
      ...b,
      cardioLogId: c.id,
      type: c.type,
      durationMin: c.durationMin,
    });
  }
  return {
    kind: "logged",
    blocks: [...blocks.values()],
    days: [...days.values()].sort((a, b) =>
      a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0,
    ),
  };
}

/** Non-active blocks with logged work, newest first, each with a week to open. */
async function earlierBlocks(
  account: Account,
  activeId: string | null,
  anchorDow: number,
): Promise<EarlierBlock[]> {
  const blocks = await account.db.mesocycle.findMany({
    where: activeId ? { id: { not: activeId } } : {},
    select: { id: true, name: true, status: true },
  });
  const withSpan = await Promise.all(
    blocks.map(async (b) => {
      const [w, c] = await Promise.all([
        account.db.loggedSession.aggregate({
          where: { mesocycleId: b.id },
          _min: { scheduledFor: true },
          _max: { scheduledFor: true },
        }),
        account.db.cardioLog.aggregate({
          where: { mesocycleId: b.id },
          _min: { scheduledFor: true },
          _max: { scheduledFor: true },
        }),
      ]);
      const firsts = [w._min.scheduledFor, c._min.scheduledFor]
        .filter((d): d is Date => d !== null)
        .map(toIsoDate);
      const lasts = [w._max.scheduledFor, c._max.scheduledFor]
        .filter((d): d is Date => d !== null)
        .map(toIsoDate);
      if (firsts.length === 0) return null;
      const first = firsts.reduce(minIso);
      const last = lasts.reduce(maxIso);
      return {
        mesocycleId: b.id,
        name: b.name,
        status: b.status,
        weekStart: weekStartFor(first, anchorDow),
        rangeLabel: formatPlanRange(first, last),
        last,
      };
    }),
  );
  return withSpan
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .map(({ last: _last, ...rest }) => rest);
}
