/**
 * Pitch 21k spec §5.3: the tour's geometry, at the edges.
 */
import {
  CARD_GAP,
  cardPlacement,
  clampOffset,
  dimRects,
  insideBand,
  isValidRect,
  MIN_CARD_HEIGHT,
  sameRect,
  SCROLL_MARGIN,
  scrollDelta,
  spotlight,
  SPOTLIGHT_PADDING,
  TAB_BAR_CLEARANCE,
  visibleBand,
} from "../src/tour/geometry";

const window = { width: 393, height: 852 };
const insets = { top: 59, bottom: 34 };
const band = visibleBand(window, insets);

it("the band runs from below the status bar to above the tab bar", () => {
  expect(band).toEqual({ top: 67, bottom: 852 - 34 - TAB_BAR_CLEARANCE });
});

describe("isValidRect", () => {
  it("rejects nothing, zero size, NaN, and fully off-window rects", () => {
    expect(isValidRect(null, window)).toBe(false);
    expect(isValidRect({ x: 0, y: 0, width: 0, height: 10 }, window)).toBe(
      false,
    );
    expect(isValidRect({ x: 0, y: 0, width: 10, height: 0 }, window)).toBe(
      false,
    );
    expect(isValidRect({ x: NaN, y: 0, width: 10, height: 10 }, window)).toBe(
      false,
    );
    expect(isValidRect({ x: 500, y: 0, width: 10, height: 10 }, window)).toBe(
      false,
    );
    expect(isValidRect({ x: 0, y: -100, width: 10, height: 50 }, window)).toBe(
      false,
    );
    expect(isValidRect({ x: 0, y: 900, width: 10, height: 10 }, window)).toBe(
      false,
    );
  });

  it("accepts a partly visible rect", () => {
    expect(isValidRect({ x: -5, y: 840, width: 100, height: 40 }, window)).toBe(
      true,
    );
  });
});

describe("insideBand and scrollDelta", () => {
  it("a rect wholly in the band needs no scroll", () => {
    const r = { x: 16, y: 100, width: 300, height: 44 };
    expect(insideBand(r, band)).toBe(true);
    expect(scrollDelta(r, band)).toBe(0);
  });

  it("a rect under the tab bar scrolls up to just below the band's top", () => {
    const r = { x: 16, y: 760, width: 300, height: 48 };
    expect(insideBand(r, band)).toBe(false);
    expect(scrollDelta(r, band)).toBe(760 - (band.top + SCROLL_MARGIN));
  });

  it("a rect above the band scrolls down (negative)", () => {
    const r = { x: 16, y: 20, width: 300, height: 30 };
    expect(scrollDelta(r, band)).toBeLessThan(0);
  });

  it("a rect taller than the band is fine when its top is inside", () => {
    expect(insideBand({ x: 0, y: 100, width: 300, height: 2000 }, band)).toBe(
      true,
    );
    expect(insideBand({ x: 0, y: 40, width: 300, height: 2000 }, band)).toBe(
      false,
    );
  });
});

it("clampOffset stays within the scroll view's limits", () => {
  expect(clampOffset(-200, { min: -59, max: 400 })).toBe(-59);
  expect(clampOffset(900, { min: -59, max: 400 })).toBe(400);
  expect(clampOffset(120, { min: -59, max: 400 })).toBe(120);
  // Content shorter than the view: never scrolls past the top.
  expect(clampOffset(50, { min: -59, max: -200 })).toBe(-59);
});

describe("spotlight", () => {
  it("pads the target", () => {
    expect(
      spotlight({ x: 50, y: 200, width: 100, height: 40 }, band, window),
    ).toEqual({
      x: 50 - SPOTLIGHT_PADDING,
      y: 200 - SPOTLIGHT_PADDING,
      width: 100 + 2 * SPOTLIGHT_PADDING,
      height: 40 + 2 * SPOTLIGHT_PADDING,
    });
  });

  it("is clipped to the band, and null when nothing is left", () => {
    const tall = spotlight(
      { x: 16, y: 500, width: 300, height: 900 },
      band,
      window,
    );
    expect(tall?.y).toBe(494);
    expect(tall && tall.y + tall.height).toBe(band.bottom);
    expect(
      spotlight({ x: 16, y: 790, width: 300, height: 40 }, band, window),
    ).toBeNull();
  });
});

describe("cardPlacement", () => {
  it("below a target in the upper half", () => {
    const spot = { x: 10, y: 120, width: 300, height: 50 };
    const p = cardPlacement(spot, band, window, "highlight");
    expect(p).toEqual({
      kind: "below",
      top: 170 + CARD_GAP,
      maxHeight: band.bottom - (170 + CARD_GAP),
    });
  });

  it("above a target in the lower half", () => {
    const spot = { x: 10, y: 600, width: 300, height: 50 };
    const p = cardPlacement(spot, band, window, "highlight");
    expect(p).toMatchObject({ kind: "above", bottom: 852 - (600 - CARD_GAP) });
  });

  it("uses a side with room, and centers when neither fits", () => {
    // Upper half but tall: nothing left below.
    const spot = { x: 10, y: 300, width: 300, height: band.bottom - 300 - 40 };
    expect(cardPlacement(spot, band, window, "highlight").kind).toBe("above");
    const huge = {
      x: 10,
      y: band.top + 20,
      width: 300,
      height: band.bottom - band.top - 40,
    };
    const p = cardPlacement(huge, band, window, "highlight");
    expect(p.kind).toBe("center");
    expect(MIN_CARD_HEIGHT).toBeGreaterThan(40);
  });

  it("the note sits above the tab bar; fallback and intro are centered", () => {
    expect(cardPlacement(null, band, window, "note")).toMatchObject({
      kind: "bottom",
      bottom: 852 - band.bottom + CARD_GAP,
    });
    expect(cardPlacement(null, band, window, "center").kind).toBe("center");
    expect(cardPlacement(null, band, window, "highlight").kind).toBe("center");
  });
});

it("sameRect tolerates one point of jitter only", () => {
  const a = { x: 10, y: 10, width: 100, height: 40 };
  expect(sameRect(a, { ...a, y: 10.8 })).toBe(true);
  expect(sameRect(a, { ...a, y: 12 })).toBe(false);
});

it("dimRects cover everything but the spotlight", () => {
  const spot = { x: 20, y: 200, width: 300, height: 60 };
  const rects = dimRects(spot, window);
  const area = rects.reduce((s, r) => s + r.width * r.height, 0);
  expect(area).toBe(window.width * window.height - spot.width * spot.height);
  for (const r of rects) {
    const overlapX = Math.max(
      0,
      Math.min(r.x + r.width, spot.x + spot.width) - Math.max(r.x, spot.x),
    );
    const overlapY = Math.max(
      0,
      Math.min(r.y + r.height, spot.y + spot.height) - Math.max(r.y, spot.y),
    );
    expect(overlapX * overlapY).toBe(0);
  }
});
