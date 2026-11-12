import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading plan">
      <Skeleton className="h-6 w-16" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </section>
  );
}
