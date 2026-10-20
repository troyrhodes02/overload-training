import { TOUR_STEPS, type TourStep } from "@/lib/tour/steps";
import {
  TOUR_CARD_GAP_PX,
  TOUR_SPOTLIGHT_PADDING_PX,
  TOUR_VIEWPORT_MARGIN_PX,
  counter,
  indexAfterLayoutChange,
  nextIndex,
  placeCard,
  resolveTarget,
  startIndex,
  stepsForLayout,
  type Rect,
} from "@/lib/tour/engine";

/**
 * The tour's pure engine (Onboarding Tour spec §13–§14.1; R10, R11, R13, R15).
 */

const byId = (id: string) => TOUR_STEPS.find((s) => s.id === id)!;
const avail =
  (...names: string[]) =>
  (a: string) =>
    names.includes(a);

describe("layout", () => {
  it("desktop is offered 7 steps (no menu step); a phone 8", () => {
    expect(stepsForLayout(TOUR_STEPS, "desktop").map((s) => s.id)).toEqual([
      "today",
      "logging",
      "plan",
      "history",
      "goals",
      "gyms",
      "settings",
    ]);
    expect(stepsForLayout(TOUR_STEPS, "phone")).toHaveLength(8);
  });

  it("after crossing md, the current step stays, or a phone-only step moves on", () => {
    const desk = stepsForLayout(TOUR_STEPS, "desktop");
    const phone = stepsForLayout(TOUR_STEPS, "phone");
    expect(desk[indexAfterLayoutChange(TOUR_STEPS, desk, "plan")].id).toBe(
      "plan",
    );
    expect(
      desk[indexAfterLayoutChange(TOUR_STEPS, desk, "navigation")].id,
    ).toBe("plan");
    expect(phone[indexAfterLayoutChange(TOUR_STEPS, phone, "goals")].id).toBe(
      "goals",
    );
  });
});

describe("target resolution: the first available wins", () => {
  it("logging points at Start when there is one, else the day's card with its own body", () => {
    const step = byId("logging");
    const a = resolveTarget(step, avail("today-start", "today-day"));
    expect(a).toEqual({
      anchor: "today-start",
      body: step.body,
      side: "below",
    });
    const b = resolveTarget(step, avail("today-day"));
    expect(b?.anchor).toBe("today-day");
    expect(b?.body).toBe(step.targets[1].body);
    expect(b?.body).toMatch(/^When a workout is planned/);
    expect(resolveTarget(step, avail())).toBeNull();
  });

  it("an area step uses the rail item when visible, the heading otherwise", () => {
    const step = byId("plan");
    expect(resolveTarget(step, avail("nav-plan", "page-plan"))).toEqual({
      anchor: "nav-plan",
      body: step.body,
      side: "right",
    });
    expect(resolveTarget(step, avail("page-plan"))?.anchor).toBe("page-plan");
  });
});

describe("start, walk, and counter", () => {
  const steps = stepsForLayout(TOUR_STEPS, "phone");

  it("starts at a named step, or at the first for an unknown id", () => {
    expect(steps[startIndex(steps, "goals")].id).toBe("goals");
    expect(startIndex(steps, "nope")).toBe(0);
    expect(startIndex(steps)).toBe(0);
  });

  it("walks past skipped steps in both directions", () => {
    const skipped = new Set(["navigation", "history"]);
    expect(steps[nextIndex(steps, skipped, 1, 1)].id).toBe("plan");
    expect(steps[nextIndex(steps, skipped, 3, 1)].id).toBe("goals");
    expect(steps[nextIndex(steps, skipped, 5, -1)].id).toBe("plan");
    expect(nextIndex(steps, skipped, 0, -1)).toBe(-1);
    expect(nextIndex(steps, skipped, 7, 1)).toBe(8);
  });

  it("a skipped step drops out of position and total; positions stay contiguous", () => {
    expect(counter(steps, new Set(), 0)).toEqual({ position: 1, total: 8 });
    const skipped = new Set(["navigation"]);
    const shown = steps
      .map((s, i) => [s, i] as const)
      .filter(([s]) => !skipped.has(s.id))
      .map(([, i]) => counter(steps, skipped, i));
    expect(shown.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(shown.map((c) => c.total))).toEqual(new Set([7]));
  });
});

