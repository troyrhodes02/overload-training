import { dashboardShowsGoals, type DashboardKind } from "@/lib/goals/dashboard";

describe("goals never displace the daily training loop (R42, R43)", () => {
  it.each<[DashboardKind, boolean]>([
    ["missed_day", false],
    ["pending", false],
    ["in_progress", false],
    ["complete", true],
    ["rest", true],
    ["no_plan", true],
  ])("dashboard state %s shows goals: %s", (kind, expected) => {
    expect(dashboardShowsGoals(kind)).toBe(expected);
  });
});
