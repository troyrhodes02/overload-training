import Image from "next/image";
import { ImageOff } from "lucide-react";
import { landingImageExists } from "@/lib/landing/image-manifest";
import { LANDING_IMAGES, type LandingImageSlot } from "@/lib/landing/images";
import { cn } from "@/lib/utils";

/**
 * One landing photograph slot, resolved on the server (design: owner-managed
 * photography system). It fills its positioned parent, so the parent owns the
 * aspect ratio and reserves the box — no layout shift — and any scrim or motion
 * the page layers around it applies the same whether the real photo exists yet
 * or not.
 *
 * Missing file → a deliberate, on-brand placeholder at the exact same box,
 * never a broken image. The decision is made from the server-side manifest
 * before render, so there is no client onError flash and nothing pops in on
 * navigation. When the owner drops a correctly named `.webp` into
 * `public/images/landing/`, the real photo takes the same place with no code
 * change.
 *
 * By default these photos lazy-load — lower sections never need to race the
 * fold. The one exception is the hero photograph, which the redesign makes the
 * page's dominant visual and its LCP: the hero slot passes `priority`, so it
 * (and only it) loads eagerly with a high fetch priority. In development the
 * file is served unoptimized so a replacement shows on a hard refresh without
 * clearing the image cache (see the README).
 */

const isDev = process.env.NODE_ENV === "development";

export function LandingImage({
  slot,
  sizes = "100vw",
  decorative = false,
  priority = false,
  className,
}: {
  slot: LandingImageSlot;
  /** `next/image` responsive sizes hint for the real photo. */
  sizes?: string;
  /** Atmospheric placements pass true to render empty alt text. */
  decorative?: boolean;
  /**
   * The hero photograph passes true: it is the LCP, so it loads eagerly with a
   * high fetch priority and a preload hint. Every other slot stays lazy.
   */
  priority?: boolean;
  /** Extra classes on the fill layer (e.g. a per-placement object-position). */
  className?: string;
}) {
  const config = LANDING_IMAGES[slot];

  if (landingImageExists(slot)) {
    return (
      <Image
        src={config.src}
        alt={decorative ? "" : config.alt}
        fill
        sizes={sizes}
        unoptimized={isDev}
        priority={priority}
        loading={priority ? "eager" : undefined}
        className={cn("object-cover", config.objectClass, className)}
      />
    );
  }

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden bg-muted", className)}
      role="img"
      aria-label={decorative ? undefined : `${config.purpose} (placeholder)`}
      aria-hidden={decorative || undefined}
      data-landing-placeholder={config.file}
    >
      {/* Fine grid, kept faint by the border token and low opacity. */}
      <div className="absolute inset-0 opacity-50 bg-[repeating-linear-gradient(0deg,var(--color-border)_0,var(--color-border)_1px,transparent_1px,transparent_34px),repeating-linear-gradient(90deg,var(--color-border)_0,var(--color-border)_1px,transparent_1px,transparent_34px)]" />
      {/* A soft accent wash for depth, not decoration for its own sake. */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_30%,color-mix(in_srgb,var(--color-primary)_10%,transparent),transparent_70%)]" />
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <ImageOff aria-hidden className="size-5 text-muted-foreground" />
        <span className="rounded-md border border-border bg-background/40 px-2 py-1 text-xs font-medium tracking-tight text-muted-foreground tabular-nums">
          {config.file}
        </span>
        <span className="max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
          {config.purpose}
        </span>
      </div>
    </div>
  );
}
