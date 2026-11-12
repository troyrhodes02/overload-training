import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6">
      {/* Today's heading: the greeting line, then the date line. */}
      <div>
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="mt-1 h-4 w-36" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </section>
  );
}
