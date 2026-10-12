import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading workout detail"
    >
      <div className="space-y-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </section>
  );
}
