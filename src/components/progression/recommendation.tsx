import { cn } from "@/lib/utils";
import type { RecommendationDto } from "@/lib/progression/types";

/**
 * A progression call's two lines: what to do, then the evidence for it
 * (Smarter & Explainable Progression design doc §4.1, §5; preview §01–§08).
 * The strings arrive built on the server by the one builder, so every surface
 * words the same evaluation the same way. Plain text only: nothing here is a
 * control, nothing is truncated (a cut-off reason is a wrong reason), and a
 * hold stays muted — no colour, no icon. No hooks, so it renders inside the
 * card's client island and in server pages alike.
 */
export function Recommendation({
  recommendation,
  className,
}: {
  recommendation: RecommendationDto | null;
  className?: string;
}) {
  if (!recommendation) return null;
  return (
    <div className={cn("mt-2 space-y-0.5", className)}>
      <p
        className={cn(
          "text-sm tabular-nums",
          recommendation.tone === "strong"
            ? "font-medium text-foreground"
            : "text-muted-foreground",
        )}
      >
        {recommendation.action}
      </p>
      <p className="text-xs tabular-nums text-muted-foreground">
        {recommendation.evidence}
      </p>
    </div>
  );
}
