import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/log/ls-1/le-1/swap",
}));
jest.mock("@/app/(app)/log/actions", () => ({
  swapExerciseAction: jest.fn(),
}));

import { SwapPicker } from "@/components/logging/swap-picker";
import type { SwapContextDto } from "@/lib/logging/queries";

/**
 * Workout Logging Refinements (design Screen 3; RD-6): the picker opens on the
 * planned muscle, names it as "Planned", offers a Muscle group select, and an
 * empty group keeps the select so the lifter can leave it.
 */
const base: SwapContextDto = {
  loggedExerciseId: "le-1",
  plannedExerciseName: "Cable Fly",
  plannedMuscle: "chest",
  primaryMuscleLabel: "Chest",
  selectedMuscle: "chest",
  selectedMuscleLabel: "Chest",
  swapLocked: false,
  candidates: [
    { id: "a", name: "Incline Dumbbell Press", isFavorite: true },
    { id: "b", name: "Push-Up", isFavorite: false },
  ],
};
const render = (c: SwapContextDto) =>
  renderToStaticMarkup(<SwapPicker context={c} loggedSessionId="ls-1" />);

describe("SwapPicker", () => {
  it("opens on the planned muscle with a Muscle group select and the list", () => {
    const html = render(base);
    expect(html).toContain("Planned: Chest");
    expect(html).toContain("Muscle group");
    expect(html).toContain('id="swap-muscle"');
    expect(html).toContain("Incline Dumbbell Press");
    expect(html).not.toMatch(/Same muscle|Crossing muscle groups/);
  });

  it("an empty group names it and keeps the select", () => {
    const html = render({
      ...base,
      selectedMuscle: "neck",
      selectedMuscleLabel: "Neck",
      candidates: [],
    });
    expect(html).toContain("No active exercises for Neck.");
    expect(html).toContain(
      "Pick another muscle group, or add one in the library.",
    );
    expect(html).toContain('id="swap-muscle"');
  });

  it("locked once a set is logged: no select, no list", () => {
    const html = render({ ...base, swapLocked: true });
    expect(html).toContain("Sets are logged — this exercise is locked.");
    expect(html).not.toContain('id="swap-muscle"');
  });
});
