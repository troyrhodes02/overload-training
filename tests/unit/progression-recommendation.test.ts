import {
  evaluateReactiveDecision,
  type Performance,
} from "@/lib/progression/engine";
import {
  buildRecommendation,
  insufficientNote,
  type RecommendationInput,
} from "@/lib/progression/recommendation";
import type { DecisionEvidence } from "@/lib/progression/types";

/**
 * The recommendation copy catalog (Smarter & Explainable Progression design
 * doc §4.4, spec §11.2) and the correspondence sweep (spec §14.1, AC-2): for
 * any history, the words belong to the call the engine made, name only facts
 * it read, and carry a number only where the engine has one.
 */

const LATEST = { loggedExerciseId: "le-9", dateIso: "2026-10-13" };

function ctx(
  over: Partial<Extract<RecommendationInput, { scheduledDeload: false }>> & {
    state: Extract<RecommendationInput, { scheduledDeload: false }>["state"];
    evidence: DecisionEvidence;
  },
): RecommendationInput {
  return {
    scheduledDeload: false,
    rirEffect: null,
    externalLoad: true,
    workingWeightLbs: 185,
    progressLoadLbs: null,
    gymName: null,
    latestIsLastTime: true,
    referenceIso: "2026-10-20",
    when: "today",
    ...over,
  };
}

const progressEv: DecisionEvidence = {
  kind: "progress",
  sessions: 2,
  repMax: 10,
};

