import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Loading gyms">
      <Skeleton className="h-6 w-20" />
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2 px-4 py-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </section>
  );
}
