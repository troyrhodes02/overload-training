"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Which gym's record book a machine or cable exercise's history shows
 * (Exercise History & PR Intelligence design doc Screen 2; spec §7.2, R5).
 * Rendered only when the exercise has history at two or more scopes.
 * Switching replaces `?gym=` (keeping any other param, e.g. `sessions`) and
 * re-renders the whole page on the server for that gym — no figure from two
 * gyms is ever shown together. Pure navigation; no data access.
 */
export function GymSelector({
  options,
  value,
}: {
  options: { value: string; label: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("gym", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="w-[12rem]"
        aria-label="Gym for this history"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
