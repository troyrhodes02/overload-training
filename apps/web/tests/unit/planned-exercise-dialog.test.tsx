/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The session builder's exercise dialog on a phone (production report,
 * 2026-11-18): tapping a planned exercise opened the dialog with the Sets
 * field focused, the phone's keyboard rose over the bottom half of a fixed,
 * non-scrolling dialog, and Replace exercise and Remove from session — the
 * reason to open it after choosing the wrong exercise — couldn't be reached.
 *
 * On a touch screen, editing now opens with no field focused and the dialog
 * scrolls within the viewport. With a mouse, Sets is focused as before.
 */

const removeSessionExerciseAction = jest.fn();
const updateSessionExerciseAction = jest.fn();
const addSessionExerciseAction = jest.fn();
jest.mock("@/app/(app)/plan/actions", () => ({
  removeSessionExerciseAction: (...a: unknown[]) =>
    removeSessionExerciseAction(...a),
  updateSessionExerciseAction: (...a: unknown[]) =>
    updateSessionExerciseAction(...a),
  addSessionExerciseAction: (...a: unknown[]) => addSessionExerciseAction(...a),
}));
jest.mock("next/link", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
      createElement("a", { href, ...rest }, children),
  };
});
jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }),
}));

import { PlannedExerciseDialog } from "@/components/plan/planned-exercise-dialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const exercise = {
  name: "Barbell Bench Press",
  primaryMuscleLabel: "Chest",
  equipmentLabel: "Barbell",
};
const editMode = {
  kind: "edit" as const,
  sessionExerciseId: "se-1",
  sessionName: "Push Day 1",
  replaceHref: "/plan/m-1/sessions/s-1/add?replace=se-1",
  plannedSets: 3,
  targetRepMin: 6,
  targetRepMax: 8,
};

let host: HTMLDivElement;
let root: Root;
let onOpenChange: jest.Mock;

async function open(mode: Parameters<typeof PlannedExerciseDialog>[0]["mode"]) {
  onOpenChange = jest.fn();
  await act(async () => {
    root.render(
      <PlannedExerciseDialog
        open
        onOpenChange={onOpenChange}
        exercise={exercise}
        mode={mode}
      />,
    );
  });
  // Radix moves focus on the next frame.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}

const button = (name: string) =>
  [...document.querySelectorAll<HTMLElement>("button, a")].find(
    (el) => el.textContent?.trim() === name,
  )!;

beforeEach(() => {
  jest.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

describe("editing a planned exercise on a phone", () => {
  beforeEach(() => setPointer(true));

  it("opens with no field focused, so no keyboard covers the actions", async () => {
    const dialog = await open(editMode);
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("scrolls inside the viewport, with Replace and Remove inside it", async () => {
    const dialog = await open(editMode);
    expect(dialog.className).toMatch(/overflow-y-auto/);
    expect(dialog.className).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(dialog.contains(button("Replace exercise"))).toBe(true);
    expect(dialog.contains(button("Remove from session"))).toBe(true);
  });

  it("Replace exercise goes to the library in replace mode and closes the dialog", async () => {
    await open(editMode);
    const replace = button("Replace exercise");
    expect(replace.getAttribute("href")).toBe(
      "/plan/m-1/sessions/s-1/add?replace=se-1",
    );
    await act(async () => replace.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Remove from session removes this exercise only and closes the dialog", async () => {
    removeSessionExerciseAction.mockResolvedValue({ ok: true, data: null });
    await open(editMode);
    await act(async () => button("Remove from session").click());
    expect(removeSessionExerciseAction).toHaveBeenCalledWith("se-1");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("a refused remove keeps the dialog open and says why", async () => {
    removeSessionExerciseAction.mockResolvedValue({
      ok: false,
      error: {
        code: "not_found",
        message: "That exercise isn't in this session.",
      },
    });
    const dialog = await open(editMode);
    await act(async () => button("Remove from session").click());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(dialog.textContent).toContain(
      "That exercise isn't in this session.",
    );
  });

  it("Cancel closes without saving or removing", async () => {
    await open(editMode);
    await act(async () => button("Cancel").click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(removeSessionExerciseAction).not.toHaveBeenCalled();
    expect(updateSessionExerciseAction).not.toHaveBeenCalled();
  });

  it("the fields still work: a change saves through the same action", async () => {
    updateSessionExerciseAction.mockResolvedValue({ ok: true, data: null });
    await open(editMode);
    const sets = document.querySelector<HTMLInputElement>("#pe-plannedSets")!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setValue.call(sets, "4");
      sets.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Save").click());
    expect(updateSessionExerciseAction).toHaveBeenCalledWith({
      sessionExerciseId: "se-1",
      plannedSets: "4",
      targetRepMin: "6",
      targetRepMax: "8",
    });
  });

  it("adding an exercise still focuses Sets (typing is the first step)", async () => {
    await open({
      kind: "add",
      sessionId: "s-1",
      exerciseId: "e-1",
      onAdded: () => {},
    });
    expect((document.activeElement as HTMLElement | null)?.id).toBe(
      "pe-plannedSets",
    );
  });
});

describe("editing with a mouse and keyboard (desktop): unchanged", () => {
  beforeEach(() => setPointer(false));

  it("Sets is focused on open, and Replace and Remove are offered", async () => {
    const dialog = await open(editMode);
    expect((document.activeElement as HTMLElement | null)?.id).toBe(
      "pe-plannedSets",
    );
    expect(dialog.contains(button("Replace exercise"))).toBe(true);
    expect(dialog.contains(button("Remove from session"))).toBe(true);
  });
});
