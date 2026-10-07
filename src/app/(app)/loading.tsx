import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-28 w-full rounded-lg" />
    </section>
  );
}
