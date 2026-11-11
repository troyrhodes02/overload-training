import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/app/(app)/plan/import/actions", () => ({
  getImportStatusAction: jest.fn(),
  retryExtractionAction: jest.fn(),
  discardImportAction: jest.fn(),
  saveDraftEditAction: jest.fn(),
  resolveMatchAction: jest.fn(),
  stageCustomExerciseAction: jest.fn(),
  confirmImportAction: jest.fn(),
  pickLibraryExerciseAction: jest.fn(),
  searchImportLibraryAction: jest.fn(),
}));

import fs from "node:fs";
import path from "node:path";
import {
  ImportFlow,
  exerciseRowId,
  isUnresolved,
} from "@/components/plan/import/import-flow";
import type {
  DraftExercise,
  DraftField,
  ImportDraftDto,
} from "@/lib/import/draft/types";

/**
 * The review screen's responsive layout. Static markup only (no DOM library in
 * this repo): these pin the structure and the phone-preserving classes — what is
 * hidden or shown at which breakpoint — not pixels. Visual checks happen in the
 * browser.
 */

const num = (
  value: number | null,
  status: DraftField<number>["status"] = "explicit",
): DraftField<number> => ({
  value,
  raw: String(value),
  status,
  evidence: null,
});
const str = (value: string): DraftField<string> => ({
  value,
  raw: value,
  status: "explicit",
  evidence: null,
});

function exercise(key: string, match: DraftExercise["match"]): DraftExercise {
  return {
    key,
    match,
    sets: num(3),
    repMin: num(8),
    repMax: num(10),
    context: [{ label: "Load", value: "185 lb" }],
  };
}

const matched = exercise("e1", {
  kind: "matched",
  exerciseId: "x1",
  name: "Barbell Bench Press",
});
const ambiguous = exercise("e2", {
  kind: "ambiguous",
  raw: "Press",
  candidates: [
    { exerciseId: "a", name: "Overhead Press" },
    { exerciseId: "b", name: "Incline Dumbbell Press" },
  ],
});
const unknown = exercise("e3", { kind: "unknown", raw: "Zottman curl" });

function draft(exercises: DraftExercise[]): ImportDraftDto {
  return {
    version: 1,
    title: str("Push Pull Legs"),
    days: [{ key: "d1", label: str("Push Day 1"), exercises }],
    issues: [],
  };
}

function render(d: ImportDraftDto) {
  return renderToStaticMarkup(
    <ImportFlow
      sessionId="s1"
      initialStatus={{
        sessionId: "s1",
        status: "review",
        step: "review",
        errorCode: null,
      }}
      initialDraft={d}
      source={[
        {
          position: 0,
          text: "Push\nBench 3x8",
          url: null,
          contentType: null,
          pageCount: null,
        },
      ]}
      mesocycleId={null}
    />,
  );
}

