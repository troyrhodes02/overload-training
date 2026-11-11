import { renderToStaticMarkup } from "react-dom/server";
import { PlanBadge } from "@/components/admin/account-status-badge";
import { membershipOf } from "@/lib/admin/membership";

/** Workout Logging Refinements RD-11: the directory's plan precedence. */
describe("membershipOf", () => {
  it.each([
    [[], "free"],
    [["trial"], "trial"],
    [["comp"], "comped"],
    [["subscription"], "pro"],
    [["trial", "comp"], "comped"],
    [["comp", "subscription"], "pro"],
    [["trial", "comp", "subscription"], "pro"],
  ] as const)("%j → %s", (sources, expected) => {
    expect(membershipOf(sources)).toBe(expected);
  });
});

describe("PlanBadge (design Screen 4)", () => {
  const text = (m: "pro" | "trial" | "comped" | "free") =>
    renderToStaticMarkup(<PlanBadge membership={m} />).replace(/<[^>]+>/g, " ");
  it("labels in words, never color alone", () => {
    expect(text("pro")).toMatch(/^\s*Pro\s*$/);
    expect(text("trial")).toMatch(/Pro\s+trial/);
    expect(text("comped")).toMatch(/Comped/);
    expect(text("free")).toMatch(/Free/);
  });
});
