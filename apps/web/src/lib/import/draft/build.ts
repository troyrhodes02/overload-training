import {
  capIssues,
  detectMixedUnits,
  ISSUE_CODES,
  parsePrescription,
  type IssueCode,
} from "../parse/shorthand";
import type { MatchOutcome } from "../match/matcher";
import type { ExtractedPlanObservation } from "../extraction/schema";
import {
  verifyEvidence,
  isPageInBounds,
  type SourceTextPart,
} from "./evidence";
import type {
  DraftExercise,
  DraftField,
  DraftIssue,
  DraftMatch,
  EvidenceRef,
  FieldStatus,
  ImportDraft,
} from "./types";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — build the versioned
 * `ImportDraft` from the model's observation (blueprint §3.5 / spec §13). This is
 * the "code decides" half: it runs the deterministic parser on every observed
 * value, folds in the deterministic library match (the model never chose an id),
 * verifies every cited quote against the source, and assembles the issues[].
 *
 * PURE: the library match outcomes and the source text parts are passed in (the
 * DB loader lives in match/library.ts and the lifecycle code assembles the text
 * parts). Nothing here touches Prisma or an account id — so the mapping is fully
 * testable offline.
 *
 * A fresh draft starts at version 0. The lifecycle sets `draftVersion` on the
 * session to match; review edits bump both in lockstep (optimistic concurrency).
 */

const MISSING_EVIDENCE: null = null;

function toEvidence(
  e: ExtractedPlanObservation["title"]["evidence"],
): EvidenceRef | null {
  if (!e) return null;
  return {
    partIndex: e.partIndex,
    page: e.page,
    quote: e.quote,
    locationHint: e.locationHint,
  };
}

/** Map a parser status to a review FieldStatus, escalating "missing" to "needed". */
function toFieldStatus(
  status: "explicit" | "derived" | "missing" | "ambiguous",
  required: boolean,
): FieldStatus {
  if (status === "missing" && required) return "needed";
  if (status === "ambiguous" && required) return "needed";
  return status;
}

function matchToDraft(outcome: MatchOutcome): DraftMatch {
  switch (outcome.kind) {
    case "matched":
      return {
        kind: "matched",
        exerciseId: outcome.exerciseId,
        name: outcome.name,
      };
    case "ambiguous":
      return {
        kind: "ambiguous",
        raw: outcome.raw,
        candidates: outcome.candidates,
      };
    case "unknown":
      return { kind: "unknown", raw: outcome.raw };
  }
}

type BuildInput = {
  observation: ExtractedPlanObservation;
  /** One match outcome per observed exercise, in document order. */
  matches: MatchOutcome[];
  /** Text parts for quote verification (image parts have text: null). */
  parts: SourceTextPart[];
};

/** A flat exercise record linking an observation exercise to its match. */
type FlatExercise = {
  dayIndex: number;
  exIndex: number;
  obs: ExtractedPlanObservation["days"][number]["exercises"][number];
};