describe("the copy catalog", () => {
  it("P1 loaded: try the working weight plus the increment", () => {
    expect(
      buildRecommendation(
        ctx({ state: "progress", evidence: progressEv, progressLoadLbs: 190 }),
      ),
    ).toEqual({
      kind: "progress",
      tone: "strong",
      action: "Try 190 lb today (+5 lb)",
      evidence: "10 reps on every set, 2 sessions running",
    });
  });

  it("P1 next time, at a gym (machine or cable)", () => {
    const r = buildRecommendation(
      ctx({
        state: "progress",
        evidence: progressEv,
        progressLoadLbs: 125,
        when: "next",
        gymName: "Downtown Gym",
      }),
    );
    expect(r?.action).toBe("Try 125 lb next time (+5 lb)");
    expect(r?.evidence).toBe(
      "10 reps on every set, 2 sessions running at Downtown Gym",
    );
  });

  it("P1 bodyweight: past the plan's own top, never a weight", () => {
    const r = buildRecommendation(
      ctx({
        state: "progress",
        evidence: { kind: "progress", sessions: 2, repMax: 12 },
        externalLoad: false,
        workingWeightLbs: null,
      }),
    );
    expect(r?.action).toBe("Today, go past 12 reps or make it harder");
    expect(
      buildRecommendation(
        ctx({
          state: "progress",
          evidence: { kind: "progress", sessions: 2, repMax: 12 },
          externalLoad: false,
          when: "next",
        }),
      )?.action,
    ).toBe("Next time, go past 12 reps or make it harder");
    expect(
      buildRecommendation(
        ctx({
          state: "progress",
          evidence: { kind: "progress", sessions: 2, repMax: null },
          externalLoad: false,
        }),
      )?.action,
    ).toBe("Today, go past the top of the range or make it harder");
  });

  it("P2 loaded without a working weight: a direction, no number", () => {
    const r = buildRecommendation(
      ctx({ state: "progress", evidence: progressEv, progressLoadLbs: null }),
    );
    expect(r?.action).toBe("Ready to add weight today");
  });

  it("progress across different ranges says top of the range", () => {
    expect(
      buildRecommendation(
        ctx({
          state: "progress",
          evidence: { kind: "progress", sessions: 2, repMax: null },
          progressLoadLbs: 190,
        }),
      )?.evidence,
    ).toBe("Top of the range on every set, 2 sessions running");
  });

  it("P3 released stall (RIR case B)", () => {
    const r = buildRecommendation(
      ctx({
        state: "progress",
        rirEffect: "released_stall",
        evidence: { kind: "released_stall", rirToSpare: 2, latest: LATEST },
        progressLoadLbs: 230,
      }),
    );
    expect(r).toEqual({
      kind: "progress",
      tone: "strong",
      action: "Try 230 lb today (+5 lb)",
      evidence: "e1RM flat, but every set last time had 2+ in reserve",
    });
  });

  it("H1 held at the limit (RIR case A), with the date when it isn't last time", () => {
    const r = buildRecommendation(
      ctx({
        state: "hold",
        rirEffect: "held_at_limit",
        evidence: { kind: "held_at_limit", rirAtLimit: 0, latest: LATEST },
        latestIsLastTime: false,
        when: "next",
      }),
    );
    expect(r).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 185 lb next time",
      evidence: "Top of the range, but at your limit on Oct 13 (0 RIR)",
    });
  });

  it("H2 stalled names the rule, not e1RM figures", () => {
    const r = buildRecommendation(
      ctx({
        state: "stalled",
        evidence: { kind: "stalled", sessions: 2, window: 3, repMax: 8 },
        workingWeightLbs: 270,
        gymName: "Downtown Gym",
      }),
    );
    expect(r).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 270 lb today",
      evidence:
        "Top of the range 2 sessions running, but e1RM hasn't risen over 3 sessions at Downtown Gym",
    });
  });

  it("H3 top once", () => {
    expect(
      buildRecommendation(
        ctx({
          state: "hold",
          evidence: {
            kind: "hold_top_once",
            repMax: 8,
            sessions: 2,
            latest: LATEST,
          },
          workingWeightLbs: 115,
        }),
      ),
    ).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 115 lb today",
      evidence: "8 on every set last time; progress needs 2 sessions running",
    });
  });

  it("H4 short of the top, loaded and bodyweight", () => {
    const ev: DecisionEvidence = {
      kind: "hold_short",
      reps: [10, 9, 8],
      repMin: 8,
      repMax: 10,
      latest: LATEST,
    };
    expect(
      buildRecommendation(
        ctx({ state: "hold", evidence: ev, workingWeightLbs: 60 }),
      ),
    ).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Stay at 60 lb today",
      evidence: "Last time: 10, 9, 8 of 8–10",
    });
    expect(
      buildRecommendation(
        ctx({
          state: "hold",
          evidence: ev,
          externalLoad: false,
          workingWeightLbs: null,
          latestIsLastTime: false,
        }),
      ),
    ).toEqual({
      kind: "hold",
      tone: "quiet",
      action: "Hold steady today",
      evidence: "On Oct 13: 10, 9, 8 of 8–10",
    });
  });

  it("hold without a known weight never prints a number", () => {
    expect(
      buildRecommendation(
        ctx({
          state: "hold",
          evidence: {
            kind: "hold_short",
            reps: [8],
            repMin: 8,
            repMax: 10,
            latest: LATEST,
          },
          workingWeightLbs: null,
        }),
      )?.action,
    ).toBe("Hold steady today");
  });

  it("D1 deload names what to change, never an amount", () => {
    const ev: DecisionEvidence = { kind: "deload", sessions: 2, repMin: 12 };
    expect(
      buildRecommendation(
        ctx({ state: "deload", evidence: ev, gymName: "Downtown Gym" }),
      ),
    ).toEqual({
      kind: "deload",
      tone: "strong",
      action: "Lower the weight today",
      evidence: "A set below 12 reps, 2 sessions running at Downtown Gym",
    });
    expect(
      buildRecommendation(
        ctx({
          state: "deload",
          evidence: { kind: "deload", sessions: 2, repMin: null },
          externalLoad: false,
          when: "next",
        }),
      ),
    ).toEqual({
      kind: "deload",
      tone: "strong",
      action: "Back off next time",
      evidence: "A set below the range, 2 sessions running",
    });
  });

  it("S1 deload week, with and without a load", () => {
    expect(
      buildRecommendation({
        scheduledDeload: true,
        externalLoad: true,
        deloadLoadLbs: 170,
      }),
    ).toEqual({
      kind: "scheduled_deload",
      tone: "quiet",
      action: "Deload week: 170 lb (90%)",
      evidence: "Planned recovery, not a verdict. Calls resume next week.",
    });
    expect(
      buildRecommendation({
        scheduledDeload: true,
        externalLoad: false,
        deloadLoadLbs: null,
      })?.action,
    ).toBe("Deload week");
    expect(
      buildRecommendation({
        scheduledDeload: true,
        externalLoad: true,
        deloadLoadLbs: null,
      })?.action,
    ).toBe("Deload week");
  });

  it("not enough history is not a recommendation", () => {
    expect(
      buildRecommendation(
        ctx({
          state: "insufficient",
          evidence: { kind: "insufficient", qualifying: 1, required: 2 },
        }),
      ),
    ).toBeNull();
    expect(
      insufficientNote(
        { kind: "insufficient", qualifying: 1, required: 2 },
        "Campus Rec Center",
      ),
    ).toBe(
      "Not enough history yet at Campus Rec Center: 1 of 2 complete sessions.",
    );
    expect(
      insufficientNote(
        { kind: "insufficient", qualifying: 0, required: 2 },
        null,
      ),
    ).toBe("Not enough history yet: 0 of 2 complete sessions.");
    expect(insufficientNote(progressEv, null)).toBeNull();
  });

  it("a half-pound load prints as entered", () => {
    expect(
      buildRecommendation(
        ctx({ state: "progress", evidence: progressEv, progressLoadLbs: 57.5 }),
      )?.action,
    ).toBe("Try 57.5 lb today (+5 lb)");
  });

  it("a call and evidence that disagree throw outside production (R26)", () => {
    expect(() =>
      buildRecommendation(ctx({ state: "deload", evidence: progressEv })),
    ).toThrow(/cannot accompany/);
    expect(() =>
      buildRecommendation(
        ctx({
          state: "hold",
          rirEffect: null,
          evidence: { kind: "held_at_limit", rirAtLimit: 0, latest: LATEST },
        }),
      ),
    ).toThrow(/cannot accompany/);
  });
});

