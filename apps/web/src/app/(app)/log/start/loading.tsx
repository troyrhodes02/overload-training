import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-4"
      aria-busy="true"
      aria-label="Loading gym selection"
    >
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </section>
  );
}
