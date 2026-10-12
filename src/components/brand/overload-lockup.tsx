import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Overload brand lockup: the electric-blue geometric mark beside the
 * "Overload" wordmark set in the app's Inter. The mark is a transparent PNG so
 * it reads on both dark and light surfaces, and the wordmark is live text so it
 * stays sharp at any size and inherits the theme foreground. No baked image
 * whitespace — the mark is pre-trimmed to its glyph (public/brand/overload-mark.png).
 */
export function OverloadLockup({
  size = "sm",
  className,
}: {
  size?: "sm" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? 36 : 22;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/brand/overload-mark.png"
        alt=""
        width={px}
        height={px}
        priority
        className="shrink-0"
      />
      <span
        className={cn(
          "font-semibold tracking-tight",
          size === "lg" ? "text-2xl" : "text-lg",
        )}
      >
        Overload
      </span>
    </span>
  );
}
