import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { GymForm } from "@/components/gyms/gym-form";

export const metadata = { title: "Add gym · Overload" };

export default function NewGymPage() {
  return (
    <section className="space-y-6">
      <Link
        href="/gyms"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Gyms
      </Link>
      <h1 className="text-lg font-semibold">Add gym</h1>
      <GymForm />
    </section>
  );
}