// ---------------------------------------------------------------------------
// Correspondence sweep (AC-2)
// ---------------------------------------------------------------------------

/** Small deterministic PRNG (mulberry32) so the sweep is reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomHistory(r: () => number, bodyweight: boolean): Performance[] {
  const n = 2 + Math.floor(r() * 5);
  const ranges = [
    [6, 8],
    [8, 10],
    [8, 12],
  ];
  const [repMin, repMax] =
    r() < 0.85 ? ranges[1] : ranges[Math.floor(r() * ranges.length)];
  let weight = 135 + Math.floor(r() * 10) * 5;
  // Half the histories sit at the top of the range at a steady load, so the
  // stall gate and both RIR qualifiers are exercised, not just the common paths.
  const topHeavy = r() < 0.5;
  return Array.from({ length: n }, (_, i) => {
    const sets = 1 + Math.floor(r() * 4);
    const rMin = r() < 0.15 ? 6 : repMin;
    const rMax = rMin === 6 ? 8 : repMax;
    if (!topHeavy) weight += r() < 0.3 ? 5 : r() < 0.1 ? -5 : 0;
    return {
      loggedExerciseId: `le-${String(i).padStart(2, "0")}`,
      dateIso: `2026-09-${String(i + 1).padStart(2, "0")}`,
      week: i + 1,
      scheduledDeload: r() < 0.1,
      gymId: null,
      complete: r() < 0.9,
      repMin: topHeavy ? repMin : rMin,
      repMax: topHeavy ? repMax : rMax,
      workingSets: Array.from({ length: sets }, (_, s) => ({
        setNumber: s + 1,
        weightLbs: bodyweight ? null : weight,
        reps:
          topHeavy && r() < 0.9
            ? rMax
            : Math.max(1, rMax - Math.floor(r() * 5) + (r() < 0.3 ? 0 : 1)),
        rir: topHeavy
          ? [null, 0, 2, 3, 4][Math.floor(r() * 5)]
          : r() < 0.5
            ? null
            : Math.floor(r() * 5),
      })),
    };
  });
}

const ALLOWED_ACTION: Record<string, RegExp> = {
  progress:
    /^(Try \d+(\.\d+)? lb (today|next time) \(\+5 lb\)|Ready to add weight (today|next time)|(Today|Next time), go past .+ or make it harder)$/,
  hold: /^(Stay at \d+(\.\d+)? lb (today|next time)|Hold steady (today|next time))$/,
  deload: /^(Lower the weight|Back off) (today|next time)$/,
};
const FORBIDDEN =
  /fatigue|overtrain|injur|optimal|guarantee|perfect|\bshould\b|recover/i;

describe("correspondence sweep: 2,000 histories", () => {
  it("the words always belong to the call, and claim nothing the engine didn't read", () => {
    const r = rng(15);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const bodyweight = r() < 0.25;
      const perfs = randomHistory(r, bodyweight);
      const d = evaluateReactiveDecision(perfs, {
        e1rmApplicable: !bodyweight,
      });
      const working = bodyweight ? null : r() < 0.1 ? null : 185;
      const rec = buildRecommendation({
        scheduledDeload: false,
        state: d.state,
        rirEffect: d.rirEffect,
        evidence: d.evidence,
        externalLoad: !bodyweight,
        workingWeightLbs: working,
        progressLoadLbs:
          d.state === "progress" && working !== null ? working + 5 : null,
        gymName: r() < 0.3 ? "Downtown Gym" : null,
        latestIsLastTime: r() < 0.8,
        referenceIso: "2026-10-20",
        when: r() < 0.5 ? "today" : "next",
      });
      counts[d.evidence.kind] = (counts[d.evidence.kind] ?? 0) + 1;

      if (d.state === "insufficient") {
        expect(rec).toBeNull();
        continue;
      }
      expect(rec).not.toBeNull();
      const kind = d.state === "stalled" ? "hold" : d.state;
      expect(rec!.kind).toBe(kind);
      expect(rec!.action).toMatch(ALLOWED_ACTION[kind]);
      expect(rec!.tone).toBe(kind === "hold" ? "quiet" : "strong");

      // RIR is named iff the RIR qualifier changed the call.
      const namesRir = /RIR|in reserve/.test(rec!.evidence);
      expect(namesRir).toBe(d.rirEffect !== null);

      // No weight for bodyweight; no amount for a deload.
      if (bodyweight) expect(rec!.action).not.toMatch(/lb/);
      if (d.state === "deload") expect(rec!.action).not.toMatch(/\d/);

      // Every number in the evidence is one the engine read.
      const allowed = new Set<string>(["2", "3", "0", "1"]);
      const e = d.evidence;
      if ("repMax" in e && e.repMax !== null) allowed.add(String(e.repMax));
      if ("repMin" in e && e.repMin !== null) allowed.add(String(e.repMin));
      if (e.kind === "hold_short")
        e.reps.forEach((x) => allowed.add(String(x)));
      if ("sessions" in e) allowed.add(String(e.sessions));
      if (e.kind === "stalled") allowed.add(String(e.window));
      // "on Sep 4" carries the latest counted session's day.
      if ("latest" in e) allowed.add(String(Number(e.latest.dateIso.slice(8))));
      for (const n of rec!.evidence.match(/\d+/g) ?? []) {
        expect(allowed).toContain(n);
      }

      expect(`${rec!.action} ${rec!.evidence}`).not.toMatch(FORBIDDEN);
    }
    // The sweep actually covers every branch.
    for (const k of [
      "insufficient",
      "progress",
      "stalled",
      "hold_top_once",
      "hold_short",
      "deload",
      "held_at_limit",
      "released_stall",
    ]) {
      expect(counts[k] ?? 0).toBeGreaterThan(0);
    }
  });

  it("the deload week's copy is the only place 'recovery' appears", () => {
    const s = buildRecommendation({
      scheduledDeload: true,
      externalLoad: true,
      deloadLoadLbs: 170,
    });
    expect(s?.evidence).toMatch(/recovery/);
  });
});
