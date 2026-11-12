import { renderToStaticMarkup } from "react-dom/server";

import {
  UpgradeNote,
  UpgradeNoteView,
} from "@/components/billing/upgrade-note";
import { UPGRADE_HREF } from "@/lib/billing/config";
import { ExerciseRecords } from "@/components/exercises/history/exercise-records";
import { SessionHistoryList } from "@/components/exercises/history/session-history-list";
import type {
  ExerciseRecordsDto,
  SessionRowDto,
} from "@/lib/progression/history-types";

/**
 * Entitlement Audit — the upgrade invitation and the Free exercise-history
 * render. A Free page shows the lifter's logged data in full, one quiet
 * invitation that links to the existing plan-selection flow, and no Pro value
 * hidden anywhere in the markup.
 */

const noop = () => {};

describe("UpgradeNoteView", () => {
  it("block: a title, one sentence, and Explore Pro linking to the plan flow", () => {
    const html = renderToStaticMarkup(
      <UpgradeNoteView
        variant="block"
        titleId="t1"
        title="Strength insights are part of Pro"
        message="See estimated strength trends, personal-record insights, and smarter progression recommendations based on your training history."
        onDismiss={noop}
      />,
    );
    expect(UPGRADE_HREF).toBe("/settings/billing");
    expect(html).toContain('href="/settings/billing"');
    expect(html).toContain(">Explore Pro<");
    expect(html).toContain('aria-labelledby="t1"');
    expect(html).toContain('<h2 id="t1"');
    expect(html).toContain("Strength insights are part of Pro");
    // Dismissible by keyboard: a real button with an accessible name.
    expect(html).toMatch(
      /<button[^>]*aria-label="Dismiss: Strength insights are part of Pro"/,
    );
    // No blur, no fake preview, no countdown.
    expect(html).not.toMatch(/blur|countdown|days left/i);
  });

  it("inline: one sentence and the same action", () => {
    const html = renderToStaticMarkup(
      <UpgradeNoteView
        titleId="t2"
        message="Progress, hold, and deload calls for this lift are part of Pro."
        onDismiss={noop}
      />,
    );
    expect(html).toContain("calls for this lift are part of Pro.");
    expect(html).toContain('href="/settings/billing"');
    expect(html).not.toContain("<h2");
  });

  it("is never server-rendered (no flash of a note the lifter dismissed)", () => {
    expect(renderToStaticMarkup(<UpgradeNote surface="x" message="m" />)).toBe(
      "",
    );
  });
});

const SET = {
  weightLbs: 185,
  reps: 8,
  dateIso: "2026-11-09",
  dateLabel: "Nov 9",
};

describe("Free exercise history renders logged data, not Pro values", () => {
  it("records: best set and heaviest stay; the estimate reads 'Part of Pro'; no rep-record table", () => {
    const free: ExerciseRecordsDto = {
      kind: "loaded",
      bestSet: SET,
      bestE1rm: null,
      heaviest: SET,
      repRecords: null,
    };
    const html = renderToStaticMarkup(
      <ExerciseRecords records={free} scopeName={null} />,
    );
    expect(html).toContain("185 × 8");
    expect(html).toContain("Part of Pro");
    expect(html).not.toContain("Rep records");
    expect(html).not.toContain("<table");
  });

  it("records: Pro shows the estimate and the rep-record frontier", () => {
    const pro: ExerciseRecordsDto = {
      kind: "loaded",
      bestSet: SET,
      bestE1rm: 234,
      heaviest: SET,
      repRecords: [SET],
    };
    const html = renderToStaticMarkup(
      <ExerciseRecords records={pro} scopeName={null} />,
    );
    expect(html).toContain("234");
    expect(html).toContain("Rep records");
    expect(html).not.toContain("Part of Pro");
  });

  it("sessions: every logged set and RIR is listed with no call label", () => {
    const row: SessionRowDto = {
      loggedExerciseId: "le1",
      loggedSessionId: "ls1",
      dateIso: "2026-11-09",
      dateLabel: "Nov 9",
      gymName: null,
      gymArchived: false,
      workingSets: [
        { weightLbs: 185, reps: 8, rir: 2 },
        { weightLbs: 185, reps: 7, rir: 1 },
      ],
      extraSets: [],
      plannedSets: 2,
      swappedFromName: null,
      call: "none",
    };
    const html = renderToStaticMarkup(
      <SessionHistoryList
        rows={[row]}
        total={1}
        showingAll
        externalLoad
        noGymScope={false}
        viewAllHref="/x?sessions=all"
        recentOnlyHref="/x"
        scopeName={null}
      />,
    );
    expect(html).toContain("185");
    expect(html).toMatch(/RIR/);
    expect(html).not.toMatch(/Progress|Deload|Hold|Stalled/);
  });
});
