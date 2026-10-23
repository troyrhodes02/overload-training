import { Skeleton } from "@/components/ui/skeleton";

/**
 * Admin loading states (design doc Screens 3–9): skeletons the shape of the
 * final content, so nothing shifts when the numbers arrive.
 */

export function OverviewSkeleton() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="space-y-2 rounded-lg border border-border bg-card p-4"
          >
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </section>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-11 w-full" />
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2 px-3 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function DetailSkeleton() {
  return (
    <section
      className="max-w-2xl space-y-4"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </section>
  );
}
