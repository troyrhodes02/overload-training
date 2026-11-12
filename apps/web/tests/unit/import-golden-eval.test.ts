import { GOLDEN_FIXTURES } from "../fixtures/import-golden/fixtures";
import { evaluate, precision, recall } from "../fixtures/import-golden/runner";
import type { GoldenSourceKind } from "../fixtures/import-golden/types";

/**
 * Workout Plan Import & Review (OVE-109, blueprint §7.3, spec §14.12) — the
 * golden-set evaluation, run against the SYNTHETIC fixtures with the MOCKED
 * provider (no network, no cost, no real data).
 *
 * This proves the HARNESS works and reports accuracy on the deterministic layer
 * for the synthetic ground truth. Real-provider accuracy (does the live model
 * read a real photo correctly?) is a DIFFERENT, owner-gated measurement: it needs
 * budget authorization and consent to send files to Anthropic, and is reported
 * UNVERIFIED here rather than faked. The two are never mixed: this suite is
 * labelled `mode: "mocked"`.
 *
 * The real-provider mode is a documented env gate (PLAN_IMPORT_GOLDEN_REAL): if an
 * operator sets it to "authorized" with a configured provider, a separate harness
 * run would score the live model. Unattended, it is never set, so the real score
 * is explicitly unverified.
 */

describe("golden-set coverage", () => {
  it("has at least 50 synthetic fixtures", () => {
    expect(GOLDEN_FIXTURES.length).toBeGreaterThanOrEqual(50);
  });

  it("spans all five source kinds", () => {
    const kinds = new Set(GOLDEN_FIXTURES.map((f) => f.kind));
    const required: GoldenSourceKind[] = [
      "pasted_text",
      "text_pdf",
      "scanned_pdf",
      "screenshot",
      "photo_handwriting",
    ];
    for (const k of required) expect(kinds.has(k)).toBe(true);
  });

  it("covers the hard cases (tables, multi-column, mixed units, supersets, handwriting, illegibility, non-plans, injection, week-by-week)", () => {
    const hard = new Set<string>(GOLDEN_FIXTURES.flatMap((f) => f.hardCases));
    for (const h of [
      "table",
      "multi_column",
      "mixed_units",
      "supersets",
      "handwriting",
      "illegibility",
      "non_plan",
      "injection",
      "week_by_week",
    ]) {
      expect([h, hard.has(h)]).toEqual([h, true]);
    }
  });

  it("contains no real training data (every library id is a synthetic lib-* id)", () => {
    for (const f of GOLDEN_FIXTURES) {
      for (const c of f.library) {
        expect(c.id.startsWith("lib-")).toBe(true);
      }
    }
  });
});

describe("mocked evaluation report", () => {
  const report = evaluate(GOLDEN_FIXTURES, "mocked");

  it("is labelled mocked and separated from any real-provider evidence", () => {
    expect(report.mode).toBe("mocked");
  });

  it("recognizes every non-plan and creates nothing from it", () => {
    expect(report.notAPlan.correct).toBe(report.notAPlan.total);
  });

  it("never hallucinates a value the source did not state", () => {
    // The deterministic layer keeps missing as missing; a non-zero count here
    // would be a correctness bug (a guessed set/rep).
    expect(report.hallucinations).toBe(0);
  });

  it("marks genuinely-absent fields as missing, not guessed", () => {
    expect(report.explicitMissing.correct).toBe(report.explicitMissing.total);
    expect(report.explicitMissing.total).toBeGreaterThan(0);
  });

  it("recognizes ambiguity rather than resolving a tie", () => {
    expect(report.ambiguityRecognized.correct).toBe(
      report.ambiguityRecognized.total,
    );
    expect(report.ambiguityRecognized.total).toBeGreaterThan(0);
  });

  it("matches the catalog with high accuracy on the synthetic set", () => {
    const acc = report.catalog.correct / report.catalog.total;
    expect(acc).toBeGreaterThan(0.9);
  });

  it("has high per-field precision and recall for sets and rep ranges", () => {
    expect(precision(report.sets)).toBeGreaterThan(0.95);
    expect(recall(report.sets)).toBeGreaterThan(0.95);
    expect(precision(report.repRange)).toBeGreaterThan(0.95);
    expect(recall(report.repRange)).toBeGreaterThan(0.95);
  });

  it("recovers day labels precisely", () => {
    expect(precision(report.dayLabel)).toBeGreaterThan(0.95);
    expect(recall(report.dayLabel)).toBeGreaterThan(0.95);
  });

  it("reports cost/latency per source kind (synthetic in mocked mode)", () => {
    expect(report.cost.totalInputTokens).toBeGreaterThan(0);
    expect(report.cost.avgLatencyMs).toBeGreaterThan(0);
    for (const kind of Object.keys(report.byKind)) {
      expect(report.cost.byKind[kind]?.attempts).toBeGreaterThan(0);
    }
  });
});

describe("real-provider mode is owner-gated (reported unverified)", () => {
  it("does not run a real provider unless explicitly authorized", () => {
    // Unattended, this flag is never set, so no paid call is made and the real
    // accuracy is UNVERIFIED (never faked). This test documents the gate.
    expect(process.env.PLAN_IMPORT_GOLDEN_REAL).not.toBe("authorized");
  });
});