export function buildImportDraft(input: BuildInput): ImportDraft {
  const { observation, matches, parts } = input;
  const issues: DraftIssue[] = [];

  // Not a plan: the draft is empty and carries a single blocking issue. Confirm
  // can never create anything from it.
  if (!observation.isWorkoutPlan) {
    return {
      version: 0,
      title: {
        value: null,
        raw: observation.title.raw,
        status: "missing",
        evidence: toEvidence(observation.title.evidence),
      },
      days: [],
      issues: [
        {
          code: ISSUE_CODES.NOT_A_PLAN,
          severity: "blocking",
          fieldPath: "/",
          evidence: null,
        },
      ],
    };
  }

  // Flatten exercises in document order so `matches[i]` lines up with exercise i.
  const flat: FlatExercise[] = [];
  observation.days.forEach((day, dayIndex) => {
    day.exercises.forEach((obs, exIndex) => {
      flat.push({ dayIndex, exIndex, obs });
    });
  });

  const exerciseCountsPerDay = observation.days.map((d) => d.exercises.length);
  const setCounts: number[] = [];

  const draftDays = observation.days.map((day, dayIndex) => {
    const label: DraftField<string> = {
      value: day.label.raw,
      raw: day.label.raw,
      status: day.label.raw ? "explicit" : "needed",
      evidence: toEvidence(day.label.evidence),
    };
    if (!day.label.raw) {
      issues.push({
        code: ISSUE_CODES.REQUIRED_MISSING,
        severity: "blocking",
        fieldPath: `/days/${dayIndex}/label`,
        evidence: null,
      });
    }

    const exercises: DraftExercise[] = day.exercises.map((obs, exIndex) => {
      const globalIndex = flat.findIndex(
        (f) => f.dayIndex === dayIndex && f.exIndex === exIndex,
      );
      const outcome = matches[globalIndex];
      const match = matchToDraft(outcome);
      const fieldBase = `/days/${dayIndex}/exercises/${exIndex}`;

      // Deterministic parse of the prescription from observed strings.
      const parsed = parsePrescription({
        sets: obs.sets.raw,
        reps: obs.reps.raw,
        context: {
          load: obs.load.raw,
          rest: obs.rest.raw,
          tempo: obs.tempo.raw,
          notes: obs.notes.raw,
          groupLabel: obs.groupLabel.raw,
        },
      });

      if (parsed.sets.value != null) setCounts.push(parsed.sets.value);

      // Mixed units across this exercise's load strings (never converted).
      if (detectMixedUnits([obs.load.raw])) {
        parsed.issues.push(ISSUE_CODES.MIXED_UNITS);
      }

      // Match issues.
      if (match.kind === "ambiguous") {
        issues.push({
          code: ISSUE_CODES.EXERCISE_AMBIGUOUS,
          severity: "blocking",
          fieldPath: `${fieldBase}/match`,
          evidence: toEvidence(obs.name.evidence),
        });
      } else if (match.kind === "unknown") {
        issues.push({
          code: ISSUE_CODES.EXERCISE_UNRECOGNIZED,
          severity: "blocking",
          fieldPath: `${fieldBase}/match`,
          evidence: toEvidence(obs.name.evidence),
        });
      }

      // Quote-to-source verification for this exercise's name evidence.
      const nameEvidence = toEvidence(obs.name.evidence);
      const verified = verifyEvidence(nameEvidence, parts);
      if (verified === false) {
        issues.push({
          code: ISSUE_CODES.EVIDENCE_NOT_FOUND,
          severity: "info",
          fieldPath: `${fieldBase}/name`,
          evidence: nameEvidence,
        });
      }
      // Page-citation bounds: a model-returned page outside the cited part's real
      // page range (or on a non-existent part) is flagged, never trusted.
      if (!isPageInBounds(nameEvidence, parts)) {
        issues.push({
          code: ISSUE_CODES.EVIDENCE_PAGE_OUT_OF_BOUNDS,
          severity: "info",
          fieldPath: `${fieldBase}/name`,
          evidence: nameEvidence,
        });
      }

      // Field-level issues from the parser (rolled into the draft issues[]).
      for (const code of parsed.issues) {
        const severity = blockingParseCode(code) ? "blocking" : "info";
        issues.push({
          code,
          severity,
          fieldPath: fieldBase,
          evidence: null,
        });
      }

      const evidence = toEvidence(obs.name.evidence);
      return {
        key: `d${dayIndex}e${exIndex}`,
        match,
        sets: toDraftField(parsed.sets, evidence, true),
        repMin: toDraftField(parsed.repMin, evidence, true),
        repMax: toDraftField(parsed.repMax, evidence, true),
        context: parsed.context,
      } satisfies DraftExercise;
    });

    return {
      key: `d${dayIndex}`,
      label,
      exercises,
    };
  });

  // Structural caps → visible issues, never silent truncation.
  for (const code of capIssues({
    dayCount: observation.days.length,
    exerciseCountsPerDay,
    setCounts,
  })) {
    issues.push({ code, severity: "blocking", fieldPath: "/", evidence: null });
  }

  // Contradictions the model reported.
  for (const c of observation.contradictions) {
    const ev = c.evidence[0] ? toEvidence(c.evidence[0]) : MISSING_EVIDENCE;
    issues.push({
      code: ISSUE_CODES.CONTRADICTION,
      severity: "info",
      fieldPath: "/",
      evidence: ev,
    });
    if (!isPageInBounds(ev, parts)) {
      issues.push({
        code: ISSUE_CODES.EVIDENCE_PAGE_OUT_OF_BOUNDS,
        severity: "info",
        fieldPath: "/",
        evidence: ev,
      });
    }
  }
  // Unreadable regions the model reported.
  for (const u of observation.unreadable) {
    const ev = toEvidence(u);
    issues.push({
      code: ISSUE_CODES.UNREADABLE,
      severity: "info",
      fieldPath: "/",
      evidence: ev,
    });
    if (!isPageInBounds(ev, parts)) {
      issues.push({
        code: ISSUE_CODES.EVIDENCE_PAGE_OUT_OF_BOUNDS,
        severity: "info",
        fieldPath: "/",
        evidence: ev,
      });
    }
  }

  const title: DraftField<string> = {
    value: observation.title.raw,
    raw: observation.title.raw,
    status: observation.title.raw ? "explicit" : "missing",
    evidence: toEvidence(observation.title.evidence),
  };

  // A plan with no days at all is not confirmable.
  if (draftDays.length === 0) {
    issues.push({
      code: ISSUE_CODES.REQUIRED_MISSING,
      severity: "blocking",
      fieldPath: "/days",
      evidence: null,
    });
  }

  return { version: 0, title, days: draftDays, issues };
}

