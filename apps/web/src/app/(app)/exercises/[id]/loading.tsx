import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the exercise history (design doc §7 Screen 1), so nothing jumps. */
export default function Loading() {
  return (
    <section
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading exercise"
    >
      <Skeleton className="h-4 w-24" />
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div className="flex flex-col gap-8">
        <div className="space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-[180px] w-full md:h-[240px]" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
