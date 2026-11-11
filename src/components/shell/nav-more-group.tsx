"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MORE_NAV_LABEL } from "./nav-items";

/** Per-browser convenience only (never account state): the group's last state. */
const STORAGE_KEY = "ovl.nav.more-open";

function readStored(): boolean | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? null : v === "1";
  } catch {
    return null;
  }
}

function writeStored(open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Storage unavailable (private mode, blocked): the group still works.
  }
}

/**
 * The collapsible "Account & app" group (OVE-119), below the divider in the
 * sidebar and the phone sheet. Open by default; the lifter's last choice is
 * remembered in this browser. It always opens when the current page is one
 * of its destinations, so the active item is never hidden. Opening and
 * closing animate smoothly (height, fade, and the chevron together); a page
 * load and reduced-motion settings never animate.
 */
export function NavMoreGroup({
  containsCurrent,
  children,
}: {
  containsCurrent: boolean;
  children: ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(true);
  // Transitions switch on only after the remembered state is applied, so a
  // page load never animates the group open or shut — only a click does.
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const stored = readStored();
    // Reading browser storage after mount keeps the server render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== null) setOpen(stored);
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const shown = open || containsCurrent;

  return (
    <div>
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={listId}
        onClick={() => {
          const next = !shown;
          setOpen(next);
          writeStored(next);
        }}
        className="flex min-h-9 w-full items-center justify-between rounded-md px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {MORE_NAV_LABEL}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4",
            animate &&
              "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            !shown && "-rotate-90",
          )}
        />
      </button>
      {/* Smooth height: a one-row grid animates between 1fr and 0fr, while
          the list fades and settles into place. Collapsed, the links are
          inert (not focusable, hidden from assistive tech). */}
      <div
        id={listId}
        inert={!shown}
        aria-hidden={!shown}
        className={cn(
          "grid",
          animate &&
            "transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              animate &&
                "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              shown ? "translate-y-0" : "-translate-y-1",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
