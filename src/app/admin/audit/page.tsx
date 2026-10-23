import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { requireAdmin } from "@/lib/data/admin/identity";
import { listAudit } from "@/lib/data/admin/audit-read";
import { AuditLog } from "@/components/admin/audit-list";
import { Button } from "@/components/ui/button";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The audit log (Admin Center & Feedback design doc Screen 9; spec R6):
 * every admin action, newest first, optionally for one account. Read-only;
 * reading it is not itself an action and is not recorded.
 */
export default async function AdminAuditPage({ searchParams }: PageProps) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  const data = await listAudit(actor, { account: sp.account, page: sp.page });
  const base = data.account ? `account=${data.account.id}&` : "";

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every admin action, newest first. Nothing here can be edited.
        </p>
      </header>

      {data.account ? (
        <Link
          href="/admin/audit"
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
        >
          For {data.account.label ?? "Deleted account"}
          <X aria-label="Clear the account filter" className="size-4" />
        </Link>
      ) : null}

      {data.lines.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-sm">
          No admin actions yet.
        </p>
      ) : (
        <AuditLog lines={data.lines} timeZone={actor.timeZone} />
      )}

      {data.page > 1 || data.hasOlder ? (
        <div className="flex justify-end gap-2">
          {data.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/audit?${base}page=${data.page - 1}`}>
                <ChevronLeft aria-hidden className="size-4" /> Newer
              </Link>
            </Button>
          ) : null}
          {data.hasOlder ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/audit?${base}page=${data.page + 1}`}>
                Older <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
