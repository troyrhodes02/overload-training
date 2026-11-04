import {
  orderedReleaseNotes,
  toReleaseNoteView,
} from "@/lib/release-notes/catalog";
import { ReleaseNote } from "@/components/release-notes/release-note";
import { publicPageMetadata } from "@/lib/marketing/site";

export const metadata = publicPageMetadata({
  path: "/changelog",
  title: "Changelog · Overload",
  description:
    "Every update to Overload, newest first: the same notes lifters see in the app under What's New.",
});

/**
 * The public changelog (design doc Screen 4; spec RD-11). It renders the ONE
 * repository release-note catalog through the same ReleaseNote component the
 * What's New dialog and page use, so an entry is written once and appears in
 * both places with the same order and date. It reads nothing about the
 * visitor: visiting it marks nothing seen. Each entry carries its permanent id
 * as an anchor (/changelog#<id>). An invalid catalog throws; CI blocks it.
 */
export default function ChangelogPage() {
  const entries = orderedReleaseNotes().map(toReleaseNoteView);
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 md:py-24">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-base text-muted-foreground">
          Every update to Overload, newest first. Lifters see the same notes in
          the app under What&apos;s New.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="border-t border-border pt-5 text-sm text-muted-foreground">
          No updates yet. When something changes in Overload, it&apos;s listed
          here.
        </p>
      ) : (
        <ol className="divide-y divide-border border-t border-border">
          {entries.map((entry) => (
            <li key={entry.id} id={entry.id} className="scroll-mt-20 py-5">
              <ReleaseNote entry={entry} headingLevel={2} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
