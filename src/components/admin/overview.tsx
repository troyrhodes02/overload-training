import type { AdminOverviewDto } from "@/lib/admin/types";
import { fullDate, monthLabel, percentOf } from "@/lib/admin/format";

/**
 * The Overview's counts and cohort table (Admin Center & Feedback design doc
 * Screen 3; preview "3 · Overview"). Numbers only: tiles are not links, so a
 * count can never become a list of one account's training facts.
 */

function MetricTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      <dt className="mt-1 text-sm font-medium">{label}</dt>
      <p className="text-xs text-muted-foreground tabular-nums">{caption}</p>
    </div>
  );
}

const ofRegistered = (p: number | null) =>
  p === null ? "—" : `${p}% of registered`;

export function OverviewTiles({ data }: { data: AdminOverviewDto }) {
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <MetricTile
        label="Registered accounts"
        value={data.registered}
        caption={
          data.suspended > 0 ? `${data.suspended} suspended` : "All active"
        }
      />
      <MetricTile
        label="Active, last 7 days"
        value={data.active7}
        caption={ofRegistered(data.pct.active7)}
      />
      <MetricTile
        label="Active, last 30 days"
        value={data.active30}
        caption={ofRegistered(data.pct.active30)}
      />
      <MetricTile
        label="New this month"
        value={data.newThisMonth}
        caption={`since ${fullDate(data.monthStart).replace(/, \d{4}$/, "")}`}
      />
      <MetricTile
        label="Created a plan"
        value={data.withPlan}
        caption={ofRegistered(data.pct.withPlan)}
      />
      <MetricTile
        label="Logged a workout"
        value={data.loggedWorkout}
        caption={ofRegistered(data.pct.loggedWorkout)}
      />
    </dl>
  );
}

export function CohortTable({ data }: { data: AdminOverviewDto }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Signup cohorts</h2>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Signup cohorts by month, last six months
          </caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">
                Month
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Signed up
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Came back
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                <span className="md:hidden">30 d</span>
                <span className="hidden md:inline">Active, 30 days</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((c) => (
              <tr
                key={c.month}
                className="border-b border-border last:border-0"
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {monthLabel(c.month)}
                </th>
                {c.signedUp === 0 ? (
                  <>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      —
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      —
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      —
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right">{c.signedUp}</td>
                    <td className="px-3 py-2 text-right">
                      {c.cameBack}{" "}
                      <span className="text-muted-foreground">
                        {percentOf(c.cameBackPct)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {c.active30}{" "}
                      <span className="text-muted-foreground">
                        {percentOf(c.active30Pct)}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Came back: active on a later day than the signup day. Active, 30 days:
        last active in the last 30 days. Last-active dates are kept as a date
        only, and only since this view shipped. Dates are in your time zone (
        {data.timeZone}).
      </p>
    </section>
  );
}
