import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CustomExerciseForm } from "@/components/exercises/custom-exercise-form";
import { EXERCISE_NAME_MAX } from "@/lib/exercises/validation";

export const metadata = { title: "Add custom exercise · Overload" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewCustomExercisePage({
  searchParams,
}: PageProps) {
  const { name } = await searchParams;
  const defaultName = (Array.isArray(name) ? name[0] : (name ?? ""))
    .trim()
    .slice(0, EXERCISE_NAME_MAX);

  return (
    <section className="space-y-6">
      <Link
        href="/exercises"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Exercises
      </Link>
      <h1 className="text-lg font-semibold">Add custom exercise</h1>
      <CustomExerciseForm defaultName={defaultName} />
    </section>
  );
}
