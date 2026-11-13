import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeCta } from "@/components/marketing/mode-cta";
import { ScreenshotFrame } from "@/components/marketing/screenshot-frame";
import { LandingImage } from "@/components/landing/landing-image";
import { ImmersiveBand } from "@/components/landing/immersive-band";
import { Reveal } from "@/components/landing/reveal";
import { TrendRevealChart } from "@/components/landing/trend-reveal-chart";
import {
  Eyebrow,
  GhostWord,
  LastTimeChip,
  CallCard,
  DayCard,
  Tag,
  GymWorkingWeight,
} from "@/components/landing/product-bits";
import { publicPageMetadata, SITE_DESCRIPTION } from "@/lib/marketing/site";
import {
  DAY_SHOWCASE,
  FINAL_CTA,
  FREE_FEATURES,
  HERO,
  IMMERSIVE_BANDS,
  LANDING_SECTIONS,
  PLANS_SUMMARY,
  PRO_FEATURES,
  SCREEN_CAPTIONS,
  type LandingSection,
} from "@/lib/marketing/copy";
import { cn } from "@/lib/utils";

export const metadata = publicPageMetadata({
  path: "/",
  title: "Overload — know whether to progress, hold, or deload",
  description: SITE_DESCRIPTION,
});

/**
 * The landing page (design doc Screen 1; spec RD-4, RD-14), redesigned as a
 * dark, editorial, premium surface. The product stays a quiet instrument — the
 * real demo screenshots are the proof and the only captures — while the
 * composition around them (a layered hero, a live e1RM trend, per-gym weight
 * callouts, and immersive photography slots) is expressive. Theme-aware via
 * tokens; the immersive photo bands are art-directed dark in both appearances.
 *
 * The hero is art-directed around the photograph, not around the product: one
 * large, clearly visible training image with a single compact progression call
 * laid over its lower corner as a glass accent — the subject stays visible and
 * most of the frame is unobstructed, so any good gym photo swapped into the
 * hero slot works without a layout edit. The Today panel sits in a showcase band
 * of its own right below the hero, rendered in Overload's own UI (DayCard) so no
 * demo name is ever baked into an image.
 *
 * Guard rails kept intact: the product screenshots render (exercise, logging,
 * trend), the hero photograph is the one eager/LCP image, every CTA comes from
 * the server-resolved ModeCta (including the closing call to action), and all
 * claims come from copy.ts. The landing no longer lists release notes; the
 * public changelog owns that.
 *
 * Depth: sections alternate a barely-there `bg-muted/40` band against the
 * page background so the page reads in layers without a second palette, and
 * raised surfaces (cards, the closing CTA) carry a soft shadow that lifts on
 * hover. All of it is token-based, so it holds in light, dark, and System.
 */

const INNER = "mx-auto w-full max-w-5xl px-4 md:px-6";

function ProChip() {
  return (
    <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-xs font-medium text-primary">
      Pro
    </span>
  );
}

function Heading({
  section,
  as: Tag2 = "h2",
}: {
  section: LandingSection;
  as?: "h2" | "h3";
}) {
  return (
    <Tag2 className="text-2xl font-semibold tracking-tight md:text-3xl">
      {section.title}
      {section.pro ? <ProChip /> : null}
    </Tag2>
  );
}

