import { requireAdmin } from "@/lib/data/admin/identity";
import { listAccounts, parseDirectoryQuery } from "@/lib/data/admin/accounts";
import { todayIso } from "@/lib/plan/calendar";
import { AccountDirectory } from "@/components/admin/account-directory";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The account directory (Admin Center & Feedback design doc Screen 4; spec
 * §10.1). Search, status, and page are URL state; anything unrecognized
 * falls back to the defaults.
 */
export default async function AdminAccountsPage({ searchParams }: PageProps) {
  const actor = await requireAdmin();
  const query = parseDirectoryQuery(await searchParams);
  const data = await listAccounts(actor, query);
  return (
    <AccountDirectory
      data={data}
      q={query.q}
      status={query.status}
      today={todayIso(actor.timeZone)}
    />
  );
}
