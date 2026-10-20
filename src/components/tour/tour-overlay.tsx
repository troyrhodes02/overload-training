"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/lib/tour/steps";
import type { FoundTarget } from "@/lib/tour/dom";
import {
  TOUR_SPOTLIGHT_PADDING_PX,
  placeCard,
  type Rect,
} from "@/lib/tour/engine";

/**
 * The tour's presentation (Onboarding Tour design doc Screen 1; preview §01–
 * §05): a modal dialog (focus trapped, Escape = Skip tour, a scrim click does
 * nothing) with a spotlight cut around the real target and one card. On a
 * phone the card docks at the bottom within thumb reach; at md+ it sits beside
 * its target (placeCard). While the next screen loads, the scrim covers the
 * page and the card shows the next title over a skeleton line.
 */

type Props = {
  step: TourStep;
  target: FoundTarget | null;
  isPhone: boolean;
  position: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

const PAD = TOUR_SPOTLIGHT_PADDING_PX;
/** Room the docked phone card takes at the bottom (card + gutter). */
const PHONE_CARD_ROOM_PX = 280;

/** Corner radius of the spotlight cut (rounded-lg). */
const RADIUS = 8;

/**
 * The scrim with a rounded hole around the target, as one even-odd SVG path
 * over the whole viewport. (A huge box-shadow spread is not painted reliably
 * across the viewport in Chrome, so it is not used.)
 */
function scrimPath(r: Rect, vw: number, vh: number): string {
  const x = r.left - PAD;
  const y = r.top - PAD;
  const w = r.width + PAD * 2;
  const h = r.height + PAD * 2;
  const k = Math.min(RADIUS, w / 2, h / 2);
  return (
    `M0 0H${vw}V${vh}H0Z` +
    `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}` +
    `V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}` +
    `H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}` +
    `V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`
  );
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.top === b.top &&
      a.left === b.left &&
      a.width === b.width &&
      a.height === b.height)
  );
}

export function TourOverlay({
  step,
  target,
  isPhone,
  position,
  total,
  isFirst,
  isLast,
  onNext,
  onBack,
  onSkip,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [place, setPlace] = useState<{ top: number; left: number } | null>(
    null,
  );

  // Bring the target into view above the docked card (or anywhere on desktop).
  useLayoutEffect(() => {
    if (!target) return;
    const r = target.el.getBoundingClientRect();
    const bottomLimit =
      window.innerHeight - (isPhone ? PHONE_CARD_ROOM_PX : PAD);
    if (r.top < PAD || r.bottom > bottomLimit) {
      target.el.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }, [target, isPhone]);

  // Follow the target (scroll, resize, layout shifts) and place the card.
  // A layout effect, so the first paint with a new target already uses its
  // own rect and placement (never the previous step's).
  useLayoutEffect(() => {
    if (!target) return;
    let frame = 0;
    let last: Rect | null = null;
    const tick = () => {
      const b = target.el.getBoundingClientRect();
      const next: Rect = {
        top: b.top,
        left: b.left,
        width: b.width,
        height: b.height,
      };
      if (!sameRect(last, next)) {
        last = next;
        setRect(next);
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setViewport((prev) =>
        prev.width === vw && prev.height === vh
          ? prev
          : { width: vw, height: vh },
      );
      const card = cardRef.current;
      if (!isPhone && card) {
        const p = placeCard(
          next,
          { width: card.offsetWidth, height: card.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
          target.side,
        );
        setPlace((prev) =>
          prev && prev.top === p.top && prev.left === p.left ? prev : p,
        );
      }
      // Modal contract: while a step is shown, focus never rests outside the
      // card (e.g. on <body> after the page underneath unmounted mid-run).
      if (
        card &&
        getComputedStyle(card).visibility === "visible" &&
        !card.contains(document.activeElement)
      ) {
        primaryRef.current?.focus();
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [target, isPhone]);

  const loading = target === null;
  const anchored = !isPhone && place !== null;
  const visible = isPhone || anchored;

  // Every shown step starts with focus on its primary action — once the card
  // is visible (a desktop card is hidden until it has been placed).
  useEffect(() => {
    if (target && visible) primaryRef.current?.focus();
  }, [target, step.id, visible]);

  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        {/* One stable element, always before the card in the DOM, so the card
            stays on top whichever scrim is showing. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
          {loading || !rect || viewport.width === 0 ? (
            <div className="absolute inset-0 bg-black/50" />
          ) : (
            <>
              <svg
                className="absolute inset-0 size-full"
                viewBox={`0 0 ${viewport.width} ${viewport.height}`}
                preserveAspectRatio="none"
              >
                <path
                  d={scrimPath(rect, viewport.width, viewport.height)}
                  fill="black"
                  fillOpacity={0.5}
                  fillRule="evenodd"
                />
              </svg>
              <div
                data-tour-spotlight=""
                className="absolute rounded-lg ring-2 ring-primary"
                style={{
                  top: rect.top - PAD,
                  left: rect.left - PAD,
                  width: rect.width + PAD * 2,
                  height: rect.height + PAD * 2,
                }}
              />
            </>
          )}
        </div>
        <DialogPrimitive.Content
          ref={cardRef}
          data-tour-card=""
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            primaryRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            onSkip();
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed z-50 flex flex-col gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none",
            "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none",
            isPhone ? "inset-x-4 bottom-4" : "w-80",
            !visible && "invisible",
          )}
          style={isPhone || !place ? undefined : place}
        >
          <p className="text-xs font-medium text-muted-foreground tabular-nums">
            <span className="sr-only">Step </span>
            {position} of {total}
          </p>
          <DialogPrimitive.Title className="text-base font-semibold">
            {step.title}
          </DialogPrimitive.Title>
          {loading ? (
            <>
              <DialogPrimitive.Description className="sr-only">
                Loading
              </DialogPrimitive.Description>
              <div aria-hidden className="space-y-2 py-0.5">
                <Skeleton className="h-4 w-[85%]" />
                <Skeleton className="h-4 w-[55%]" />
              </div>
            </>
          ) : (
            <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
              {target.body}
            </DialogPrimitive.Description>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onSkip}
              className="mr-auto h-11 md:h-9 max-[359px]:basis-full max-[359px]:justify-start max-[359px]:px-0"
            >
              Skip tour
            </Button>
            <div className="ml-auto flex gap-2">
              {isFirst ? null : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onBack}
                  disabled={loading}
                  className="h-11 md:h-9"
                >
                  Back
                </Button>
              )}
              <Button
                ref={primaryRef}
                type="button"
                onClick={onNext}
                disabled={loading}
                className="h-11 md:h-9"
              >
                {isLast ? "Done" : "Next"}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
