import { LandingImage } from "@/components/landing/landing-image";
import type { LandingImageSlot } from "@/lib/landing/images";
import { Eyebrow, GhostWord } from "@/components/landing/product-bits";
import { Reveal } from "@/components/landing/reveal";

/**
 * A full-bleed, art-directed immersive band: a landing photograph under a dark
 * scrim with a short line of copy over it, modeled on the "What Overload won't
 * do" section. The band forces the `dark` appearance so white text stays legible
 * on any photo, and it degrades to the same on-brand placeholder as every other
 * landing slot until the owner drops the `.webp` in — no code change to swap it.
 *
 * Kept deliberately sparse: an eyebrow, a heading, and an optional line. The
 * photography carries the mood; the copy stays out of its way (left-aligned,
 * center-left, over an uncluttered part of the frame).
 */
export function ImmersiveBand({
  slot,
  eyebrow,
  title,
  body,
  ghost,
}: {
  slot: LandingImageSlot;
  eyebrow: string;
  title: string;
  body?: string;
  /** A faint oversized background word for editorial depth. Decorative. */
  ghost?: string;
}) {
  return (
    <section className="dark relative isolate overflow-hidden border-t border-border bg-background text-foreground">
      <div className="absolute inset-0 -z-10">
        <LandingImage slot={slot} decorative sizes="100vw" />
        {/* Vertical scrim top and bottom + a left wash, so the copy reads on any
            photo without blacking the subject out. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-background/75 via-background/25 to-transparent"
        />
      </div>
      <div className="relative mx-auto w-full max-w-5xl px-4 py-24 md:px-6 md:py-32">
        {ghost ? (
          <GhostWord className="absolute -top-4 left-2 text-[22vw] md:text-[16rem]">
            {ghost}
          </GhostWord>
        ) : null}
        <Reveal>
          <div className="relative max-w-2xl space-y-5">
            <Eyebrow index="—">{eyebrow}</Eyebrow>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {title}
            </h2>
            {body ? (
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {body}
              </p>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
