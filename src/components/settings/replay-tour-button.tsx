"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour/tour-provider";
import { tourAnchor } from "@/lib/tour/steps";

/**
 * Settings → Tour (Onboarding Tour design doc Screen 4): replays the same
 * maintained tour from its first step. Always available — after a finished or
 * skipped tour, or for an account older than the tour — and never re-arms the
 * automatic offer. It is also the last step's target.
 */
export function ReplayTourButton() {
  const tour = useTour();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 md:h-9"
      onClick={() => tour.start()}
      {...tourAnchor("settings-replay")}
    >
      <RotateCcw aria-hidden className="size-4" />
      Replay tour
    </Button>
  );
}