describe("review layout — shell and structure", () => {
  it("opts the page into the wide region; the shell widens only for that marker", () => {
    expect(render(draft([matched]))).toContain("data-wide-page");
    const shell = fs.readFileSync(
      path.join(__dirname, "../../src/components/shell/app-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain("max-w-screen-sm");
    expect(shell).toContain("has-[[data-wide-page]]:max-w-screen-2xl");
  });

  it("puts the source in a labelled, pinned side panel at xl+, hidden on phones", () => {
    const html = render(draft([matched]));
    expect(html).toMatch(
      /<aside[^>]*aria-label="Your source"[^>]*class="[^"]*hidden[^"]*xl:sticky[^"]*xl:block[^"]*xl:overflow-y-auto/,
    );
    // below xl the source opens from the existing button
    expect(html).toMatch(/xl:hidden[^>]*>View source/);
  });

  it("keeps Create plan reachable: pinned footer at md+, in-flow on phones", () => {
    const html = render(draft([matched]));
    expect(html).toContain("Create plan");
    expect(html).toMatch(/md:sticky md:bottom-0[^"]*md:backdrop-blur/);
    expect(html).toContain("Looks ready.");
  });

  it("shows the header day/exercise summary only from xl up", () => {
    const html = render(draft([matched, ambiguous]));
    expect(html).toMatch(/hidden[^>]*xl:inline[^>]*>1 day ·/);
    expect(html).toContain("2 exercises");
  });
});

describe("review layout — unresolved matches", () => {
  const html = render(draft([matched, ambiguous, unknown]));

  it("flags unresolved rows and counts them", () => {
    expect(html).toMatch(/id="import-ex-e2"[^>]*data-unresolved="true"/);
    expect(html).toMatch(/id="import-ex-e3"[^>]*data-unresolved="true"/);
    expect(html).not.toMatch(/id="import-ex-e1"[^>]*data-unresolved/);
    expect(html).toContain("Next unresolved (2)");
    expect(html).toContain("2 to resolve");
    expect(html).toContain("2 items need attention");
  });

  it("collapses suggestions behind an accessible disclosure at md+, still listed on phones", () => {
    expect(html).toMatch(
      /<button[^>]*aria-expanded="false"[^>]*aria-controls="match-panel-e2"[^>]*>Choose match \(2\)/,
    );
    // the radio list is in the DOM for phones, and hidden at md+ until opened
    expect(html).toMatch(
      /id="match-panel-e2"[^>]*role="radiogroup"[^>]*class="[^"]*md:hidden/,
    );
    expect(html).toContain("Overhead Press");
    expect(html).toContain("Incline Dumbbell Press");
  });

  it("offers the custom-exercise form on demand at md+, immediately on phones", () => {
    expect(html).toContain("Create custom exercise…");
    expect(html).toMatch(
      /<div class="md:hidden"><div class="space-y-2 rounded-md/,
    );
  });

  it("with everything resolved there is no jump control and the plan can be created", () => {
    const ok = render(draft([matched]));
    expect(ok).not.toContain("Next unresolved");
    expect(ok).not.toContain("need attention");
  });
});

describe("isUnresolved / exerciseRowId", () => {
  it("is true for ambiguous, unknown, or a needed field", () => {
    expect(isUnresolved(matched)).toBe(false);
    expect(isUnresolved(ambiguous)).toBe(true);
    expect(isUnresolved(unknown)).toBe(true);
    expect(isUnresolved({ ...matched, sets: num(null, "needed") })).toBe(true);
    expect(
      isUnresolved({
        ...matched,
        match: {
          kind: "custom_staged",
          name: "X",
          primaryMuscle: "chest",
          equipmentType: "barbell",
        },
      }),
    ).toBe(false);
  });
  it("derives a stable row id", () => {
    expect(exerciseRowId("e2")).toBe("import-ex-e2");
  });
});

describe("Create plan — navigation, duplicate-submit and discard guards", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../src/components/plan/import/import-flow.tsx"),
    "utf8",
  );
  const confirm = src.slice(
    src.indexOf("async function onConfirm()"),
    src.indexOf("async function onDiscard()"),
  );

  it("goes straight to the saved plan by its real id", () => {
    expect(confirm).toContain(
      "router.push(`/plan/${res.data.mesocycleId}?created=1`)",
    );
    // the old push back to the import page (which left the review open) is gone
    expect(confirm).not.toContain("/plan/import?session=");
  });

  it("blocks a second submit with a ref, and disables the controls after success", () => {
    expect(confirm).toMatch(/if \(submitting\.current \|\| created\) return;/);
    expect(confirm).toContain("setCreated(true)");
    // success never re-enables the form before navigating
    expect(confirm.indexOf("setCreated(true)")).toBeLessThan(
      confirm.indexOf("setBusy(false)"),
    );
    expect(src).toContain("disabled={busy || blocked || created}");
  });

  it("makes Discard a confirmed, unfinished-import-only action", () => {
    expect(render(draft([matched]))).toContain("Discard");
    expect(src).toContain("Discard this import?");
    expect(src).toContain("Nothing has been added to your plans yet.");
    expect(src).toMatch(
      /async function onDiscard\(\) \{\s*if \(created\) return;/,
    );
  });
});

describe("search library", () => {
  it("offers Search library on an ambiguous and an unknown row", () => {
    const html = render(draft([ambiguous, unknown]));
    expect(html.match(/Search library/g)?.length).toBe(2);
    // Suggestions and Create custom are still there.
    expect(html).toContain("Overhead Press");
    expect(html).toContain("Create custom");
  });

  it("lets a matched row be changed", () => {
    const html = render(draft([matched]));
    expect(html).toMatch(/>Change<\/button>/);
  });

  it("picks through the server-checked action", () => {
    const flow = fs.readFileSync(
      path.join(process.cwd(), "src/components/plan/import/import-flow.tsx"),
      "utf8",
    );
    expect(flow).toContain("pickLibraryExerciseAction({");
  });
});

describe("Plan page import entry", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "src/app/(app)/plan/page.tsx"),
    "utf8",
  );

  it("sits on its own below the New mesocycle / Clone previous actions", () => {
    const actions = page.slice(
      page.lastIndexOf("<StickyActions>"),
      page.lastIndexOf("</StickyActions>"),
    );
    expect(actions).not.toContain("ImportEntry");
    expect(page.lastIndexOf("<ImportEntry")).toBeGreaterThan(
      page.lastIndexOf("</StickyActions>"),
    );
  });
});
