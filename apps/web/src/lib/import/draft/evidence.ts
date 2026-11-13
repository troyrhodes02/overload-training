import type { EvidenceRef } from "./types";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — quote-to-source
 * verification (blueprint §3.5, spec §14.6). A model may cite a quote that is
 * not actually in the source it points at; every such claim must be flagged
 * (`EVIDENCE_NOT_FOUND`) rather than silently trusted.
 *
 * Verification is deliberately conservative and offline:
 *  - It only checks TEXT parts. For image parts the "quote" is a transcription,
 *    not a substring of any text we hold, so a text quote cannot be verified and
 *    is treated as unverifiable (not a failure) — image location hints are never
 *    treated as pixel-precise.
 *  - Matching uses a SAFE normalization (collapse whitespace, case-fold) so
 *    harmless formatting differences don't trip the check; it never does fuzzy
 *    matching that could hide a genuinely fabricated quote.
 *  - A quote pointing at a part index that doesn't exist, or a page out of the
 *    part's page range, fails too.
 */

export type SourceTextPart = {
  index: number;
  /** The text for a text part; null for a file part (image/pdf). */
  text: string | null;
  /** A PDF part's page count, if known (bounds the evidence page). */
  pageCount?: number | null;
};

function normalizeForQuote(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Is this evidence's quote actually present in the cited source part?
 * Returns true when verified, false when the quote is absent/out of bounds, and
 * null when the quote cannot be verified from text we hold (e.g. an image part).
 */
export function verifyEvidence(
  evidence: EvidenceRef | null,
  parts: SourceTextPart[],
): boolean | null {
  if (!evidence || evidence.quote == null || evidence.quote.trim() === "") {
    return null; // nothing to verify
  }
  if (evidence.partIndex == null) return null;
  const part = parts.find((p) => p.index === evidence.partIndex);
  if (!part) return false; // cites a part that doesn't exist
  // Page bounds, when a page is claimed on a PDF part.
  if (evidence.page != null && part.pageCount != null) {
    if (evidence.page < 1 || evidence.page > part.pageCount) return false;
  }
  if (part.text == null) return null; // image/pdf bytes — can't verify a text quote
  const haystack = normalizeForQuote(part.text);
  const needle = normalizeForQuote(evidence.quote);
  if (needle === "") return null;
  return haystack.includes(needle);
}

/**
 * Validate a model-returned page citation against the ACTUAL page count of the
 * cited part (blueprint §3.2: "validate any model-returned page ranges against
 * actual page count and prevent overlaps/out-of-bounds"). Independent of the
 * quote check, so an out-of-bounds page is caught even when no quote is given.
 *
 * Returns:
 *  - true  when the page is within [1, pageCount] of a PDF part, OR no page is
 *          claimed (nothing to validate);
 *  - false when a page is claimed that is < 1, > the part's page count, points
 *          at a part that doesn't exist, or is claimed on a non-paged part.
 *
 * A page claimed on a part whose page count is unknown (e.g. an image, or a PDF
 * whose count we couldn't read) is NOT failed here — the caller treats an
 * unknown bound as unverifiable, never as a false certainty.
 */
export function isPageInBounds(
  evidence: EvidenceRef | null,
  parts: SourceTextPart[],
): boolean {
  if (!evidence || evidence.page == null) return true; // nothing to validate
  if (evidence.partIndex == null) return false; // a page with no part is nonsense
  const part = parts.find((p) => p.index === evidence.partIndex);
  if (!part) return false; // cites a part that doesn't exist
  if (part.pageCount == null) return true; // unknown bound — unverifiable, not a failure
  return evidence.page >= 1 && evidence.page <= part.pageCount;
}
