import type { DashboardDto } from "../contracts/logging";

/**
 * Dashboard priority for Goals (spec R42, R43; design Screen 7). Goal content
 * may fill the dashboard only when no training action is pending: the day is
 * complete, it is a rest day, or there is no active plan. A missed-day prompt
 * or a pending / in-progress workout always keeps the screen to itself.
 */
export type DashboardKind = DashboardDto["kind"];

export function dashboardShowsGoals(kind: DashboardKind): boolean {
  return kind === "no_plan" || kind === "rest" || kind === "complete";
}
