import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";

/**
 * What the cardio form is for (Pitch 21f design C1, RD-16): recording one
 * planned cardio day, or correcting a record. Cardio is two facts, an activity
 * and whole minutes; nothing here computes, compares, or tracks anything.
 */
export type CardioTarget =
  | {
      mode: "log";
      /** The planned day's identity: its block and its authored date. */
      mesocycleId: string;
      scheduledFor: string;
      dateLabel: string;
      planned: { type: string; durationMin: number };
    }
  | {
      mode: "edit";
      cardioLogId: string;
      dateLabel: string;
      /** What was recorded: the form opens on it. */
      logged: { type: string; durationMin: number };
      /** Known in the active week; not for a record from an earlier block. */
      planned: { type: string; durationMin: number } | null;
    };

type Entry = Pick<
  CardioOccurrenceDto,
  "state" | "log" | "planned" | "mesocycleId" | "scheduledFor" | "dateLabel"
>;

/**
 * What a cardio line can do, from the server's entry: a record opens for
 * correction; a day that is due (today, or missed) opens to be logged; a day
 * that hasn't come is not actionable (the server would refuse it).
 */
export function cardioTarget(entry: Entry): CardioTarget | null {
  if (entry.log) {
    return {
      mode: "edit",
      cardioLogId: entry.log.id,
      dateLabel: entry.dateLabel,
      logged: { type: entry.log.type, durationMin: entry.log.durationMin },
      planned: entry.planned,
    };
  }
  if (entry.state === "pending" || entry.state === "missed") {
    return {
      mode: "log",
      mesocycleId: entry.mesocycleId,
      scheduledFor: entry.scheduledFor,
      dateLabel: entry.dateLabel,
      planned: entry.planned,
    };
  }
  return null;
}

/** "Incline Walk · 20 min". */
export function cardioLabel(c: { type: string; durationMin: number }): string {
  return `${c.type} · ${c.durationMin} min`;
}

/**
 * "Planned 20 min", or "Planned Incline Walk · 20 min" when the activity
 * changed too. Only when the record differs from the plan (the web's line).
 */
export function plannedComparison(
  entry: Pick<CardioOccurrenceDto, "log" | "planned" | "differsFromPlan">,
): string | null {
  if (!entry.log || !entry.differsFromPlan) return null;
  return entry.log.type === entry.planned.type
    ? `Planned ${entry.planned.durationMin} min`
    : `Planned ${cardioLabel(entry.planned)}`;
}

const enc = encodeURIComponent;

/** C1 Cardio: a modal over Today or History, carrying what it opened on. */
export function cardioHref(target: CardioTarget): string {
  const q: [string, string][] =
    target.mode === "log"
      ? [
          ["mesocycleId", target.mesocycleId],
          ["scheduledFor", target.scheduledFor],
        ]
      : [
          ["cardioLogId", target.cardioLogId],
          ["type", target.logged.type],
          ["durationMin", String(target.logged.durationMin)],
        ];
  q.push(["dateLabel", target.dateLabel]);
  if (target.planned) {
    q.push(["plannedType", target.planned.type]);
    q.push(["plannedMin", String(target.planned.durationMin)]);
  }
  return `/cardio?${q.map(([k, v]) => `${k}=${enc(v)}`).join("&")}`;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const minutes = (v: string | string[] | undefined): number | null => {
  const s = one(v);
  return s !== null && /^\d+$/.test(s) ? Number(s) : null;
};

/** The route's parameters back into a target; null when they don't make one. */
export function parseCardioParams(params: Params): CardioTarget | null {
  const dateLabel = one(params.dateLabel) ?? "";
  const plannedType = one(params.plannedType);
  const plannedMin = minutes(params.plannedMin);
  const planned =
    plannedType !== null && plannedMin !== null
      ? { type: plannedType, durationMin: plannedMin }
      : null;
  const cardioLogId = one(params.cardioLogId);
  if (cardioLogId !== null) {
    const type = one(params.type);
    const durationMin = minutes(params.durationMin);
    if (type === null || durationMin === null) return null;
    return {
      mode: "edit",
      cardioLogId,
      dateLabel,
      logged: { type, durationMin },
      planned,
    };
  }
  const mesocycleId = one(params.mesocycleId);
  const scheduledFor = one(params.scheduledFor);
  if (mesocycleId === null || scheduledFor === null || planned === null) {
    return null;
  }
  return { mode: "log", mesocycleId, scheduledFor, dateLabel, planned };
}

/** The form's context line: the day, and the plan when it is known. */
export function cardioContextLine(target: CardioTarget): string {
  return [
    target.dateLabel,
    target.planned ? `Planned ${cardioLabel(target.planned)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
