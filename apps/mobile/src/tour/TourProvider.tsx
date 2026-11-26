import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, AppState, useWindowDimensions } from "react-native";
import { router, usePathname, useRootNavigationState } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { TOUR_NATIVE_INTRO } from "@overload/shared/tour/content";
import { useApi } from "../api/ApiProvider";
import { markTourOffered, recordTourOutcome } from "../api/account";
import { ApiError } from "../api/errors";
import { QUERY_KEYS, useAppConfig, useMe } from "../api/queries";
import {
  measureInWindow,
  TourMeasureContext,
  TourRegistry,
  TourRegistryContext,
  type TourAnchorEntry,
  type TourMeasure,
} from "./anchors";
import {
  insideBand,
  isValidRect,
  sameRect,
  scrollDelta,
  visibleBand,
} from "./geometry";
import {
  INITIAL_TOUR_STATE,
  stepCounter,
  transition,
  type TourEffect,
  type TourEvent,
  type TourMode,
  type TourOutcome,
  type TourState,
} from "./machine";
import { overTabs, tabAtRoot, type NavState } from "./navigation";
import { NATIVE_TOUR_STEPS } from "./steps";
import {
  TourOverlay,
  useReduceMotion,
  type TourOverlayView,
} from "./TourOverlay";
import { TOUR_TAB_PATHS, type NativeTourStep, type Rect } from "./types";

/**
 * The native tour (Pitch 21k spec §5, §7.2–§7.4). It owns one run at a time:
 * the machine's state, going to each step's tab with the app's own router,
 * waiting a bounded time for the step's anchor, measuring it until it is
 * stable, and the two progress writes. It reads nothing about the account but
 * `me.tour` and the app-config flag, and it calls no endpoint but
 * `/me/tour/outcome` and `/me/tour/offered` (RD-E).
 */

export type TourTiming = {
  /** How often to look for a step's anchor (RD-12). */
  pollMs: number;
  /** How long to look before explaining the step in words (RD-12). */
  timeoutMs: number;
  /** One measurement gets this long to answer. */
  measureMs: number;
  /** Delay between the two measurements that must agree. */
  settleMs: number;
  /** A failed outcome write is retried once after this (network only). */
  retryMs: number;
  /** While a step is shown, its target is measured again this often. */
  trackMs: number;
  /** After the run ends, unmount the Modal by then even if iOS is silent. */
  dismissMs: number;
};

export const TOUR_TIMING: TourTiming = {
  pollMs: 100,
  timeoutMs: 3000,
  measureMs: 300,
  settleMs: 16,
  retryMs: 2000,
  trackMs: 250,
  dismissMs: 700,
};

const STABLE_TRIES = 5;

type MeasureContext = {
  sleep: (ms: number) => Promise<void>;
  cancelled: () => boolean;
  /** Date.now() past which measuring gives up (RD-12). */
  deadline: number;
  measureMs: number;
  settleMs: number;
  /** Bring an off-screen target into view first (locating only). */
  scroll: boolean;
  window: { width: number; height: number };
  insets: { top: number; bottom: number };
};

/**
 * A target's settled frame: measured until two readings one beat apart
 * agree, inside the visible band, and before the deadline. Null when it
 * isn't there, isn't visible, or won't settle in time.
 */
async function measureStable(
  entry: TourAnchorEntry,
  ctx: MeasureContext,
): Promise<Rect | null> {
  const band = visibleBand(ctx.window, ctx.insets);
  const timed = () =>
    Promise.race([
      entry.measure().catch(() => null),
      ctx.sleep(ctx.measureMs).then(() => null),
    ]);
  const usable = (r: Rect | null): r is Rect =>
    !!r && isValidRect(r, ctx.window) && insideBand(r, band);
  let a = await timed();
  if (ctx.cancelled() || !a || !isValidRect(a, ctx.window)) return null;
  if (!insideBand(a, band)) {
    // Off screen: let its own scroll view bring it in (RD-14).
    if (!ctx.scroll || !entry.scroller) return null;
    entry.scroller.scrollBy(scrollDelta(a, band));
    await ctx.sleep(ctx.settleMs);
    a = await timed();
    if (ctx.cancelled() || !usable(a)) return null;
  }
  for (let i = 0; i < STABLE_TRIES; i++) {
    if (Date.now() > ctx.deadline) return null;
    await ctx.sleep(ctx.settleMs);
    if (ctx.cancelled()) return null;
    const b = await timed();
    if (ctx.cancelled() || !usable(b)) return null;
    if (sameRect(a, b)) return b;
    a = b;
  }
  return null;
}

