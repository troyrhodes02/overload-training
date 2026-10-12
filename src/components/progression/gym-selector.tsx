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
 * Gym scope selector for a gym-variable exercise's progression (design Screen 4;
 * spec §7, R13). Rendered only when ≥2 gyms have qualifying history. Switching
 * writes `?gym=` and re-renders the server progression region for that gym — no
 * cross-gym machine line is ever shown. Pure navigation; no data access.
 */
export function GymSelector({
  gyms,
  value,
}: {
  gyms: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(gymId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("gym", gymId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="w-[11rem]"
        aria-label="Gym for this trend"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {gyms.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
