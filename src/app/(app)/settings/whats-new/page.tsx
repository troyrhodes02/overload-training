import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  orderedReleaseNotes,
  toReleaseNoteView,
} from "@/lib/release-notes/catalog";
import { ReleaseNote } from "@/components/release-notes/release-note";

export const metadata = { title: "What's New · Overload" };

/**
 * The What's New page (design doc Screen 4, preview §04–§05; spec R19): every
 * release-note entry, significant and ordinary, newest first. Read-only, and
 * it reads nothing from the account — visiting it changes nothing about the
 * dialog. Behind the (app) layout's auth gate like every Settings page. An
 * invalid catalog throws to the error boundary (R23); CI blocks one first.
 */
export default function WhatsNewPage() {
  const entries = orderedReleaseNotes().map(toReleaseNoteView);
  return (
    <section className="space-y-6 pb-20 md:pb-0">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Settings
      </Link>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">What&apos;s New</h1>
        <p className="text-sm text-muted-foreground">
          Every update to Overload, newest first.
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
            <li key={entry.id} className="py-5">
              <ReleaseNote entry={entry} headingLevel={2} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
