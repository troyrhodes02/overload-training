import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeCta } from "@/components/marketing/mode-cta";
import { ScreenshotFrame } from "@/components/marketing/screenshot-frame";
import { publicPageMetadata, SITE_DESCRIPTION } from "@/lib/marketing/site";
import {
  HERO,
  LANDING_SECTIONS,
  PLANS_SUMMARY,
  SCREEN_CAPTIONS,
  type LandingSection,
} from "@/lib/marketing/copy";
import {
  formatReleaseDate,
  orderedReleaseNotes,
} from "@/lib/release-notes/catalog";
import { cn } from "@/lib/utils";

export const metadata = publicPageMetadata({
  path: "/",
  title: "Overload — know whether to progress, hold, or deload",
  description: SITE_DESCRIPTION,
});

/**
 * The landing page (design doc Screen 1; spec RD-4, RD-14). Signed-out `/` is
 * rewritten here by the proxy, so its canonical URL is `/`. Hero concept A,
 * then one claim per section, each beside the real screen that proves it
 * (claim → evidence → CTA ledger in the runbook). Static except the
 * server-resolved call to action.
 */

function ProChip() {
  return (
    <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-xs font-medium text-primary">
      Pro
    </span>
  );
}

function SectionTitle({ section }: { section: LandingSection }) {
  return (
    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
      {section.title}
      {section.pro ? <ProChip /> : null}
    </h2>
  );
}

function Copy({ section }: { section: LandingSection }) {
  return (
    <div className="max-w-xl space-y-3 text-base leading-relaxed text-muted-foreground md:text-lg">
      {section.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

function Band({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-6 md:py-24">
        {children}
      </div>
    </section>
  );
}

/** Copy beside a screen; `flip` puts the screen first from md up. */
function Feature({
  section,
  screen,
  flip,
}: {
  section: LandingSection;
  screen: ReactNode;
  flip?: boolean;
}) {
  return (
    <Band>
      <div className="grid gap-8 md:grid-cols-12 md:items-center">
        <div className={cn("space-y-4 md:col-span-5", flip && "md:order-2")}>
          <SectionTitle section={section} />
          <Copy section={section} />
        </div>
        <div className={cn("md:col-span-7", flip && "md:order-1")}>
          {screen}
        </div>
      </div>
    </Band>
  );
}

export default function LandingPage() {
  const recent = orderedReleaseNotes().slice(0, 3);
  const s = LANDING_SECTIONS;
  return (
    <>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-12 md:px-6 md:py-24">
        <div className="space-y-6 md:col-span-5 md:self-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {HERO.title}
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {HERO.body}
          </p>
          <ModeCta placement="hero" />
        </div>
        <div className="md:col-span-7">
          <ScreenshotFrame shot="today" caption={HERO.caption} priority />
        </div>
      </section>

      <Feature
        section={s.log}
        screen={
          <ScreenshotFrame shot="logging" caption={SCREEN_CAPTIONS.logging} />
        }
      />
      <Feature
        section={s.call}
        flip
        screen={
          <ScreenshotFrame shot="exercise" caption={SCREEN_CAPTIONS.exercise} />
        }
      />

      <Band>
        <div className="space-y-8">
          <div className="max-w-xl space-y-4">
            <SectionTitle section={s.gyms} />
            <Copy section={s.gyms} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ScreenshotFrame
              shot="gym-northside"
              caption="Northside Strength"
            />
            <ScreenshotFrame shot="gym-riverside" caption="Riverside Fitness" />
          </div>
        </div>
      </Band>

      <Feature
        section={s.trend}
        screen={
          <ScreenshotFrame shot="trend" caption={SCREEN_CAPTIONS.trend} />
        }
      />

      <Band>
        <div className="space-y-8">
          <SectionTitle section={s.plans} />
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="font-medium">Free</p>
              <p className="mt-2 text-muted-foreground">{PLANS_SUMMARY.free}</p>
            </div>
            <div>
              <p className="font-medium">Pro</p>
              <p className="mt-2 text-muted-foreground">{PLANS_SUMMARY.pro}</p>
            </div>
          </div>
          <Button asChild variant="outline" className="h-11 px-5">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </Band>

      <Band>
        <div className="space-y-4">
          <SectionTitle section={s.wont} />
          <Copy section={s.wont} />
        </div>
      </Band>

      {recent.length > 0 ? (
        <Band>
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Recently shipped
            </h2>
            <ol className="divide-y divide-border border-t border-border">
              {recent.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-1 py-4 sm:flex-row sm:gap-6"
                >
                  <time
                    dateTime={entry.date}
                    className="w-28 shrink-0 text-xs font-medium text-muted-foreground tabular-nums sm:pt-0.5"
                  >
                    {formatReleaseDate(entry.date)}
                  </time>
                  <Link
                    href={`/changelog#${entry.id}`}
                    className="font-medium hover:underline"
                  >
                    {entry.title}
                  </Link>
                </li>
              ))}
            </ol>
            <Link
              href="/changelog"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              All updates <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </Band>
      ) : null}
    </>
  );
}
