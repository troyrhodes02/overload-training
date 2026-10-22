import { renderToStaticMarkup } from "react-dom/server";
import { Recommendation } from "@/components/progression/recommendation";

/**
 * The two recommendation lines (Smarter & Explainable Progression design doc
 * §4.1, §5; preview §09 theme specimen). Plain text in reading order: no
 * control, no truncation, no colour beyond foreground / muted.
 */
describe("Recommendation", () => {
  it("renders nothing without a recommendation", () => {
    expect(renderToStaticMarkup(<Recommendation recommendation={null} />)).toBe(
      "",
    );
  });

  it("strong: the action in the foreground, the evidence muted, in that order", () => {
    const html = renderToStaticMarkup(
      <Recommendation
        recommendation={{
          kind: "progress",
          tone: "strong",
          action: "Try 190 lb today (+5 lb)",
          evidence: "10 reps on every set, 2 sessions running",
        }}
      />,
    );
    expect(html).toBe(
      '<div class="mt-2 space-y-0.5">' +
        '<p class="text-sm tabular-nums font-medium text-foreground">Try 190 lb today (+5 lb)</p>' +
        '<p class="text-xs tabular-nums text-muted-foreground">10 reps on every set, 2 sessions running</p>' +
        "</div>",
    );
  });

  it("quiet: a hold or the deload week stays muted, never coloured", () => {
    const html = renderToStaticMarkup(
      <Recommendation
        recommendation={{
          kind: "hold",
          tone: "quiet",
          action: "Stay at 60 lb today",
          evidence: "Last time: 10, 9, 8 of 8–10",
        }}
      />,
    );
    expect(html).toContain(
      '<p class="text-sm tabular-nums text-muted-foreground">Stay at 60 lb today</p>',
    );
    expect(html).not.toMatch(/font-medium|text-progress|text-deload|<svg/);
  });

  it("has nothing to tap or focus, and never truncates", () => {
    const html = renderToStaticMarkup(
      <Recommendation
        recommendation={{
          kind: "deload",
          tone: "strong",
          action: "Lower the weight today",
          evidence: "A set below 12 reps, 2 sessions running at Downtown Gym",
        }}
      />,
    );
    expect(html).not.toMatch(/<button|<a |<input|tabindex|role=|truncate/);
  });

  it("accepts a spacing override for the day-complete rows", () => {
    expect(
      renderToStaticMarkup(
        <Recommendation
          className="mt-0.5"
          recommendation={{
            kind: "hold",
            tone: "quiet",
            action: "Hold steady next time",
            evidence: "Last time: 12, 10, 9 of 8–12",
          }}
        />,
      ),
    ).toMatch(/^<div class="space-y-0.5 mt-0.5">/);
  });
});
