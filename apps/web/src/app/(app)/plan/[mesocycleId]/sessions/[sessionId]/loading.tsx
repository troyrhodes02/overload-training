import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading session"
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="space-y-1">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    </section>
  );
}
