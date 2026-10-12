import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading history"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-4 w-4" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </section>
  );
}
