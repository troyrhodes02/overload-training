import type {
  ActiveGoalDto,
  GoalContextDto,
  GoalHistoryDto,
  GoalReachedDto,
} from "@overload/shared/contracts/goals";

/**
 * Goals' pure presentation (Pitch 21i design G1–G5). Every number is the
 * server's: the percent, the best session, and the target e1RM come from the
 * mobile API as the web computes them. Nothing here estimates or compares.
 */

/** "Bench Press" or "Leg Press · Downtown Gym" (a machine goal names its gym). */
export function goalTitle(g: GoalContextDto): string {
  return g.gymName ? `${g.exerciseName} · ${g.gymName}` : g.exerciseName;
}

/** The progress words: "85%", or the web's line when nothing is measured yet. */
export function progressText(g: Pick<ActiveGoalDto, "percent">): string {
  return g.percent === null ? "No performance recorded yet" : `${g.percent}%`;
}

/** One VoiceOver sentence per active goal. */
export function activeGoalLabel(g: ActiveGoalDto): string {
  const parts = [
    goalTitle(g),
    g.targetLabel.replace(" lb × ", " pounds times "),
    g.percent === null ? "no performance recorded yet" : `${g.percent} percent`,
  ];
  if (g.exerciseArchived) parts.push("exercise archived");
  if (g.gymArchived) parts.push("gym archived");
  return parts.join(", ");
}

/** "Reached Nov 3, 2026" or "Archived Nov 3, 2026". */
export function outcomeLine(g: GoalHistoryDto): string {
  return `${g.outcome === "completed" ? "Reached" : "Archived"} ${g.archivedLabel}`;
}

/**
 * Where "Set a new goal" leads (the web's `newGoalHrefFor`, RD-10): an
 * archived exercise can't take a goal, so the lift is picked again; otherwise
 * the same exercise, with its gym preselected only while that gym is active.
 */
export type NewGoalTarget =
  | { kind: "pick" }
  | { kind: "exercise"; exerciseId: string; gymId: string | null };

export function newGoalTarget(g: GoalContextDto): NewGoalTarget {
  if (g.exerciseArchived) return { kind: "pick" };
  return {
    kind: "exercise",
    exerciseId: g.exerciseId,
    gymId: g.gymId && !g.gymArchived ? g.gymId : null,
  };
}

/** Where the new-goal flow starts: G4 in the Goals stack, or G5 as a modal. */
export function newGoalHref(
  target: NewGoalTarget,
  from: "goals" | "history" = "goals",
): string {
  if (target.kind === "pick") return "/goals/new";
  const q = [`exerciseId=${encodeURIComponent(target.exerciseId)}`];
  if (target.gymId) q.push(`gymId=${encodeURIComponent(target.gymId)}`);
  q.push(`from=${from}`);
  return `/goal-new?${q.join("&")}`;
}

/** The Goal-reached card's words (the web's GoalReachedCard). */
export function reachedCopy(
  g: GoalReachedDto | (GoalContextDto & { alreadyReached: boolean }),
): {
  title: string;
  line: string;
  note: string | null;
} {
  return {
    title: "Goal reached",
    line: `${g.exerciseName} · ${g.targetLabel}${g.gymName ? ` at ${g.gymName}` : ""}`,
    note: g.alreadyReached ? "Your history already meets this target." : null,
  };
}

/** The archive confirmation (no undo, as on the web). */
export function archiveGoalConfirmation(g: GoalContextDto): {
  title: string;
  message: string;
} {
  return {
    title: "Archive this goal?",
    message: `${g.exerciseName} ${g.targetLabel} moves to your goal history. This can't be undone.`,
  };
}

/** The scope line under an active goal's numbers (the web's words). */
export function scopeFootnote(g: GoalContextDto): string {
  return g.gymName
    ? `Only sessions at ${g.gymName} count toward this goal. Epley estimate, same as the trend.`
    : "Best session across all gyms. Epley estimate, same as the trend.";
}

/** The note under an active goal whose exercise or gym is archived. */
export function archivedNote(g: GoalContextDto): string | null {
  if (g.exerciseArchived) {
    return "This exercise is archived, so new sessions won't add to this goal. Archive the goal when you're done with it.";
  }
  if (g.gymArchived && g.gymName) {
    return `${g.gymName} is archived. This goal stays measured there; archive it when you're done with it.`;
  }
  return null;
}

/**
 * The success haptic for a reached card plays once per goal per app session
 * (design G3): reopening the screen never celebrates the same goal again.
 */
const celebrated = new Set<string>();
export function firstSightOfReached(goalId: string): boolean {
  if (celebrated.has(goalId)) return false;
  celebrated.add(goalId);
  return true;
}
export function resetCelebrated(): void {
  celebrated.clear();
}
