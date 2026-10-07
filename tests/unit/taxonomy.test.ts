import fs from "node:fs";
import path from "node:path";
import { Equipment, MuscleGroup } from "@prisma/client";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TYPES,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  isEquipment,
  isMuscleGroup,
} from "@/lib/exercises/taxonomy";

describe("canonical exercise taxonomy", () => {
  it("muscle groups match the Prisma MuscleGroup enum exactly", () => {
    expect([...MUSCLE_GROUPS].sort()).toEqual(
      Object.values(MuscleGroup).sort(),
    );
  });

  it("equipment types match the Prisma Equipment enum exactly", () => {
    expect([...EQUIPMENT_TYPES].sort()).toEqual(
      Object.values(Equipment).sort(),
    );
  });

  it("every value has a non-empty, unique label", () => {
    const muscleLabels = MUSCLE_GROUPS.map((m) => MUSCLE_GROUP_LABELS[m]);
    const equipmentLabels = EQUIPMENT_TYPES.map((e) => EQUIPMENT_LABELS[e]);
    for (const labels of [muscleLabels, equipmentLabels]) {
      expect(labels.every((l) => l.trim().length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("uses the pitch's primary vocabulary (Back, Quads, Core)", () => {
    expect(MUSCLE_GROUP_LABELS.back).toBe("Back");
    expect(MUSCLE_GROUP_LABELS.quads).toBe("Quads");
    expect(MUSCLE_GROUP_LABELS.core).toBe("Core");
  });

  it("type guards accept canonical values and reject source/raw values", () => {
    expect(isMuscleGroup("back")).toBe(true);
    expect(isMuscleGroup("lats")).toBe(false);
    expect(isMuscleGroup("middle back")).toBe(false);
    expect(isMuscleGroup(undefined)).toBe(false);
    expect(isEquipment("plate_loaded")).toBe(true);
    expect(isEquipment("body only")).toBe(false);
    expect(isEquipment(null)).toBe(false);
  });

  it("the taxonomy module stays client-safe (no Prisma or server import)", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "..", "src/lib/exercises/taxonomy.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](@prisma\/client|server-only)/);
    expect(source).not.toMatch(/@\/lib\/db/);
  });
});
