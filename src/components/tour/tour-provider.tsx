"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { TOUR_STEPS, type TourStep } from "@/lib/tour/steps";
import {
  TOUR_DESKTOP_QUERY,
  TOUR_TARGET_TIMEOUT_MS,
  counter,
  indexAfterLayoutChange,
  nextIndex,
  startIndex,
  stepsForLayout,
  type TourLayout,
} from "@/lib/tour/engine";
import { waitForTarget, type FoundTarget } from "@/lib/tour/dom";
import {
  markTourOfferedAction,
  recordTourOutcomeAction,
} from "@/app/(app)/tour-actions";
import { TourOverlay } from "./tour-overlay";

/**
 * The onboarding tour mechanism (Onboarding Tour spec §6–§7). It walks the
 * registry it is given (TOUR_STEPS by default) and knows nothing about any
 * particular step: for each one it navigates to the step's route with the
 * app's own router, waits for the first available target, and shows the card;
 * a step whose target never appears is skipped in the direction of travel.
 *
 * It opens by itself once per mount when the server says the account is due
 * (`autoStart`), and spends that offer the moment the first step shows (R8).
 * Done records "completed" and returns to where the run started; Skip tour,
 * Escape, and a navigation the tour didn't make record "skipped" and stay put
 * (R7, R17, R18). Replays (Settings) record their outcome too, and never
 * re-arm the automatic offer.
 */

type Source = "auto" | "replay";

type Run = {
  source: Source;
  layout: TourLayout;
  steps: TourStep[];
  index: number;
  skipped: ReadonlySet<string>;
  origin: string;
  /** null while the step's screen/target is loading. */
  target: FoundTarget | null;
  /** The element focus returns to when the run closes (a replay button). */
  returnFocus: HTMLElement | null;
  /** Whether any step has been shown in this run. */
  shown: boolean;
};

type TourApi = {
  start: (opts?: { from?: string }) => void;
  active: boolean;
};

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const api = useContext(TourContext);
  if (!api) throw new Error("useTour must be used inside TourProvider.");
  return api;
}

/** Saves the outcome in the background; only a failure is ever shown (R22). */
function recordOutcome(outcome: "completed" | "skipped") {
  void recordTourOutcomeAction(outcome)
    .then((res) => {
      if (!res.ok) throw new Error(res.error.code);
    })
    .catch(() => {
      toast.error(
        "Couldn't save your tour progress. It may open again next time.",
        { duration: Infinity },
      );
    });
}

/**
 * Back to the control that started a replay, else nowhere in particular.
 * When Done navigated back to the starting screen, that control was rendered
 * anew: it is found again by its own tour anchor attribute (whatever it is).
 */
function restoreFocus(el: HTMLElement | null) {
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (!el) return;
  if (el.isConnected) {
    el.focus();
    return;
  }
  const anchor = el.getAttribute("data-tour");
  if (!anchor) return;
  const deadline = Date.now() + 3000;
  const retry = () => {
    const again = document.querySelector<HTMLElement>(
      `[data-tour="${CSS.escape(anchor)}"]`,
    );
    if (again) again.focus();
    else if (Date.now() < deadline) setTimeout(retry, 50);
  };
  retry();
}

function currentLayout(): TourLayout {
  return window.matchMedia(TOUR_DESKTOP_QUERY).matches ? "desktop" : "phone";
}

