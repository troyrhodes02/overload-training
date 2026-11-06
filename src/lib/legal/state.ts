import { OWNER_FACTS } from "./facts";
import { PRIVACY_POLICY } from "./privacy";
import { TERMS_OF_SERVICE } from "./terms";
import type {
  Block,
  LegalDoc,
  LegalKind,
  LegalPageState,
  OwnerFactKey,
  OwnerFacts,
  Segment,
} from "./types";

/**
 * The legal publication gate (spec §5, §12; RD-12). Pure.
 *
 *   published      status "published" + approval recorded + every fact set
 *   finalizing     otherwise, on the production deployment
 *   draft-preview  otherwise (local, preview, test): the draft, labelled
 *
 * A document marked published with a missing fact or no approval is a BUILD
 * error (validatePublished, run at module load and in CI) — never a page with
 * a hole in it.
 */

export class LegalPublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegalPublicationError";
  }
}

function segmentsOf(block: Block): Segment[] {
  if (block.kind === "h2") return [block.text];
  if (block.kind === "p") return block.content;
  return block.items.flat();
}

/** The owner facts a document uses, in order of first appearance. */
export function factsUsed(doc: LegalDoc): OwnerFactKey[] {
  const seen: OwnerFactKey[] = [];
  for (const block of doc.blocks) {
    for (const s of segmentsOf(block)) {
      if (typeof s === "object" && "fact" in s && !seen.includes(s.fact)) {
        seen.push(s.fact);
      }
    }
  }
  return seen;
}

export function unresolvedFacts(
  doc: LegalDoc,
  facts: OwnerFacts = OWNER_FACTS,
): OwnerFactKey[] {
  return factsUsed(doc).filter((k) => !facts[k]?.trim());
}

/** Throws unless a document marked published is genuinely publishable. */
export function validatePublished(
  doc: LegalDoc,
  facts: OwnerFacts = OWNER_FACTS,
): void {
  if (doc.status !== "published") return;
  const missing = unresolvedFacts(doc, facts);
  if (missing.length > 0) {
    throw new LegalPublicationError(
      `${doc.title} is marked published but the owner has not supplied: ${missing.join(", ")}.`,
    );
  }
  if (!doc.approval?.approvedBy.trim() || !doc.approval.approvedOn.trim()) {
    throw new LegalPublicationError(
      `${doc.title} is marked published without an approval record.`,
    );
  }
}

export function isPublished(
  doc: LegalDoc,
  facts: OwnerFacts = OWNER_FACTS,
): boolean {
  return (
    doc.status === "published" &&
    doc.approval !== null &&
    unresolvedFacts(doc, facts).length === 0
  );
}

export function legalPageState(
  doc: LegalDoc,
  production: boolean,
  facts: OwnerFacts = OWNER_FACTS,
): LegalPageState {
  if (isPublished(doc, facts)) return "published";
  return production ? "finalizing" : "draft-preview";
}

export const LEGAL_DOCS: Record<LegalKind, LegalDoc> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE,
};

/** Legal paths that may be indexed and listed in the sitemap. */
export function publishedLegalPaths(facts: OwnerFacts = OWNER_FACTS): string[] {
  return (Object.keys(LEGAL_DOCS) as LegalKind[])
    .filter((k) => isPublished(LEGAL_DOCS[k], facts))
    .map((k) => `/${k}`);
}

// Fail the build, not the page, if a document is marked published early.
for (const doc of Object.values(LEGAL_DOCS)) validatePublished(doc);
