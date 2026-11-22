import type {
  MesocycleSummaryDto,
  PlanBlockDto,
  PlanDayDto,
  PlanOverviewDto,
  SessionSummaryDto,
} from "@overload/shared/contracts/plan";
import {
  dayName,
  formatPlanDate,
  formatPlanRange,
} from "@overload/shared/plan/calendar";
import { CARDIO_LABEL, STATE_LABEL, STATE_TONE } from "../history/day-state";
import type { ChipTone } from "../ui/Surface";

/**
 * P1 Plan's words (Pitch 21h design §6 P1). Pure: everything here formats
 * what the server decided — the week, deload weeks, states, and today — and
 * computes no date of its own.
 */

/** "Week 3 of 6", "Week 5 of 6 · Deload week", "Starts Mon, Dec 1", "Ended Sun, Nov 30". */
export function positionLine(block: PlanBlockDto): string {
  const p = block.position;
  if (p.kind === "upcoming") return `Starts ${formatPlanDate(p.startsOn)}`;
  if (p.kind === "ended") return `Ended ${formatPlanDate(p.endedOn)}`;
  const base = `Week ${p.week} of ${block.summary.lengthWeeks}`;
  return p.scheduledDeloadWeek ? `${base} · Deload week` : base;
}

/** "Deload every 5 weeks · week 5", "… · weeks 5, 10", or no deload in the block. */
export function cadenceLine(block: PlanBlockDto): string {
  const n = block.summary.deloadEveryWeeks;
  if (block.deloadWeeks.length === 0) return "No deload week in this block";
  const every = `Deload every ${n} ${n === 1 ? "week" : "weeks"}`;
  const weeks = block.deloadWeeks;
  return `${every} · ${weeks.length === 1 ? "week" : "weeks"} ${weeks.join(", ")}`;
}

/** "Upper / Lower · 4 sessions". */
export function splitLine(summary: MesocycleSummaryDto): string {
  const n = summary.sessionCount;
  return `${summary.splitLabel} · ${n} ${n === 1 ? "session" : "sessions"}`;
}

export function dateRangeLine(summary: MesocycleSummaryDto): string | null {
  return summary.startDate && summary.endDate
    ? formatPlanRange(summary.startDate, summary.endDate)
    : null;
}

/** The web's "N items need attention" on the plan card, pointed at the web. */
export function attentionLine(summary: MesocycleSummaryDto): string | null {
  const n = summary.issueCount;
  if (n === 0) return null;
  return `${n} ${n === 1 ? "item needs" : "items need"} attention on the web`;
}

/** "1 draft and 2 earlier blocks are on the web." (null when there are none). */
export function otherBlocksLine(
  other: PlanOverviewDto["otherBlocks"],
): string | null {
  const parts: string[] = [];
  if (other.drafts > 0)
    parts.push(`${other.drafts} ${other.drafts === 1 ? "draft" : "drafts"}`);
  if (other.previous > 0)
    parts.push(
      `${other.previous} earlier ${other.previous === 1 ? "block" : "blocks"}`,
    );
  if (parts.length === 0) return null;
  const verb = other.drafts + other.previous === 1 ? "is" : "are";
  return `${parts.join(" and ")} ${verb} on the web.`;
}

/** The no-plan message: names drafts when there are some. */
export function noPlanMessage(other: PlanOverviewDto["otherBlocks"]): string {
  if (other.drafts > 0) {
    return `You have ${other.drafts} ${other.drafts === 1 ? "draft" : "drafts"} on the web. Activate one to train it.`;
  }
  return "Build a block on the web and activate it. Today and History follow it here.";
}

export type DayRowLine = {
  key: string;
  kind: "session" | "cardio";
  title: string;
  chip: { label: string; tone: ChipTone } | null;
  /** Set for a session line: what P2 opens. */
  sessionId: string | null;
};

export type DayRow = {
  dateIso: string;
  isToday: boolean;
  rest: boolean;
  lines: DayRowLine[];
  accessibilityLabel: string;
};

/** One day of the week list: its sessions and cardio, or a rest day. */
export function dayRow(day: PlanDayDto): DayRow {
  const lines: DayRowLine[] = [
    ...day.sessions.map((s, i) => ({
      key: `s-${s.sessionId}-${i}`,
      kind: "session" as const,
      title: s.sessionName,
      chip: { label: STATE_LABEL[s.state], tone: STATE_TONE[s.state] },
      sessionId: s.sessionId,
    })),
    ...day.cardio.map((c, i) => ({
      key: `c-${c.scheduledFor}-${i}`,
      kind: "cardio" as const,
      title: `Cardio · ${c.planned.type} · ${c.planned.durationMin} min`,
      chip: {
        label: CARDIO_LABEL[c.state],
        tone: (c.state === "complete" ? "progress" : "muted") as ChipTone,
      },
      sessionId: null,
    })),
  ];
  const rest = day.sessions.length === 0;
  const spoken = [
    day.dayLabel,
    day.isToday ? "today" : null,
    rest && day.cardio.length === 0 ? "rest" : null,
    ...lines.map((l) => (l.chip ? `${l.title}, ${l.chip.label}` : l.title)),
  ].filter(Boolean);
  return {
    dateIso: day.dateIso,
    isToday: day.isToday,
    rest,
    lines,
    accessibilityLabel: spoken.join(", "),
  };
}

/** The template's sessions in weekday order, then the unscheduled ones. */
export function sessionRows(block: PlanBlockDto): {
  scheduled: { day: string; session: SessionSummaryDto }[];
  unscheduled: SessionSummaryDto[];
} {
  return {
    scheduled: block.template.flatMap((s, i) =>
      s ? [{ day: dayName(i + 1), session: s }] : [],
    ),
    unscheduled: block.unscheduled,
  };
}

export function exerciseCountLabel(n: number): string {
  return n === 0
    ? "No exercises"
    : `${n} ${n === 1 ? "exercise" : "exercises"}`;
}

/** What the week stepper may do (the server clamps anyway). */
export function stepper(block: PlanBlockDto): {
  prev: number | null;
  next: number | null;
} {
  const w = block.week.weekNumber;
  return {
    prev: w > 1 ? w - 1 : null,
    next: w < block.week.lengthWeeks ? w + 1 : null,
  };
}

/** The href that opens a planned session (P2). */
export function sessionHref(mesocycleId: string, sessionId: string): string {
  return `/plan/session/${encodeURIComponent(sessionId)}?mesocycleId=${encodeURIComponent(mesocycleId)}`;
}
