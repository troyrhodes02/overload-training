"use client";

import { startTransition, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { updateAppearanceAction } from "@/app/(app)/settings/actions";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { applyAppearance } from "@/lib/appearance/apply";
import { isAppearance, type Appearance } from "@/lib/appearance/appearance";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Appearance; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const SPOKEN: Record<Appearance, string> = {
  light: "Appearance: Light.",
  dark: "Appearance: Dark.",
  system: "Appearance: System.",
};

/**
 * Settings → Appearance (Personalization & Navigation Polish, design doc
 * Screen 2). Choosing a tile is the commit: the whole app switches at once,
 * then the choice is saved to the account in the background. The last choice
 * wins — a slower response for an earlier tap never overrides it — and a
 * failed save puts the screen and the tile back to the last saved value with
 * an inline error. No Save button, no toast.
 */
export function AppearanceSetting({ initial }: { initial: Appearance }) {
  const [selected, setSelected] = useState<Appearance>(initial);
  const [failed, setFailed] = useState(false);
  const [spoken, setSpoken] = useState("");
  const confirmed = useRef<Appearance>(initial);
  const latest = useRef(0);

  function choose(value: string) {
    if (!isAppearance(value)) return;
    const seq = ++latest.current;
    setSelected(value);
    setFailed(false);
    applyAppearance(value);
    startTransition(async () => {
      const result = await updateAppearanceAction(value);
      if (seq !== latest.current) return; // a newer choice is in flight
      if (result.ok) {
        confirmed.current = value;
        setSpoken(SPOKEN[value]);
      } else {
        setSelected(confirmed.current);
        applyAppearance(confirmed.current);
        setFailed(true);
      }
    });
  }

  return (
    <section aria-labelledby="appearance-heading" className="space-y-3">
      <h2 id="appearance-heading" className="text-base font-semibold">
        Appearance
      </h2>
      <RadioGroup
        value={selected}
        onValueChange={choose}
        aria-labelledby="appearance-heading"
        className="grid grid-cols-3 gap-2"
      >
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const on = selected === value;
          return (
            <Label
              key={value}
              className={cn(
                "relative flex min-h-16 cursor-pointer flex-col items-start gap-2 rounded-lg border bg-card p-3 leading-5 font-normal",
                "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                on ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <RadioGroupItem value={value} className="sr-only" />
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              <span className={cn("text-sm", on && "font-medium")}>
                {label}
              </span>
              {value === "system" ? (
                <span className="-mt-1.5 hidden text-xs text-muted-foreground min-[360px]:block">
                  Follows your device
                </span>
              ) : null}
              {on ? (
                <Check
                  aria-hidden
                  className="absolute top-2.5 right-2.5 size-4 text-primary"
                />
              ) : null}
            </Label>
          );
        })}
      </RadioGroup>
      <p className="text-sm text-muted-foreground">
        System follows your device&apos;s light or dark setting.
      </p>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t save your appearance. Try again.
        </p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {spoken}
      </p>
    </section>
  );
}
