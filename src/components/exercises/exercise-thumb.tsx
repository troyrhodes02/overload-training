"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Up to two initials: "Banded Row" → "BR", "Shrug" → "SH". */
export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

type Size = "sm" | "lg";

const frame: Record<Size, string> = {
  sm: "size-12 rounded-md",
  lg: "aspect-square w-full max-w-xs rounded-lg",
};

/** Quiet initials tile for custom exercises and any missing/broken image. */
export function MonogramTile({
  name,
  size = "sm",
}: {
  name: string;
  size?: Size;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-muted font-medium text-muted-foreground",
        frame[size],
        size === "sm" ? "text-xs" : "text-3xl",
      )}
    >
      {monogram(name)}
    </div>
  );
}

/**
 * An imported exercise's image from Overload's own Storage. Falls back to the
 * monogram when there is no image (custom exercises) or it fails to load, so
 * an image problem never makes the exercise unusable.
 */
export function ExerciseThumb({
  name,
  imageUrl,
  size = "sm",
}: {
  name: string;
  imageUrl: string | null;
  size?: Size;
}) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) return <MonogramTile name={name} size={size} />;
  return (
    // Plain <img> on purpose (spec D33): small source JPEGs, lazy-loaded.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={size === "lg" ? name : ""}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 border border-border bg-muted object-cover",
        frame[size],
      )}
    />
  );
}