describe("placeCard (desktop)", () => {
  const card = { width: 320, height: 220 };
  const pad = TOUR_SPOTLIGHT_PADDING_PX;
  const gap = TOUR_CARD_GAP_PX;
  const m = TOUR_VIEWPORT_MARGIN_PX;

  const overlaps = (t: Rect, p: { top: number; left: number }) => {
    const a = {
      l: t.left - pad,
      t: t.top - pad,
      r: t.left + t.width + pad,
      b: t.top + t.height + pad,
    };
    return !(
      p.left >= a.r ||
      p.left + card.width <= a.l ||
      p.top >= a.b ||
      p.top + card.height <= a.t
    );
  };

  it("sits right of a rail item, top-aligned with the ring", () => {
    const rail: Rect = { top: 52, left: 12, width: 200, height: 36 };
    expect(
      placeCard(rail, card, { width: 1280, height: 800 }, "right"),
    ).toEqual({ left: 12 + 200 + pad + gap, top: 52 - pad });
  });

  it("goes below when there is room, above when there is not", () => {
    const vp = { width: 1280, height: 800 };
    const high: Rect = { top: 90, left: 241, width: 513, height: 52 };
    expect(placeCard(high, card, vp, "below")).toEqual({
      left: 241,
      top: 90 + 52 + pad + gap,
    });
    const low: Rect = { top: 600, left: 241, width: 134, height: 36 };
    expect(placeCard(low, card, vp, "below")).toEqual({
      left: 241,
      top: 600 - pad - gap - card.height,
    });
  });

  it("falls back from right to below when the right side has no room", () => {
    const t: Rect = { top: 100, left: 1000, width: 200, height: 36 };
    const p = placeCard(t, card, { width: 1280, height: 800 }, "right");
    expect(p.top).toBe(100 + 36 + pad + gap);
    expect(p.left + card.width).toBeLessThanOrEqual(1280 - m);
  });

  it("never leaves the viewport and never covers the target when there is room (grid)", () => {
    for (const vp of [
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 1024, height: 700 },
    ]) {
      for (let top = 0; top <= vp.height - 40; top += 37) {
        for (let left = 0; left <= vp.width - 120; left += 53) {
          for (const prefer of ["right", "below"] as const) {
            const t: Rect = { top, left, width: 120, height: 40 };
            const p = placeCard(t, card, vp, prefer);
            expect(p.left).toBeGreaterThanOrEqual(m);
            expect(p.top).toBeGreaterThanOrEqual(m);
            expect(p.left + card.width).toBeLessThanOrEqual(vp.width - m);
            expect(p.top + card.height).toBeLessThanOrEqual(vp.height - m);
            const roomBelow =
              top + 40 + pad + gap + card.height <= vp.height - m;
            const roomAbove = top - pad - gap - card.height >= m;
            if (roomBelow || roomAbove) {
              expect([vp, t, prefer, overlaps(t, p)]).toEqual([
                vp,
                t,
                prefer,
                false,
              ]);
            }
          }
        }
      }
    }
  });
});

describe("the engine works on any registry", () => {
  it("handles a one-step registry", () => {
    const one: TourStep[] = [
      {
        id: "only",
        route: "/x",
        targets: [{ anchor: "page-plan" }],
        title: "Only",
        body: "One step.",
      },
    ];
    expect(stepsForLayout(one, "desktop")).toHaveLength(1);
    expect(counter(one, new Set(), 0)).toEqual({ position: 1, total: 1 });
    expect(nextIndex(one, new Set(), 0, 1)).toBe(1);
  });
});
