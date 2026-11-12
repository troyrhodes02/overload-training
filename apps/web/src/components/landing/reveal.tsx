"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A one-time entrance reveal: the wrapped content fades and lifts into place the
 * first time it scrolls into view, then stays. No replay on scroll-past, no
 * dependency — a single Intersection Observer and a CSS transition.
 *
 * `prefers-reduced-motion` is honored: reduced-motion visitors get the content
 * immediately with no transform, and the page is fully usable before any
 * animation. Stagger a group by passing a Tailwind `delay-*` class.
 */
export function Reveal({
  children,
  className,
  delayClass,
}: {
  children: ReactNode;
  className?: string;
  /** e.g. "delay-100" to stagger within a group. */
  delayClass?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion is handled in CSS (motion-reduce:* below), so the effect
    // only ever sets state from the observer callback — never synchronously.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={cn(
        "transition duration-700 ease-out will-change-transform",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none motion-reduce:duration-0",
        shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        delayClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
