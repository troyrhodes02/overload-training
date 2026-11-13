import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading workout"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-10" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 flex-1 rounded-md" />
      </div>
    </section>
  );
}
