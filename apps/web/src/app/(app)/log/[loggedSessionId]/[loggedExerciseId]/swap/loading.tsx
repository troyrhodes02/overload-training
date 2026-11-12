import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-3"
      aria-busy="true"
      aria-label="Loading swap options"
    >
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-11 w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </section>
  );
}
