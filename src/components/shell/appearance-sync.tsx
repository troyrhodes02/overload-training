"use client";

import { useLayoutEffect } from "react";
import { applyAppearance } from "@/lib/appearance/apply";
import type { Appearance } from "@/lib/appearance/appearance";
import { appearanceSaveInFlight } from "@/lib/appearance/choices";

/**
 * Keeps the document on the account's stored appearance (spec §7.3, R6). The
 * boot script paints from this device's mirror; this corrects a brand-new
 * device or one last used by another account as soon as the shell hydrates,
 * and re-applies after client navigations (e.g. from Login into the app) and
 * after a save re-renders the layout. Renders nothing.
 *
 * While a choice made in Settings is still saving it stands aside: an earlier
 * save's refresh() carries a superseded value, and the Settings island applies
 * the final outcome itself (review of #62).
 */
export function AppearanceSync({ appearance }: { appearance: Appearance }) {
  useLayoutEffect(() => {
    if (appearanceSaveInFlight()) return;
    applyAppearance(appearance);
  }, [appearance]);
  return null;
}
