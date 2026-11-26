import type { TourTab } from "./types";

/**
 * Reading the root navigation state for the tour (Pitch 21k spec §7.4). Pure
 * over the shape React Navigation keeps: a stack of routes, each with an
 * optional nested state. The tour uses it to refuse a launch while anything
 * sits over the tabs (a workout, a form: RD-6), and to never enter a tab whose
 * stack the lifter left open, which would pop it (RD-5).
 */

export type NavRoute = {
  readonly name: string;
  readonly state?: NavState;
};
export type NavState = {
  readonly index?: number;
  readonly routes: readonly NavRoute[];
};

/** The signed-in shell's group in the root stack (`src/app/(tabs)`). */
export const TABS_ROUTE = "(tabs)";
/** Expo Router's own wrapper around the app's root layout. */
export const ROUTER_ROOT = "__root";

/** The app's root stack: Expo Router's `__root` wrapper, unwrapped. */
function appRoot(state: NavState | undefined): NavState | undefined {
  if (!state) return undefined;
  const only = state.routes.length === 1 ? state.routes[0] : undefined;
  if (only?.name === ROUTER_ROOT) return only.state;
  return state;
}

function focused(state: NavState | undefined): NavRoute | undefined {
  if (!state || state.routes.length === 0) return undefined;
  const i = state.index ?? state.routes.length - 1;
  return state.routes[i];
}

/**
 * True when something other than the tabs is on top of the root stack, or the
 * state is not known yet (treated as unsafe).
 */
export function overTabs(raw: NavState | undefined): boolean {
  const state = appRoot(raw);
  if (!state) return true;
  const top = focused(state);
  if (!top) return true;
  if (top.name !== TABS_ROUTE) return true;
  // The tabs route is focused; anything stacked after it is still on top.
  return (state.index ?? state.routes.length - 1) !== state.routes.length - 1;
}

function tabsState(state: NavState | undefined): NavState | undefined {
  return appRoot(state)?.routes.find((r) => r.name === TABS_ROUTE)?.state;
}

/**
 * True when the tab can be entered without popping anything: it was never
 * opened (no nested state yet), or its stack holds only its root screen.
 */
export function tabAtRoot(state: NavState | undefined, tab: TourTab): boolean {
  const tabs = tabsState(state);
  if (!tabs) return true;
  const route = tabs.routes.find((r) => r.name === tab);
  if (!route?.state) return true;
  return route.state.routes.length <= 1;
}
