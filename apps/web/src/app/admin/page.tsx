import { requireAdmin } from "@/lib/data/admin/identity";
import { getAdminOverview } from "@/lib/data/admin/metrics";
import { CohortTable, OverviewTiles } from "@/components/admin/overview";

/**
 * Overview (Admin Center & Feedback design doc Screen 3; spec §9): six counts
 * and six months of signup cohorts, computed on this load. Nothing here shows
 * anyone's training.
 */
export default async function AdminOverviewPage() {
  const actor = await requireAdmin();
  const data = await getAdminOverview(actor);
  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Counts across every account. Nothing here shows anyone&apos;s
          training.
        </p>
      </header>
      <OverviewTiles data={data} />
      <CohortTable data={data} />
    </section>
  );
}
