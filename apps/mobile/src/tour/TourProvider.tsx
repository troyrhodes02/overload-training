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
import { TourOverlay, type TourOverlayView } from "./TourOverlay";
import {
  TOUR_TAB_PATHS,
  type NativeTourStep,
  type Rect,
  type TourTarget,
} from "./types";

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
};

export const TOUR_TIMING: TourTiming = {
  pollMs: 100,
  timeoutMs: 3000,
  measureMs: 300,
  settleMs: 16,
  retryMs: 2000,
};

const STABLE_TRIES = 5;

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
  useEffect(() => {
    const timers = retryTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

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
            attempt === 0 &&
            error instanceof ApiError &&
            error.code === "network"
          ) {
            const t = setTimeout(() => {
              retryTimers.current.delete(t);
              void send(1);
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
    const timed = (p: Promise<Rect | null>) =>
      Promise.race([
        p.catch(() => null),
        sleep(timing.measureMs).then(() => null),
      ]);

    const measureStable = async (
      entry: TourAnchorEntry,
    ): Promise<Rect | null> => {
      const { window: win, insets: ins } = live.current;
      const band = visibleBand(win, ins);
      let a = await timed(entry.measure());
      if (cancelled || !a || !isValidRect(a, win)) return null;
      if (!insideBand(a, band)) {
        // Off screen: let its own scroll view bring it in (RD-14).
        if (!entry.scroller) return null;
        entry.scroller.scrollBy(scrollDelta(a, band));
        await sleep(timing.settleMs);
        a = await timed(entry.measure());
        if (cancelled || !a || !isValidRect(a, win) || !insideBand(a, band)) {
          return null;
        }
      }
      for (let i = 0; i < STABLE_TRIES; i++) {
        await sleep(timing.settleMs);
        if (cancelled) return null;
        const b = await timed(entry.measure());
        if (cancelled || !b || !isValidRect(b, win)) return null;
        if (sameRect(a, b)) return b;
        a = b;
      }
      return null;
    };

    const find = async (): Promise<{
      rect: Rect;
      target: TourTarget;
    } | null> => {
      for (const target of step.targets) {
        const entry = registry.get(target.anchor);
        if (!entry) continue;
        const rect = await measureStable(entry);
        if (cancelled) return null;
        if (rect) return { rect, target };
      }
      return null;
    };

    const missing = () => {
      if (!cancelled) {
        dispatch({ type: "MISSING", token, path: live.current.pathname });
      }
    };

    void (async () => {
      if (!step) return missing();
      const home = TOUR_TAB_PATHS[step.tab];
      if (live.current.pathname !== home) {
        // Entering a tab whose stack the lifter left open would pop it,
        // so explain the step in words instead (RD-5).
        if (!tabAtRoot(live.current.navState, step.tab)) return missing();
        router.navigate(home);
      }
      if (step.kind === "note" || step.targets.length === 0) {
        // Let the tab switch land, so the note is shown on its screen.
        await sleep(timing.settleMs);
        return missing();
      }
      const tries = Math.ceil(timing.timeoutMs / timing.pollMs);
      for (let i = 0; i <= tries; i++) {
        if (cancelled) return;
        const hit = await find();
        if (cancelled) return;
        if (hit) {
          dispatch({
            type: "FOUND",
            token,
            rect: hit.rect,
            target: hit.target,
            path: live.current.pathname,
          });
          return;
        }
        await sleep(timing.pollMs);
      }
      missing();
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [locatingToken, locatingIndex, steps, registry, dispatch, timing]);

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
  const due = me.data?.tour.autoStart === true;
  useEffect(() => {
    if (autoAttemptedThisLaunch || !allowed || !due) return;
    if (pathname !== TOUR_TAB_PATHS.today || overTabs(navState)) return;
    if (stateRef.current.phase !== "idle") return;
    autoAttemptedThisLaunch = true;
    start("auto");
  }, [allowed, due, pathname, navState, start]);

  const view = overlayView(state, steps);
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
          {view ? <TourOverlay view={view} actions={actions} /> : null}
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
