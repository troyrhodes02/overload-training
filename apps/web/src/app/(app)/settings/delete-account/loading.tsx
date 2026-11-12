import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading account deletion"
    >
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-7 w-52" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-11 w-full" />
    </section>
  );
}
