import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading goal history"
    >
      <Skeleton className="h-6 w-20" />
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-1.5 w-full" />
            </div>
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}
