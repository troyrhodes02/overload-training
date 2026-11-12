import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-11 w-full" />
    </section>
  );
}
