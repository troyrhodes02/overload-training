"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { RIR_VALUES, formatRir, rirAccessibleName } from "@/lib/logging/rir";

/**
 * The optional reps-in-reserve choice (RIR Logging & Autoregulation design
 * Screens 1–3, preview §01–§04, §08; spec §7, R22–R24).
 *
 * Five outline chips `0 1 2 3 4+`, nothing selected by default; tapping the
 * selected chip clears it. `null` means "not recorded" and is never 0. It is a
 * single-select Radix toggle group: one tab stop, arrow keys move within it.
 * The selected chip is a neutral fill, never the accent. A chip never takes
 * focus from a pointer press, so the phone keyboard stays up in the reps field
 * (Faster Logging UX R13). Client island; it only reports the value.
 *
 * Below 360px the "RIR" label sits above the chips and the chips share the
 * row, so each stays a 44px target without the row overflowing (R30).
 */
export function RirPicker({
  value,
  onChange,
  label,
  labelledBy,
  showLabel = true,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Accessible group name, e.g. "Set 2 RIR (reps in reserve, optional)". */
  label: string;
  /** Id of a visible label to name the group by instead (the dialog's). */
  labelledBy?: string;
  /** The muted "RIR" prefix on the card; the dialog uses its own label. */
  showLabel?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {showLabel ? (
        <span
          aria-hidden
          className="mr-1 text-xs text-muted-foreground max-[359px]:basis-full"
        >
          RIR
        </span>
      ) : null}
      <ToggleGroupPrimitive.Root
        type="single"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        value={value === null ? "" : String(value)}
        onValueChange={(v) => onChange(v === "" ? null : Number(v))}
        disabled={disabled}
        className="flex items-center gap-1.5 max-[359px]:w-full max-[359px]:gap-1"
      >
        {RIR_VALUES.map((r) => (
          <ToggleGroupPrimitive.Item
            key={r}
            value={String(r)}
            aria-label={rirAccessibleName(r)}
            // Keep focus (and the phone keyboard) where the lifter is typing.
            onPointerDown={(e) => e.preventDefault()}
            className={cn(
              toggleVariants({ variant: "outline" }),
              "h-11 min-w-11 px-2 tabular-nums text-muted-foreground shadow-none max-[359px]:min-w-0 max-[359px]:flex-1",
              "data-[state=on]:border-foreground/60 data-[state=on]:bg-accent data-[state=on]:text-foreground",
            )}
          >
            {formatRir(r)}
          </ToggleGroupPrimitive.Item>
        ))}
      </ToggleGroupPrimitive.Root>
    </div>
  );
}
