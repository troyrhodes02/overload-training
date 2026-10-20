import {
  formatReleaseDate,
  type ReleaseNoteView,
} from "@/lib/release-notes/catalog";

/**
 * One release-note entry (What's New design doc §10, preview §06): date,
 * title, and one to three plain sentences. Presentational only — no hooks, no
 * data access, nothing about the reader — so the dialog, the What's New page,
 * and a future public changelog all render entries with this one component
 * (spec R21). The heading level follows where it sits: h3 in the dialog, h2
 * on the page.
 */
export function ReleaseNote({
  entry,
  headingLevel,
}: {
  entry: ReleaseNoteView;
  headingLevel: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="flex flex-col gap-1">
      <time
        dateTime={entry.date}
        className="text-xs font-medium text-muted-foreground tabular-nums"
      >
        {formatReleaseDate(entry.date)}
      </time>
      <Heading className="text-base font-semibold">{entry.title}</Heading>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {entry.body}
      </p>
    </article>
  );
}