function Prose({ section }: { section: LandingSection }) {
  return (
    <div className="max-w-xl space-y-3 text-base leading-relaxed text-muted-foreground md:text-lg">
      {section.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

function SectionShell({
  children,
  className,
  labelledById,
  tint = false,
}: {
  children: ReactNode;
  className?: string;
  labelledById?: string;
  /** Lay a faint `bg-muted/40` band over the page background for depth. */
  tint?: boolean;
}) {
  return (
    <section
      aria-labelledby={labelledById}
      className={cn("border-t border-border", tint && "bg-muted/40", className)}
    >
      <div className={cn(INNER, "py-16 md:py-24")}>{children}</div>
    </section>
  );
}

/** A raised surface: soft shadow, a gentle lift and ring warmth on hover. */
const RAISED =
  "shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md";

export default function LandingPage() {
  const s = LANDING_SECTIONS;
  const titleParts = HERO.title.split(/(?<=\.)\s+/);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(70%_55%_at_50%_-5%,color-mix(in_srgb,var(--color-primary)_9%,transparent),transparent_60%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(75%_60%_at_50%_0%,black,transparent)] bg-[repeating-linear-gradient(0deg,var(--color-border)_0,var(--color-border)_1px,transparent_1px,transparent_42px),repeating-linear-gradient(90deg,var(--color-border)_0,var(--color-border)_1px,transparent_1px,transparent_42px)]"
        />
        <div
          className={cn(
            INNER,
            "grid items-center gap-10 py-16 md:grid-cols-12 md:gap-10 md:py-24 lg:gap-12 lg:py-28",
          )}
        >
          <div className="flex flex-col justify-center gap-6 md:col-span-6 lg:col-span-5">
            <Reveal>
              <Eyebrow index="—">Progress · Hold · Deload</Eyebrow>
            </Reveal>
            <Reveal delayClass="delay-75">
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                <span className="block">{titleParts[0]}</span>
                {titleParts.length > 1 ? (
                  <span className="block text-muted-foreground">
                    {titleParts.slice(1).join(" ")}
                  </span>
                ) : null}
              </h1>
            </Reveal>
            <Reveal delayClass="delay-100">
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {HERO.body}
              </p>
            </Reveal>
            <Reveal delayClass="delay-150">
              <ModeCta placement="hero" />
            </Reveal>
          </div>

          {/* The photograph leads: one large, clearly visible training image
              with a single compact call laid over its lower-left corner. The
              scrim is confined to the bottom, so the subject up top stays
              clear and the frame reads as photography, not a dark backdrop. */}
          <div className="md:col-span-6 lg:col-span-7">
            <Reveal delayClass="delay-100">
              <div className="relative">
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:aspect-[4/3] md:aspect-[4/5] lg:aspect-[5/6]">
                  <LandingImage
                    slot="hero"
                    decorative
                    priority
                    sizes="(max-width: 768px) 100vw, 600px"
                  />
                  {/* Restrained bottom-only scrim: just enough to seat the
                      call, leaving the upper two-thirds of the photo untouched. */}
                  <div
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background/70 via-background/15 to-transparent"
                  />
                  {/* A hairline inner edge for a crafted, framed feel. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5"
                  />
                </div>
                <Reveal
                  delayClass="delay-300"
                  className="absolute bottom-4 left-4 w-64 max-w-[calc(100%-2rem)] sm:bottom-6 sm:left-6 lg:-left-6"
                >
                  <CallCard />
                </Reveal>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── The day (Today dashboard, relocated out of the hero) ─────── */}
      <SectionShell labelledById="day" tint>
        <div className="space-y-6">
          <Reveal>
            <Eyebrow index="—">{DAY_SHOWCASE.eyebrow}</Eyebrow>
          </Reveal>
          <Reveal delayClass="delay-75">
            <h2
              id="day"
              className="max-w-2xl text-2xl font-semibold tracking-tight md:text-3xl"
            >
              {DAY_SHOWCASE.title}
            </h2>
          </Reveal>
          <Reveal delayClass="delay-100">
            <div className="mx-auto w-full max-w-2xl">
              <DayCard />
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {HERO.caption}
              </p>
            </div>
          </Reveal>
        </div>
      </SectionShell>

      {/* ── Immersive band · the work ────────────────────────────────── */}
      <ImmersiveBand
        slot={IMMERSIVE_BANDS.work.slot}
        eyebrow={IMMERSIVE_BANDS.work.eyebrow}
        title={IMMERSIVE_BANDS.work.title}
        body={IMMERSIVE_BANDS.work.body}
      />

      {/* ── 01 · The call (progression intelligence) ─────────────────── */}
      <SectionShell labelledById="call">
        <div className="grid gap-10 md:grid-cols-12 md:items-center">
          <div className="space-y-5 md:col-span-5">
            <Reveal>
              <Eyebrow index="01">The call</Eyebrow>
            </Reveal>
            <Reveal delayClass="delay-75">
              <div className="space-y-4" id="call">
                <Heading section={s.call} />
                <Prose section={s.call} />
              </div>
            </Reveal>
          </div>
          <div className="md:col-span-7">
            <Reveal delayClass="delay-100">
              <div className="relative">
                <ScreenshotFrame
                  shot="exercise"
                  caption={SCREEN_CAPTIONS.exercise}
                />
                <div className="pointer-events-none absolute -top-3 right-4 hidden sm:block">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium shadow-sm">
                    <Tag kind="progress" />
                    ready to go up
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </SectionShell>

      {/* ── 02 · The log (guided logging) ────────────────────────────── */}
      <SectionShell labelledById="log" tint>
        <div className="grid gap-10 md:grid-cols-12 md:items-center">
          <div className="space-y-5 md:col-span-5 md:order-2">
            <Reveal>
              <Eyebrow index="02">The log</Eyebrow>
            </Reveal>
            <Reveal delayClass="delay-75">
              <div className="space-y-4" id="log">
                <Heading section={s.log} />
                <Prose section={s.log} />
                <LastTimeChip />
              </div>
            </Reveal>
          </div>
          <div className="md:col-span-7 md:order-1">
            <Reveal delayClass="delay-100">
              <div className="relative">
                <ScreenshotFrame
                  shot="logging"
                  caption={SCREEN_CAPTIONS.logging}
                />
                {/* Training-detail photo as a floating editorial accent. */}
                <div className="absolute -bottom-6 -right-3 hidden h-32 w-32 overflow-hidden rounded-xl border border-border shadow-sm sm:block lg:h-40 lg:w-40">
                  <LandingImage
                    slot="trainingDetail"
                    decorative
                    sizes="160px"
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </SectionShell>

      {/* ── Immersive band · the long run ────────────────────────────── */}
      <ImmersiveBand
        slot={IMMERSIVE_BANDS.longRun.slot}
        eyebrow={IMMERSIVE_BANDS.longRun.eyebrow}
        title={IMMERSIVE_BANDS.longRun.title}
        body={IMMERSIVE_BANDS.longRun.body}
      />

      {/* ── 03 · The trend (e1RM) ────────────────────────────────────── */}
      <SectionShell labelledById="trend">
        <div className="space-y-8">
          <div className="space-y-4">
            <Reveal>
              <Eyebrow index="03">The trend</Eyebrow>
            </Reveal>
            <Reveal delayClass="delay-75">
              <div className="space-y-4" id="trend">
                <Heading section={s.trend} />
                <Prose section={s.trend} />
              </div>
            </Reveal>
          </div>
          <div className="grid gap-6 md:grid-cols-12 md:items-stretch">
            <div className="md:col-span-7">
              <Reveal delayClass="delay-100">
                <div
                  className={cn(
                    "h-full rounded-xl border border-border bg-card p-5 md:p-6",
                    RAISED,
                  )}
                >
                  <TrendRevealChart />
                </div>
              </Reveal>
            </div>
            <div className="md:col-span-5">
              <Reveal delayClass="delay-150">
                <ScreenshotFrame shot="trend" caption={SCREEN_CAPTIONS.trend} />
              </Reveal>
            </div>
          </div>
        </div>
      </SectionShell>

      {/* ── 04 · Per gym (gym-specific weights) ──────────────────────────
          One integrated composition: the physical machine (photo), the two
          gym contexts, and the two independent working weights. Equal-height
          columns, so the photo and the comparison read as a single designed
          unit with no stranded space. The pair is deliberately symmetric —
          separate baselines, never a before/after. */}
      <SectionShell labelledById="gyms" tint>
        <div className="space-y-10">
          <div className="max-w-2xl space-y-4">
            <Reveal>
              <Eyebrow index="04">Per gym</Eyebrow>
            </Reveal>
            <Reveal delayClass="delay-75">
              <div className="space-y-4" id="gyms">
                <Heading section={s.gyms} />
                <Prose section={s.gyms} />
              </div>
            </Reveal>
          </div>

          <Reveal delayClass="delay-100">
            <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:grid-cols-12">
              {/* The machine — a full-height photographic anchor. */}
              <div className="relative h-60 md:col-span-5 md:h-auto">
                <LandingImage
                  slot="machineDetail"
                  decorative
                  sizes="(max-width: 768px) 100vw, 460px"
                />
                {/* Blend the photo into the comparison at its inner edge, and
                    keep the subject clear (never a heavy opaque card). The
                    image is a generic pin-loaded stack, so it carries no
                    exercise label — the comparison names the context. */}
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-background/35 to-transparent md:bg-gradient-to-r md:from-transparent md:to-card/40"
                />
              </div>

              {/* The two gym contexts — the same machine, logged apart. */}
              <div className="md:col-span-7">
                <div className="flex h-full flex-col justify-center gap-5 border-t border-border p-6 md:border-l md:border-t-0 md:p-8">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Working weight by gym
                  </p>
                  <div className="relative grid gap-5 sm:grid-cols-2 sm:gap-8">
                    <GymWorkingWeight gym="Northside Strength" weight={130} />
                    <GymWorkingWeight gym="Riverside Fitness" weight={160} />
                    {/* A fine connective: same machine, two separate stacks. */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-4 left-1/2 hidden w-px -translate-x-1/2 bg-border sm:block"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-1/2 top-1/2 hidden size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm sm:flex"
                    >
                      <Dumbbell className="size-4" />
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Separate baselines for the same machine — not a
                    before-and-after.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </SectionShell>

      {/* ── What Overload won't do (immersive, art-directed dark) ─────── */}
      <section className="dark relative isolate overflow-hidden border-t border-border bg-background text-foreground">
        <div className="absolute inset-0 -z-10">
          <LandingImage slot="gymAtmosphere" decorative sizes="100vw" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-background via-background/85 to-background"
          />
        </div>
        <div className={cn(INNER, "relative py-24 md:py-32")}>
          <GhostWord className="absolute -top-4 left-2 text-[22vw] md:text-[16rem]">
            Yours
          </GhostWord>
          <Reveal>
            <div className="relative max-w-2xl space-y-5">
              <Eyebrow index="—">The boundary</Eyebrow>
              <Heading section={s.wont} />
              <Prose section={s.wont} />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Plans ────────────────────────────────────────────────────── */}
      <SectionShell labelledById="plans">
        <div className="space-y-8">
          <Reveal>
            <div className="space-y-4" id="plans">
              <Heading section={s.plans} />
              <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Everything you enter stays yours on either plan. Capture is
                free; the interpretation is Pro.
              </p>
            </div>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-2">
            <Reveal delayClass="delay-75">
              <div
                className={cn(
                  "h-full rounded-xl border border-border bg-card p-6",
                  RAISED,
                )}
              >
                <p className="font-medium">Free</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {PLANS_SUMMARY.free}
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {FREE_FEATURES.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delayClass="delay-100">
              <div
                className={cn(
                  "h-full rounded-xl border border-primary/30 bg-card p-6 ring-1 ring-primary/10",
                  RAISED,
                )}
              >
                <p className="font-medium">
                  Pro
                  <ProChip />
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {PLANS_SUMMARY.pro}
                </p>
                <ul className="mt-5 space-y-2 text-sm">
                  {PRO_FEATURES.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
          <Button asChild variant="outline" className="h-11 px-5">
            <Link href="/pricing">
              See pricing <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
      </SectionShell>

      {/* ── Closing call to action ───────────────────────────────────── */}
      <SectionShell labelledById="get-started" tint>
        <Reveal>
          <div
            className={cn(
              "relative isolate overflow-hidden rounded-2xl border border-border bg-card p-8 text-center md:p-14",
              RAISED,
            )}
          >
            {/* Faint brand wash — the one accent, kept quiet (design §4). */}
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_0%,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent_70%)]"
            />
            <div className="mx-auto flex max-w-xl flex-col items-center gap-5">
              <Eyebrow index="—">{FINAL_CTA.eyebrow}</Eyebrow>
              <h2
                id="get-started"
                className="text-3xl font-semibold tracking-tight md:text-4xl"
              >
                {FINAL_CTA.title}
              </h2>
              <p className="max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
                {FINAL_CTA.body}
              </p>
              <div className="mt-1 flex w-full flex-col items-center">
                <ModeCta placement="hero" />
              </div>
            </div>
          </div>
        </Reveal>
      </SectionShell>
    </>
  );
}
