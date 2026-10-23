import Link from "next/link";
import type { AuditLineDto } from "@/lib/admin/types";
import { auditActionText } from "@/lib/admin/types";
import { instantLabel } from "@/lib/admin/format";

/**
 * Audit lines (Admin Center & Feedback design doc Screen 9). `compact` is the
 * account page's and feedback item's short history ("Oct 21 · 2:14 PM —
 * Suspended the account · by William Rhodes"); the full log reads "William
 * Rhodes suspended the account · Maya Chen" as a list on a phone and a table
 * from md. Read-only: there is no control that edits or removes a line.
 */

function AccountLink({ line }: { line: AuditLineDto }) {
  if (!line.target.label) {
    return <span className="text-muted-foreground">Deleted account</span>;
  }
  return (
    <Link
      href={`/admin/accounts/${line.target.id}`}
      className="text-primary underline-offset-4 hover:underline"
    >
      {line.target.label}
    </Link>
  );
}

function FeedbackLink({ line }: { line: AuditLineDto }) {
  // A deleted sender's feedback was deleted with the account; the audit
  // line keeps the id, but there is nothing left to link to.
  if (!line.feedbackId || !line.target.label) return null;
  return (
    <>
      {" · "}
      <Link
        href={`/admin/feedback/${line.feedbackId}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        View feedback
      </Link>
    </>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CompactAuditList({
  lines,
  timeZone,
  empty = "No admin actions yet.",
}: {
  lines: AuditLineDto[];
  timeZone: string;
  empty?: string;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {lines.map((l) => (
        <li
          key={l.id}
          className="grid grid-cols-[8.5rem_1fr] gap-2 py-2 text-sm"
        >
          <span className="text-muted-foreground tabular-nums">
            {instantLabel(l.at, timeZone, false)}
          </span>
          <span>
            {capitalize(auditActionText(l))} · by {l.actorName}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AuditLog({
  lines,
  timeZone,
}: {
  lines: AuditLineDto[];
  timeZone: string;
}) {
  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
        {lines.map((l) => (
          <li key={l.id} className="space-y-1 px-3 py-3 text-sm">
            <div className="text-xs text-muted-foreground tabular-nums">
              {instantLabel(l.at, timeZone)}
            </div>
            <p>
              {l.actorName} {auditActionText(l)} · <AccountLink line={l} />
              <FeedbackLink line={l} />
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Audit log</caption>
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              {["When", "Admin", "Action", "Account"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  {instantLabel(l.at, timeZone)}
                </td>
                <td className="px-3 py-2.5">{l.actorName}</td>
                <td className="px-3 py-2.5">
                  {auditActionText(l)}
                  <FeedbackLink line={l} />
                </td>
                <td className="px-3 py-2.5">
                  <AccountLink line={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
