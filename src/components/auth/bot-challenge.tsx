"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The bot-challenge widget (Public Accounts, design Screen 7; D3). A thin
 * wrapper around Cloudflare Turnstile, mounted just above the primary button on
 * signup and (in PA4) forgot-password. It only produces a token; the server
 * verifies it (verifyChallenge) before any account work.
 *
 * States:
 *   - loading     — the script/widget is still coming up; button stays disabled
 *   - passed      — a quiet "Verified"; the token is written to the hidden field
 *   - failed      — the token expired or was refused; the widget resets quietly
 *                   (the host form surfaces the message); button re-enabled so
 *                   the lifter can retry, and the server rejects without a token
 *   - unavailable — no site key, or the script could not load; the button stays
 *                   disabled (D3) — a skip-on-failure path would defeat the
 *                   protection, and the server would reject a tokenless submit
 *                   anyway
 *
 * Self-contained and SSR-safe: nothing runs until the client effect mounts.
 * Theme follows the resolved appearance (the `dark`/`light` class the shell
 * puts on <html>); otherwise Turnstile's own `auto` tracks prefers-color-scheme.
 */

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

type Status = "loading" | "passed" | "failed" | "unavailable";

/** The minimal slice of the Turnstile JS API this wrapper calls. */
type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      theme: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("load")), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

function resolvedTheme(): "light" | "dark" | "auto" {
  if (typeof document === "undefined") return "auto";
  const root = document.documentElement.classList;
  if (root.contains("dark")) return "dark";
  if (root.contains("light")) return "light";
  return "auto";
}

export function BotChallenge({
  siteKey,
  fieldName = "challengeToken",
  onReadyChange,
}: {
  /** Public Turnstile site key; null disables the widget (button stays off). */
  siteKey: string | null;
  /** Name of the hidden input that carries the token into the form. */
  fieldName?: string;
  /** Reports whether a valid token is present (the host enables its button). */
  onReadyChange?: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>(
    siteKey ? "loading" : "unavailable",
  );
  const [token, setToken] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const describedById = useId();

  const ready = status === "passed" && token.length > 0;
  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  useEffect(() => {
    // No key → the widget is unavailable; the initial state already reflects
    // that, so there is nothing to mount or tear down.
    if (!siteKey) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled) return;
        const api = window.turnstile;
        const el = containerRef.current;
        if (!api || !el) {
          setStatus("unavailable");
          return;
        }
        widgetIdRef.current = api.render(el, {
          sitekey: siteKey,
          theme: resolvedTheme(),
          callback: (t) => {
            if (cancelled) return;
            setToken(t);
            setStatus("passed");
          },
          "error-callback": () => {
            if (cancelled) return;
            setToken("");
            setStatus("failed");
          },
          "expired-callback": () => {
            if (cancelled) return;
            setToken("");
            setStatus("failed");
            if (widgetIdRef.current) api.reset(widgetIdRef.current);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });

    return () => {
      cancelled = true;
      const api = window.turnstile;
      if (api && widgetIdRef.current) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // The widget may already be gone after navigation; nothing to clean.
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  const base =
    "flex min-h-[64px] w-full items-center gap-2 rounded-md border px-3 py-2 text-sm";

  return (
    <div className="space-y-2">
      <input type="hidden" name={fieldName} value={token} readOnly />

      {/* Cloudflare renders its own widget into this node when verifying. */}
      <div
        ref={containerRef}
        className={cn(
          "w-full",
          status === "passed" || status === "unavailable" ? "hidden" : "",
        )}
        aria-hidden={status === "passed" || status === "unavailable"}
      />

      {status === "loading" ? (
        <div
          className={cn(
            base,
            "border-border bg-muted/30 text-muted-foreground",
          )}
          role="status"
        >
          <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
          <span>Verifying…</span>
        </div>
      ) : null}

      {status === "passed" ? (
        <div
          className={cn(base, "border-border bg-card text-foreground")}
          role="status"
        >
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Check aria-hidden className="size-3.5" />
          </span>
          <span className="text-muted-foreground">Verified</span>
          <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground/70">
            human check
          </span>
        </div>
      ) : null}

      {status === "unavailable" ? (
        <div
          id={describedById}
          className={cn(
            base,
            "border-border bg-muted/30 text-muted-foreground",
          )}
          role="status"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          <span>
            Couldn&apos;t load the human check. Check your connection and
            refresh.
          </span>
        </div>
      ) : null}
    </div>
  );
}
