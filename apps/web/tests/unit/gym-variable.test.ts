import {
  isGymVariable,
  GYM_VARIABLE_EQUIPMENT,
} from "@/lib/exercises/gym-variable";
import { EQUIPMENT_TYPES } from "@/lib/exercises/taxonomy";

/**
 * The single gym-variable authority (Resolved Decisions 40–41): machine and
 * cable only, decided from equipmentType alone.
 */
describe("isGymVariable", () => {
  it("is true for machine and cable", () => {
    expect(isGymVariable({ equipmentType: "machine" })).toBe(true);
    expect(isGymVariable({ equipmentType: "cable" })).toBe(true);
  });

  it("is false for free weights and plate-loaded machines", () => {
    for (const eq of [
      "barbell",
      "ez_bar",
      "dumbbell",
      "kettlebell",
      "plate_loaded",
      "bodyweight",
      "band",
      "medicine_ball",
      "exercise_ball",
      "foam_roller",
      "other",
    ] as const) {
      expect(isGymVariable({ equipmentType: eq })).toBe(false);
    }
  });

  it("classifies every canonical equipment value exactly once", () => {
    const variable = EQUIPMENT_TYPES.filter((e) =>
      isGymVariable({ equipmentType: e }),
    );
    expect(variable.sort()).toEqual([...GYM_VARIABLE_EQUIPMENT].sort());
  });
});