export function TourProvider({
  autoStart,
  steps = TOUR_STEPS,
  children,
}: {
  autoStart: boolean;
  steps?: readonly TourStep[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const autoStarted = useRef(false);
  const offerSpent = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: Run | null) => {
    runRef.current = next;
    setRun(next);
  }, []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    const ending = runRef.current;
    commit(null);
    return ending;
  }, [commit]);

  const finish = useCallback(
    (outcome: "completed" | "skipped") => {
      const ending = close();
      if (!ending) return;
      recordOutcome(outcome);
      if (
        outcome === "completed" &&
        window.location.pathname !== ending.origin
      ) {
        router.push(ending.origin);
      }
      // After the dialog (and its focus trap) has unmounted.
      setTimeout(() => restoreFocus(ending.returnFocus), 0);
    },
    [close, router],
  );

  /**
   * Shows step `index` of `base`, skipping steps whose target never appears
   * in the direction of travel (AC-3). Past the end, the run finishes as
   * completed — unless nothing was ever shown, which closes it silently.
   */
  const go = useCallback(
    async (base: Run, index: number, dir: 1 | -1) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let skipped = base.skipped;
      for (;;) {
        if (index < 0) {
          // Backing past the start: show the first step that is still there.
          index = nextIndex(base.steps, skipped, -1, 1);
          dir = 1;
        }
        if (index >= base.steps.length) {
          if (base.shown) finish("completed");
          else close();
          return;
        }
        const step = base.steps[index];
        const loading: Run = { ...base, skipped, index, target: null };
        commit(loading);
        if (window.location.pathname !== step.route) router.push(step.route);
        const found = await waitForTarget(step, {
          timeoutMs: TOUR_TARGET_TIMEOUT_MS,
          signal: controller.signal,
        });
        if (controller.signal.aborted || runRef.current !== loading) return;
        if (found) {
          commit({ ...loading, target: found, shown: true });
          if (loading.source === "auto" && !offerSpent.current) {
            offerSpent.current = true;
            void markTourOfferedAction().catch(() => undefined);
          }
          return;
        }
        skipped = new Set(skipped).add(step.id);
        index = nextIndex(base.steps, skipped, index, dir);
      }
    },
    [close, commit, finish, router],
  );

  const start = useCallback(
    (opts?: { from?: string; source?: Source }) => {
      if (runRef.current) return;
      const layout = currentLayout();
      const offered = stepsForLayout(steps, layout);
      if (offered.length === 0) return;
      const active = document.activeElement;
      const base: Run = {
        source: opts?.source ?? "replay",
        layout,
        steps: offered,
        index: 0,
        skipped: new Set(),
        origin: window.location.pathname,
        target: null,
        shown: false,
        returnFocus:
          opts?.source === "auto" || !(active instanceof HTMLElement)
            ? null
            : active,
      };
      void go(base, startIndex(offered, opts?.from), 1);
    },
    [go, steps],
  );

  // The automatic first tour: once per mount, only when the server says due.
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    start({ source: "auto" });
  }, [autoStart, start]);

  // A navigation the tour did not make (browser Back/Forward) ends it (R17).
  useEffect(() => {
    const current = runRef.current;
    if (!current) return;
    if (pathname !== current.steps[current.index].route) finish("skipped");
  }, [pathname, finish]);

  // Crossing md mid-run re-picks the target, or moves past a step the new
  // layout does not offer (R11).
  useEffect(() => {
    const mql = window.matchMedia(TOUR_DESKTOP_QUERY);
    const onChange = () => {
      const current = runRef.current;
      if (!current) return;
      const layout = currentLayout();
      if (layout === current.layout) return;
      const nextSteps = stepsForLayout(steps, layout);
      const index = indexAfterLayoutChange(
        steps,
        nextSteps,
        current.steps[current.index].id,
      );
      void go({ ...current, layout, steps: nextSteps }, index, 1);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [go, steps]);

  const api = useMemo<TourApi>(
    () => ({ start: (opts) => start(opts), active: run !== null }),
    [start, run],
  );

  const view = run
    ? {
        step: run.steps[run.index],
        target: run.target,
        isPhone: run.layout === "phone",
        ...counter(run.steps, run.skipped, run.index),
        isFirst: nextIndex(run.steps, run.skipped, run.index, -1) < 0,
        isLast:
          nextIndex(run.steps, run.skipped, run.index, 1) >= run.steps.length,
      }
    : null;

  return (
    <TourContext.Provider value={api}>
      {children}
      {view ? (
        <TourOverlay
          {...view}
          onNext={() => {
            const r = runRef.current;
            if (!r || !r.target) return;
            const i = nextIndex(r.steps, r.skipped, r.index, 1);
            if (i >= r.steps.length) finish("completed");
            else void go(r, i, 1);
          }}
          onBack={() => {
            const r = runRef.current;
            if (!r || !r.target) return;
            void go(r, nextIndex(r.steps, r.skipped, r.index, -1), -1);
          }}
          onSkip={() => finish("skipped")}
        />
      ) : null}
    </TourContext.Provider>
  );
}
