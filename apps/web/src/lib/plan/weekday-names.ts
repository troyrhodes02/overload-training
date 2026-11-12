/**
 * Weekdays for unscheduled sessions, read from the session's own name
 * ("Monday — Workout A"). Pure and client-safe. It only SUGGESTS: nothing is
 * written until the lifter accepts, and it never picks a start date. A name
 * counts only when it LEADS with exactly one weekday; if two sessions point at
 * the same weekday, neither is readed (the lifter decides).
 */
const WEEKDAYS: { day: number; names: string[] }[] = [
  { day: 1, names: ["monday", "mon"] },
  { day: 2, names: ["tuesday", "tue", "tues"] },
  { day: 3, names: ["wednesday", "wed"] },
  { day: 4, names: ["thursday", "thu", "thur", "thurs"] },
  { day: 5, names: ["friday", "fri"] },
  { day: 6, names: ["saturday", "sat"] },
  { day: 7, names: ["sunday", "sun"] },
];

/** 1 = Monday … 7 = Sunday, from a name that starts with a weekday; else null. */
export function weekdayFromName(name: string): number | null {
  const lead = /^\s*([A-Za-z]+)\b/.exec(name)?.[1]?.toLowerCase();
  if (!lead) return null;
  return WEEKDAYS.find((w) => w.names.includes(lead))?.day ?? null;
}

export type NamedSession = {
  id: string;
  name: string;
  dayOfWeek: number | null;
};

export type NamedWeekday = { sessionId: string; dayOfWeek: number };

/**
 * Named days for a plan's sessions: only when NOTHING is scheduled yet, only for
 * sessions named for a weekday, and only for weekdays no other session also
 * claims. An empty list means "offer nothing".
 */
export function weekdaysFromNames(sessions: NamedSession[]): NamedWeekday[] {
  if (sessions.some((s) => s.dayOfWeek !== null)) return [];
  const byDay = new Map<number, string[]>();
  for (const s of sessions) {
    const day = weekdayFromName(s.name);
    if (day === null) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), s.id]);
  }
  return [...byDay.entries()]
    .filter(([, ids]) => ids.length === 1)
    .map(([dayOfWeek, ids]) => ({ sessionId: ids[0], dayOfWeek }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}
