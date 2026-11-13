"use client";

import { useState } from "react";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "lg";

const frame: Record<Size, string> = {
  sm: "size-12 rounded-md",
  lg: "aspect-square w-full max-w-xs rounded-lg",
};

/** Quiet generic exercise tile for custom exercises and any missing/broken image. */
export function PlaceholderTile({ size = "sm" }: { size?: Size }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-muted text-muted-foreground",
        frame[size],
      )}
    >
      <Dumbbell className={size === "sm" ? "size-5" : "size-16"} />
    </div>
  );
}

/**
 * An imported exercise's image from Overload's own Storage. Falls back to the
 * generic exercise icon when there is no image (custom exercises) or it fails to load, so
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
  if (!imageUrl || failed) return <PlaceholderTile size={size} />;
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
