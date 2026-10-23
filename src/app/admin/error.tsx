"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * An admin page that couldn't load (Admin Center & Feedback design doc,
 * Screens 3–9 error states): one inline, factual line and a retry. The shell
 * and sub-navigation stay usable around it.
 */
export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Alert>
      <TriangleAlert aria-hidden className="size-4" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>Couldn&apos;t load this page. Try again.</span>
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
