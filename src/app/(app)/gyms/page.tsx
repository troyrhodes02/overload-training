import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatedToast } from "@/components/feedback/created-toast";
import { EmptyState } from "@/components/feedback/empty-state";
import { GymRowMenu } from "@/components/gyms/gym-row-menu";
import { listActiveGyms } from "@/lib/gyms/queries";

export const metadata = { title: "Gyms · Overload" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GymsPage({ searchParams }: PageProps) {
  const [{ created }, gyms] = await Promise.all([
    searchParams,
    listActiveGyms(),
  ]);

  return (
    <section className="space-y-4 pb-20 md:pb-0">
      <CreatedToast show={created === "1"} message="Gym added" />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Gyms</h1>
        <Button asChild variant="outline" className="hidden md:inline-flex">
          <Link href="/gyms/new">
            <Plus aria-hidden />
            Add gym
          </Link>
        </Button>
      </div>

      {gyms.length === 0 ? (
        <EmptyState
          title="No gyms yet. Add the gym you train at."
          action={
            <Button asChild variant="outline">
              <Link href="/gyms/new">Add gym</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {gyms.map((gym) => (
            <li
              key={gym.id}
              className="flex min-h-14 items-center gap-2 py-1 pr-1 pl-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{gym.name}</p>
                {/* Plain text only: never a map or an external link. */}
                {gym.address && (
                  <p className="truncate text-xs text-muted-foreground">
                    {gym.address}
                  </p>
                )}
              </div>
              <GymRowMenu gymId={gym.id} name={gym.name} />
            </li>
          ))}
        </ul>
      )}

      {/* Thumb-reach primary action on phones, above the bottom nav. */}
      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <Button asChild className="h-11 w-full">
          <Link href="/gyms/new">
            <Plus aria-hidden />
            Add gym
          </Link>
        </Button>
      </div>
    </section>
  );
}