type TourContextValue = {
  /** Start a run; false (and an explanation for a manual start) if refused. */
  start: (mode?: TourMode) => boolean;
  /** A run is on screen. */
  active: boolean;
};

const TourContext = createContext<TourContextValue>({
  start: () => false,
  active: false,
});

export function useTour(): TourContextValue {
  return useContext(TourContext);
}

// An automatic run is attempted at most once per launch (spec §10).
let autoAttemptedThisLaunch = false;
/** Tests only: forget that this launch already tried an automatic run. */
export function resetTourAutoStartForTests() {
  autoAttemptedThisLaunch = false;
}

export function TourProvider({
  children,
  measure = measureInWindow,
  steps = NATIVE_TOUR_STEPS,
  timing = TOUR_TIMING,
}: {
  children: ReactNode;
  measure?: TourMeasure;
  steps?: readonly NativeTourStep[];
  timing?: TourTiming;
}) {
  const api = useApi();
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const me = useMe(true);
  const registry = useMemo(() => new TourRegistry(), []);

  const [state, setState] = useState<TourState>(INITIAL_TOUR_STATE);
  const stateRef = useRef(state);

  const pathname = usePathname();
  const navState = useRootNavigationState() as NavState | undefined;
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The latest values, for the async work below (read, never rendered).
  const live = useRef({ pathname, navState, window, insets });
  useLayoutEffect(() => {
    live.current = { pathname, navState, window, insets };
  });

  const retryTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  // False once the provider is gone (sign-out): a late failure must never
  // schedule a retry that would run as whoever signs in next.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const timers = retryTimers.current;
    return () => {
      alive.current = false;
      timers.forEach(clearTimeout);
    };
  }, []);
  // Read before any run, so even the first presentation honors it (RD-M).
  const reduceMotion = useReduceMotion();

  const writeOutcome = useCallback(
    (outcome: TourOutcome) => {
      const send = async (attempt: number): Promise<void> => {
        try {
          await recordTourOutcome(api, outcome);
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
        } catch (error) {
          // Fire-and-forget (RD-11): one retry when the phone was offline,
          // nothing for any other answer, and never a visible error.
          if (
            alive.current &&
            attempt === 0 &&
            error instanceof ApiError &&
            error.code === "network"
          ) {
            const t = setTimeout(() => {
              retryTimers.current.delete(t);
              if (alive.current) void send(1);
            }, timing.retryMs);
            retryTimers.current.add(t);
          }
        }
      };
      void send(0);
    },
    [api, queryClient, timing.retryMs],
  );

  const runEffects = useCallback(
    (effects: readonly TourEffect[]) => {
      for (const effect of effects) {
        if (effect.kind === "record") writeOutcome(effect.outcome);
        else if (effect.kind === "offered") {
          markTourOffered(api).catch(() => {});
        } else if (effect.kind === "return") {
          const { pathname: now, navState: nav } = live.current;
          // Back where a manual tour starts, without ever popping More.
          if (now !== TOUR_TAB_PATHS.more && tabAtRoot(nav, "more")) {
            router.navigate(TOUR_TAB_PATHS.more);
          }
        }
      }
    },
    [api, writeOutcome],
  );

  const dispatch = useCallback(
    (event: TourEvent) => {
      const t = transition(stateRef.current, event, steps.length);
      if (t.state === stateRef.current) return;
      stateRef.current = t.state;
      setState(t.state);
      runEffects(t.effects);
    },
    [steps.length, runEffects],
  );

  const start = useCallback(
    (mode: TourMode = "manual") => {
      if (stateRef.current.phase !== "idle") return false;
      const { pathname: now, navState: nav } = live.current;
      const home =
        mode === "manual" ? TOUR_TAB_PATHS.more : TOUR_TAB_PATHS.today;
      // Never under a workout or a form (RD-6).
      if (overTabs(nav) || now !== home) {
        if (mode === "manual") {
          Alert.alert(
            "Finish what you're doing first",
            "Then open Take a tour from More.",
          );
        }
        return false;
      }
      dispatch({ type: "START", mode });
      return true;
    },
    [dispatch],
  );

  // Locate the current step: go to its tab, then wait (bounded) for its
  // anchor and measure it. Everything is tied to this locate's token, so a
  // later step, a skip, or an unmount drops whatever is still in flight.
  const locatingToken = state.phase === "locating" ? state.token : null;
  const locatingIndex = state.phase === "locating" ? state.index : -1;
  useEffect(() => {
    if (locatingToken === null) return;
    const token = locatingToken;
    const step = steps[locatingIndex];
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });
    // A real deadline, whatever each measurement costs (RD-12).
    const deadline = Date.now() + timing.timeoutMs;
    const ctx = (): MeasureContext => ({
      sleep,
      cancelled: () => cancelled,
      deadline,
      measureMs: timing.measureMs,
      settleMs: timing.settleMs,
      scroll: true,
      window: live.current.window,
      insets: live.current.insets,
    });
    // Where the step is shown. When the tour switched tabs itself, it is
    // that tab's root, even if the pathname hasn't re-rendered yet, so the
    // tour's own move is never mistaken for a foreign one.
    let expected = live.current.pathname;

    const missing = () => {
      if (!cancelled) dispatch({ type: "MISSING", token, path: expected });
    };

    void (async () => {
      if (!step) return missing();
      const home = TOUR_TAB_PATHS[step.tab];
      if (live.current.pathname !== home) {
        // Entering a tab whose stack the lifter left open would pop it,
        // so explain the step in words instead (RD-5).
        if (!tabAtRoot(live.current.navState, step.tab)) return missing();
        router.navigate(home);
        expected = home;
      }
      if (step.kind === "note" || step.targets.length === 0) {
        // Let the tab switch land, so the note is shown on its screen.
        await sleep(timing.settleMs);
        return missing();
      }
      while (!cancelled && Date.now() <= deadline) {
        for (const target of step.targets) {
          const entry = registry.get(target.anchor);
          if (!entry) continue;
          const rect = await measureStable(entry, ctx());
          if (cancelled) return;
          if (rect) {
            dispatch({ type: "FOUND", token, rect, target, path: expected });
            return;
          }
        }
        if (cancelled) return;
        await sleep(timing.pollMs);
      }
      missing();
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [locatingToken, locatingIndex, steps, registry, dispatch, timing]);

  // While a highlighted step is shown, keep measuring its target: a pull-to-
  // refresh, a list arriving, or a week strip loading moves the content, and
  // the ring must follow it (or give way to words if the target is gone).
  const shownToken =
    state.phase === "showing" && state.rect ? state.token : null;
  const shownAnchor =
    state.phase === "showing" ? (state.target?.anchor ?? null) : null;
  useEffect(() => {
    if (shownToken === null || shownAnchor === null) return;
    const token = shownToken;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });
    void (async () => {
      let misses = 0;
      while (!cancelled) {
        await sleep(timing.trackMs);
        if (cancelled) return;
        const entry = registry.get(shownAnchor);
        const rect = entry
          ? await measureStable(entry, {
              sleep,
              cancelled: () => cancelled,
              deadline: Date.now() + timing.trackMs * 4,
              measureMs: timing.measureMs,
              settleMs: timing.settleMs,
              scroll: false,
              window: live.current.window,
              insets: live.current.insets,
            })
          : null;
        if (cancelled) return;
        const now = stateRef.current;
        if (now.phase !== "showing" || now.token !== token) return;
        if (!rect) {
          // Twice in a row, so one slow reading never drops the ring.
          misses += 1;
          if (misses >= 2) {
            dispatch({ type: "MOVED", token, rect: null });
            return;
          }
          continue;
        }
        misses = 0;
        if (!now.rect || !sameRect(rect, now.rect)) {
          dispatch({ type: "MOVED", token, rect });
        }
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [shownToken, shownAnchor, registry, dispatch, timing]);

  // A navigation the tour didn't make ends the run (Onboarding Tour R7).
  useEffect(() => {
    const s = stateRef.current;
    if (s.phase === "showing" && pathname !== s.expectedPath) {
      dispatch({ type: "INTERRUPT", reason: "foreign_navigation" });
    }
  }, [pathname, dispatch]);

  // Leaving the app ends the run, with nothing recorded (RD-10). Only
  // "background": "inactive" is Control Center or a notification glance.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        dispatch({ type: "INTERRUPT", reason: "background" });
      }
    });
    return () => sub.remove();
  }, [dispatch]);

  // The automatic first-login tour (RD-15): only when the server allows it
  // (app-config.tourAutoStart, off until 21l) AND the account is due, on
  // Today with nothing over the tabs, once per launch.
  const allowed = config.data?.tourAutoStart === true;
  // The server never sends What's New while the tour is due (21j RD-7);
  // checked anyway, so two sheets can never present at once.
  const due =
    me.data?.tour.autoStart === true && (me.data?.whatsNew ?? null) === null;
  useEffect(() => {
    if (autoAttemptedThisLaunch || !allowed || !due) return;
    if (pathname !== TOUR_TAB_PATHS.today || overTabs(navState)) return;
    if (stateRef.current.phase !== "idle") return;
    autoAttemptedThisLaunch = true;
    start("auto");
  }, [allowed, due, pathname, navState, start]);

  const view = overlayView(state, steps);
  // The Modal stays mounted while it closes: told to dismiss (no content),
  // then unmounted when iOS reports it gone, or after dismissMs at most.
  const [mounted, setMounted] = useState(false);
  if (view && !mounted) setMounted(true);
  const closing = mounted && !view;
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => setMounted(false), timing.dismissMs);
    return () => clearTimeout(t);
  }, [closing, timing.dismissMs]);
  const dismissed = useCallback(() => setMounted(false), []);
  const context = useMemo(
    () => ({ start, active: state.phase !== "idle" }),
    [start, state.phase],
  );
  const actions = useMemo(
    () => ({
      onStart: () => dispatch({ type: "BEGIN" }),
      onDismiss: () => dispatch({ type: "CANCEL" }),
      onNext: () => dispatch({ type: "NEXT" }),
      onBack: () => dispatch({ type: "BACK" }),
      onSkip: () => dispatch({ type: "SKIP" }),
    }),
    [dispatch],
  );

  return (
    <TourRegistryContext.Provider value={registry}>
      <TourMeasureContext.Provider value={measure}>
        <TourContext.Provider value={context}>
          {children}
          {view || mounted ? (
            <TourOverlay
              view={view}
              actions={actions}
              reduceMotion={reduceMotion}
              onDismissed={dismissed}
            />
          ) : null}
        </TourContext.Provider>
      </TourMeasureContext.Provider>
    </TourRegistryContext.Provider>
  );
}

/** What the overlay shows for a state (null: nothing is mounted). */
export function overlayView(
  state: TourState,
  steps: readonly NativeTourStep[],
): TourOverlayView | null {
  switch (state.phase) {
    case "idle":
      return null;
    case "intro":
      return { kind: "intro", ...TOUR_NATIVE_INTRO };
    case "locating":
      return { kind: "locating" };
    case "showing": {
      const step = steps[state.index];
      if (!step) return null;
      const { position, total } = stepCounter(state.index, steps.length);
      const variant = state.rect
        ? "highlight"
        : step.kind === "note"
          ? "note"
          : "fallback";
      return {
        kind: "step",
        variant,
        stepId: step.id,
        title: step.title,
        body: state.rect
          ? (state.target?.body ?? step.body)
          : (step.fallbackBody ?? step.body),
        position,
        total,
        rect: state.rect,
        targetLabel: state.rect ? (state.target?.label ?? null) : null,
        where:
          variant === "fallback" && step.where
            ? `Find this in ${step.where}.`
            : null,
        last: state.index === steps.length - 1,
      };
    }
  }
}
