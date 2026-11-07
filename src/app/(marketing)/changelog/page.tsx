import {
  publicReleaseNotes,
  toReleaseNoteView,
} from "@/lib/release-notes/catalog";
import { ReleaseNote } from "@/components/release-notes/release-note";
import { publicPageMetadata } from "@/lib/marketing/site";

export const metadata = publicPageMetadata({
  path: "/changelog",
  title: "Changelog · Overload",
  description:
    "Overload's public release history, newest first. Every public release also appears in the app under What's New.",
});

/**
 * The public changelog (design doc Screen 4; spec RD-11, amended). It renders
 * the public subset of the ONE repository release-note catalog through the
 * same ReleaseNote component the What's New dialog and page use, so a public
 * entry is written once (audience: "public") and appears here and in What's
 * New with the same order and date. Pre-launch development milestones
 * (audience: "internal") stay in in-app What's New only, so the public history
 * begins at the real launch. It reads nothing about the visitor: visiting it
 * marks nothing seen. Each entry carries its permanent id as an anchor
 * (/changelog#<id>). An invalid catalog throws; CI blocks it.
 *
 * Until the first public launch entry exists this list is empty, and the page
 * shows a tasteful pre-launch state rather than internal development history.
 */
export default function ChangelogPage() {
  const entries = publicReleaseNotes().map(toReleaseNoteView);
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 md:py-24">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-base text-muted-foreground">
          Overload&apos;s release history, newest first. Every release here also
          shows up in the app under What&apos;s New.
        </p>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-base font-medium">Overload is almost here.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            We&apos;re getting Overload ready for its public launch. When it
            goes live, every release will be listed here — starting with what
            you can do on day one.
          </p>
        </div>
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
