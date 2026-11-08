import {
  verifyEvidence,
  type SourceTextPart,
} from "@/lib/import/draft/evidence";

/**
 * Workout Plan Import & Review (OVE-106) — quote-to-source verification (spec
 * §14.6). A quote that isn't in the cited part fails; one that is, with safe
 * normalization, passes; image/pdf parts are unverifiable (null), never a false
 * failure; out-of-bounds page/part fails.
 */

const parts: SourceTextPart[] = [
  { index: 0, text: "Day 1 Push\nBench Press 3x8\nOverhead Press 3x10" },
  { index: 1, text: null, pageCount: 3 }, // an image/pdf part
];

describe("verifyEvidence", () => {
  it("a present quote verifies true (safe whitespace/case normalization)", () => {
    expect(
      verifyEvidence(
        {
          partIndex: 0,
          page: null,
          quote: "bench   press 3x8",
          locationHint: null,
        },
        parts,
      ),
    ).toBe(true);
  });

  it("a quote not in the part is flagged false (EVIDENCE_NOT_FOUND source)", () => {
    expect(
      verifyEvidence(
        { partIndex: 0, page: null, quote: "squat 5x5", locationHint: null },
        parts,
      ),
    ).toBe(false);
  });

  it("a quote citing a non-existent part fails", () => {
    expect(
      verifyEvidence(
        { partIndex: 9, page: null, quote: "anything", locationHint: null },
        parts,
      ),
    ).toBe(false);
  });

  it("an image/pdf part cannot verify a text quote → null (not a failure)", () => {
    expect(
      verifyEvidence(
        {
          partIndex: 1,
          page: 1,
          quote: "handwritten note",
          locationHint: "top",
        },
        parts,
      ),
    ).toBeNull();
  });

  it("a page beyond the part's page count fails", () => {
    expect(
      verifyEvidence(
        { partIndex: 1, page: 9, quote: "x", locationHint: null },
        parts,
      ),
    ).toBe(false);
  });

  it("no quote → nothing to verify (null)", () => {
    expect(
      verifyEvidence(
        { partIndex: 0, page: null, quote: null, locationHint: null },
        parts,
      ),
    ).toBeNull();
    expect(verifyEvidence(null, parts)).toBeNull();
  });
});
