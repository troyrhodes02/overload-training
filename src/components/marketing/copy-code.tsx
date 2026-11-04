"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Copies a promo code (design doc Screen 3 and Screen 9). The only client
 * island on the public pages. It copies text and nothing else: no network
 * call, no discount, no state beyond the 2-second "Copied" swap. If the
 * clipboard is unavailable the code stays selectable and the status line says
 * so.
 */
export function CopyCode({
  code,
  size = "sm",
}: {
  code: string;
  size?: "sm" | "xs";
}) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copy}
        aria-label={`Copy the code ${code}`}
        className={cn(size === "xs" && "h-8 px-2.5 text-xs")}
      >
        {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {state === "copied" ? "Copied" : "Copy"}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {state === "copied" ? (
          <span className="sr-only">Copied {code}</span>
        ) : state === "failed" ? (
          "Couldn't copy. Select the code instead."
        ) : null}
      </span>
    </span>
  );
}
