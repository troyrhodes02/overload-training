import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6" aria-busy="true" aria-label="Loading goal">
      <Skeleton className="h-4 w-16" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-16" />
        </div>
        <Skeleton className="h-1.5 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-36" />
      </div>
    </section>
  );
}
