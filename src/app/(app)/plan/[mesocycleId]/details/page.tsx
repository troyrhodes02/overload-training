import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/plan/plan-bits";
import { MesocycleForm } from "@/components/plan/mesocycle-form";
import { getMesocycleWeek } from "@/lib/plan/queries";
import { updateMesocycleDetailsAction } from "../../actions";

export const metadata = { title: "Edit details · Overload" };

type PageProps = { params: Promise<{ mesocycleId: string }> };

export default async function EditDetailsPage({ params }: PageProps) {
  const { mesocycleId } = await params;
  const m = await getMesocycleWeek(mesocycleId);
  if (!m) notFound();
  // Archived blocks are read-only; there is nothing to edit.
  if (m.status === "archived") redirect(`/plan/${m.id}`);

  return (
    <section className="space-y-6 pb-24 md:pb-0">
      <div className="space-y-1">
        <BackLink href={`/plan/${m.id}`} label={m.name} />
        <h1 className="text-lg font-semibold">Edit details</h1>
        <p className="text-sm text-muted-foreground">
          Started from {m.splitLabel}
        </p>
      </div>
      <MesocycleForm
        action={updateMesocycleDetailsAction.bind(null, m.id)}
        variant="details"
        submitLabel="Save"
        pendingLabel="Saving…"
        cancelHref={`/plan/${m.id}`}
        initial={{
          name: m.name,
          startDate: m.startDate ?? "",
          lengthWeeks: String(m.lengthWeeks),
          deloadWeek: String(m.deloadWeek),
          splitType: m.splitType,
        }}
      />
      {m.status === "draft" && (
        <p className="text-xs text-muted-foreground">
          A draft can be saved incomplete. It won&apos;t activate until the
          checklist on its week is clear.
        </p>
      )}
    </section>
  );
}