function toDraftField(
  parsed: {
    value: number | null;
    raw: string | null;
    status: "explicit" | "derived" | "missing" | "ambiguous";
  },
  evidence: EvidenceRef | null,
  required: boolean,
): DraftField<number> {
  return {
    value: parsed.value,
    raw: parsed.raw,
    status: toFieldStatus(parsed.status, required),
    evidence,
  };
}

function blockingParseCode(code: IssueCode): boolean {
  return (
    code === ISSUE_CODES.REQUIRED_MISSING ||
    code === ISSUE_CODES.VALUE_AMBIGUOUS ||
    code === ISSUE_CODES.TOO_MANY_DAYS ||
    code === ISSUE_CODES.TOO_MANY_EXERCISES ||
    code === ISSUE_CODES.TOO_MANY_SETS
  );
}

/**
 * Re-derive the BLOCKING issues from a stored draft, server-side. This is the
 * authority for whether "Create plan" may run: a client "resolved" flag can
 * never waive a blocker (spec §8 derived fields). Confirm calls this on the
 * stored draft and refuses if any blocker remains.
 */
export function deriveBlockers(draft: ImportDraft): DraftIssue[] {
  const blockers: DraftIssue[] = [];

  if (draft.days.length === 0) {
    blockers.push({
      code: ISSUE_CODES.REQUIRED_MISSING,
      severity: "blocking",
      fieldPath: "/days",
      evidence: null,
    });
  }

  draft.days.forEach((day, dayIndex) => {
    if (!day.label.value || String(day.label.value).trim() === "") {
      blockers.push({
        code: ISSUE_CODES.REQUIRED_MISSING,
        severity: "blocking",
        fieldPath: `/days/${dayIndex}/label`,
        evidence: null,
      });
    }
    // Intra-day duplicate: two exercises in the same day resolving to the SAME
    // library exerciseId collide on SessionExercise's @@unique([sessionId,
    // exerciseId]) and would roll the whole confirm back. The plan model can't
    // represent the same movement twice in one day, so surface it as a blocker
    // the lifter can fix (remove or re-point one) rather than a dead-end confirm.
    // Only matched library rows can collide; each custom_staged insert mints a
    // fresh id, so staged customs never clash.
    const seenMatchedIds = new Set<string>();
    day.exercises.forEach((ex, exIndex) => {
      if (ex.match.kind === "matched") {
        if (seenMatchedIds.has(ex.match.exerciseId)) {
          blockers.push({
            code: ISSUE_CODES.DUPLICATE_EXERCISE_IN_DAY,
            severity: "blocking",
            fieldPath: `/days/${dayIndex}/exercises/${exIndex}/match`,
            evidence: null,
          });
        } else {
          seenMatchedIds.add(ex.match.exerciseId);
        }
      }
    });
    day.exercises.forEach((ex, exIndex) => {
      const base = `/days/${dayIndex}/exercises/${exIndex}`;
      // Match must be resolved to a matched library row or a staged custom.
      if (ex.match.kind === "ambiguous" || ex.match.kind === "unknown") {
        blockers.push({
          code:
            ex.match.kind === "ambiguous"
              ? ISSUE_CODES.EXERCISE_AMBIGUOUS
              : ISSUE_CODES.EXERCISE_UNRECOGNIZED,
          severity: "blocking",
          fieldPath: `${base}/match`,
          evidence: null,
        });
      }
      // Sets and both rep bounds must be present and valid.
      if (!isValidInt(ex.sets.value, 1, 15)) {
        blockers.push(blocker(`${base}/sets`));
      }
      if (!isValidInt(ex.repMin.value, 1, 999)) {
        blockers.push(blocker(`${base}/repMin`));
      }
      if (!isValidInt(ex.repMax.value, 1, 999)) {
        blockers.push(blocker(`${base}/repMax`));
      }
      if (
        isValidInt(ex.repMin.value, 1, 999) &&
        isValidInt(ex.repMax.value, 1, 999) &&
        (ex.repMin.value as number) > (ex.repMax.value as number)
      ) {
        blockers.push(blocker(`${base}/repRange`));
      }
    });
  });

  return blockers;
}

function blocker(fieldPath: string): DraftIssue {
  return {
    code: ISSUE_CODES.REQUIRED_MISSING,
    severity: "blocking",
    fieldPath,
    evidence: null,
  };
}

function isValidInt(n: number | null, min: number, max: number): boolean {
  return n != null && Number.isInteger(n) && n >= min && n <= max;
}
