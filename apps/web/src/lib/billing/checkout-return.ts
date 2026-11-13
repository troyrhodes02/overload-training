import type { CheckoutOutcome } from "@/lib/billing/checkout";

/**
 * Coming back from hosted Checkout without Stripe's redirect (OVE-112): the
 * browser's back button, or reopening the page. Stripe's success and cancel
 * redirects already carry `?status`; this covers every other way back.
 *
 * Before leaving for Stripe, the page notes the session id in sessionStorage
 * (this tab only). When the page is shown again, from the back/forward cache
 * or a fresh load, it reads the note once, asks the server where that session
 * stands, and either shows the existing "finishing up" state (Stripe took the
 * payment) or a quiet toast that nothing changed. Presentation only: paid Pro
 * still enters only through the verified webhook.
 *
 * Client-safe and pure apart from the Storage it is handed.
 */

export const CHECKOUT_PENDING_KEY = "overload.checkout.pending";

/** A note older than this is stale (the lifter went elsewhere long ago). */
export const CHECKOUT_PENDING_MAX_AGE_MS = 60 * 60 * 1000;

export const CHECKOUT_CANCELLED_MESSAGE =
  "Checkout cancelled. Your plan hasn't changed.";
export const CHECKOUT_CLOSED_MESSAGE = "Checkout closed. Your plan is below.";

type Note = { id: string; at: number };

export function notePendingCheckout(
  storage: Storage | null,
  sessionId: string,
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(
      CHECKOUT_PENDING_KEY,
      JSON.stringify({ id: sessionId, at: now } satisfies Note),
    );
  } catch {
    // Private mode or storage full: the page still resets, just without
    // knowing the session (it shows the neutral toast).
  }
}

/**
 * Read AND clear the note, so a return is handled exactly once. Returns the
 * session id, or null when there is none or it is stale or malformed.
 */
export function takePendingCheckout(
  storage: Storage | null,
  now: number = Date.now(),
): string | null {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(CHECKOUT_PENDING_KEY) ?? null;
    storage?.removeItem(CHECKOUT_PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const note = JSON.parse(raw) as Partial<Note>;
    if (typeof note.id !== "string" || typeof note.at !== "number") {
      return null;
    }
    if (now - note.at > CHECKOUT_PENDING_MAX_AGE_MS || note.at > now + 60_000) {
      return null;
    }
    return note.id;
  } catch {
    return null;
  }
}

export type CheckoutReturn =
  { kind: "confirming" } | { kind: "toast"; message: string };

/**
 * What the screen does for a Checkout the lifter left. `null` means the
 * outcome couldn't be read (no note, a failed check).
 */
export function checkoutReturn(
  outcome: CheckoutOutcome | null,
): CheckoutReturn {
  if (outcome === "complete") return { kind: "confirming" };
  if (outcome === "open" || outcome === "expired") {
    return { kind: "toast", message: CHECKOUT_CANCELLED_MESSAGE };
  }
  return { kind: "toast", message: CHECKOUT_CLOSED_MESSAGE };
}
