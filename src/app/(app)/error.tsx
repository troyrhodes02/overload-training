"use client";

import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="space-y-4">
      <p className="font-medium">Something went wrong.</p>
      <p className="text-sm text-muted-foreground">
        That wasn&apos;t supposed to happen. Try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
