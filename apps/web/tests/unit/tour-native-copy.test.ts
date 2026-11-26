import { TOUR_STEPS } from "@/lib/tour/steps";
import {
  TOUR_CONTENT,
  TOUR_LOGGING_NO_START_BODY,
  TOUR_NATIVE_BODIES,
  TOUR_NATIVE_INTRO,
} from "@overload/shared/tour/content";

/**
 * Pitch 21k (spec §7.5, RD-3): every tour sentence for both clients lives in
 * @overload/shared/tour/content. The web's no-Start logging body moved there
 * verbatim, and the native adaptations sit beside the canonical words.
 */
describe("shared tour copy (Pitch 21k)", () => {
  it("the web's no-Start logging body is the shared sentence, unchanged", () => {
    expect(TOUR_LOGGING_NO_START_BODY).toBe(
      "When a workout is planned, it appears here with a Start button. Each exercise gets its own card where you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload.",
    );
    const logging = TOUR_STEPS.find((s) => s.id === "logging");
    expect(logging?.targets.map((t) => t.body)).toEqual([
      undefined,
      TOUR_LOGGING_NO_START_BODY,
    ]);
  });

  it("native adaptations exist only for real step ids, and only three", () => {
    const ids = TOUR_CONTENT.map((s) => s.id) as string[];
    expect(Object.keys(TOUR_NATIVE_BODIES).sort()).toEqual([
      "navigation",
      "plan",
      "settings",
    ]);
    for (const id of Object.keys(TOUR_NATIVE_BODIES)) expect(ids).toContain(id);
  });

  it("native copy follows the tour's plain-copy rules", () => {
    const texts = [
      ...Object.values(TOUR_NATIVE_BODIES),
      ...Object.values(TOUR_NATIVE_INTRO),
    ];
    for (const text of texts) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(text).not.toMatch(/!|\bsimply\b/i);
    }
    // The intro says the tour changes nothing and can be skipped (RD-E).
    expect(TOUR_NATIVE_INTRO.body).toMatch(/nothing in your training changes/);
    expect(TOUR_NATIVE_INTRO.body).toMatch(/skip/);
  });
});
