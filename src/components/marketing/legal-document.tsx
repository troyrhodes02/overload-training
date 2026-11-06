import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FACT_LABELS } from "@/lib/legal/facts";
import type {
  Block,
  LegalDoc,
  LegalPageState,
  OwnerFacts,
  Segment,
} from "@/lib/legal/types";

/**
 * A legal page in one of its three states (design doc Screens 5–6; spec §5,
 * RD-12):
 *  - published: the clean document, owner facts filled in;
 *  - draft-preview (never production): the draft under a "not in effect"
 *    alert, each missing owner fact shown as a highlighted marker;
 *  - finalizing (production until approved): a short page whose every
 *    sentence is true today — no draft text is shown.
 * Never shows bracketed reviewer notes.
 */

function renderSegment(
  s: Segment,
  facts: OwnerFacts,
  supportEmail: string,
  key: number,
): ReactNode {
  if (typeof s === "string") return s;
  if ("support" in s) {
    return (
      <a
        key={key}
        href={`mailto:${supportEmail}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        {supportEmail}
      </a>
    );
  }
  const value = facts[s.fact]?.trim();
  if (value) return value;
  return (
    <mark
      key={key}
      className="rounded bg-primary/10 px-1 text-foreground"
      data-owner-fact={s.fact}
    >
      ‹{FACT_LABELS[s.fact]}›
    </mark>
  );
}

function renderBlock(
  block: Block,
  facts: OwnerFacts,
  supportEmail: string,
  i: number,
) {
  const seg = (segments: Segment[]) =>
    segments.map((s, j) => renderSegment(s, facts, supportEmail, j));
  if (block.kind === "h2") {
    return (
      <h2 key={i} className="pt-4 text-xl font-semibold text-foreground">
        {block.text}
      </h2>
    );
  }
  if (block.kind === "ul") {
    return (
      <ul key={i} className="list-disc space-y-2 pl-5">
        {block.items.map((item, j) => (
          <li key={j}>{seg(item)}</li>
        ))}
      </ul>
    );
  }
  return <p key={i}>{seg(block.content)}</p>;
}

export function LegalDocumentView({
  doc,
  state,
  facts,
  supportEmail,
}: {
  doc: LegalDoc;
  state: LegalPageState;
  facts: OwnerFacts;
  supportEmail: string;
}) {
  if (state === "finalizing") {
    const what =
      doc.kind === "privacy" ? "privacy policy is" : "terms of service are";
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-16 md:py-24">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Our {what} being finalized and will be published at this address.
        </p>
        <p className="text-base leading-relaxed text-muted-foreground">
          Until then, questions
          {doc.kind === "privacy" ? " about your data" : ""} go to{" "}
          <a
            href={`mailto:${supportEmail}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {supportEmail}
          </a>
          .
          {doc.kind === "privacy"
            ? " You can export or delete your account from Settings at any time."
            : ""}
        </p>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-16 md:py-24">
      {state === "draft-preview" ? (
        <Alert>
          <AlertTitle>Draft for owner review — not in effect</AlertTitle>
          <AlertDescription>
            Highlighted items are facts the owner must supply. This draft is
            shown only outside production and is not legal approval.
          </AlertDescription>
        </Alert>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
      <div className="space-y-5 text-base leading-relaxed text-muted-foreground">
        {doc.blocks.map((b, i) => renderBlock(b, facts, supportEmail, i))}
      </div>
    </article>
  );
}
