import { renderToStaticMarkup } from "react-dom/server";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock("@/app/(app)/plan/import/actions", () => ({
  startImportAction: jest.fn(),
  addTextAction: jest.fn(),
  commitPartAction: jest.fn(),
  removePartAction: jest.fn(),
  beginExtractionAction: jest.fn(),
  getImportStatusAction: jest.fn(),
  retryExtractionAction: jest.fn(),
  discardImportAction: jest.fn(),
  saveDraftEditAction: jest.fn(),
  resolveMatchAction: jest.fn(),
  stageCustomExerciseAction: jest.fn(),
  confirmImportAction: jest.fn(),
}));

import { SourceIntake } from "@/components/plan/import/source-intake";
import { ImportFlow } from "@/components/plan/import/import-flow";
import {
  ImportGuide,
  UsageMeter,
  retryCostLine,
} from "@/components/plan/import/import-guidance";

/** The import guide, the usage meter, and what a retry costs. */

describe("usage meter", () => {
  it("shows imports left today and when they reset", () => {
    const html = renderToStaticMarkup(
      <UsageMeter usage={{ used: 2, limit: 5 }} />,
    );
    expect(html).toMatch(/3<\/span> of <span[^>]*>5<\/span> imports left/);
    expect(html).toContain("Resets at midnight");
    expect(html).toContain("width:40%");
  });

  it("says plainly when none are left", () => {
    const html = renderToStaticMarkup(
      <UsageMeter usage={{ used: 5, limit: 5 }} />,
    );
    expect(html).toContain("No imports left today");
  });
});

describe("source intake", () => {
  it("shows the guide and the meter, and Start is available with imports left", () => {
    const html = renderToStaticMarkup(
      <SourceIntake usage={{ used: 1, limit: 5 }} />,
    );
    expect(html).toContain("How to format your plan");
    expect(html).toContain("imports left");
    expect(html).toContain("<details");
  });

  it("hides the meter when usage couldn't be read", () => {
    const html = renderToStaticMarkup(<SourceIntake usage={null} />);
    expect(html).not.toContain("imports left");
  });

  it("disables Start once today's imports are used", () => {
    const html = renderToStaticMarkup(
      <SourceIntake usage={{ used: 5, limit: 5 }} />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Start import/);
  });
});

describe("the guide", () => {
  it("lists what to include and leave out, with an example", () => {
    const html = renderToStaticMarkup(<ImportGuide />);
    expect(html).toContain("Include");
    expect(html).toContain("Leave out");
    expect(html).toContain("Only the first one is kept");
    expect(html).toContain("Cardio, warm-ups, and mobility");
    expect(html).toContain("Barbell Bench Press: 3 x 5-8");
    expect(html).toContain("Up to 14 days, 20 exercises a day");
    expect(html).toContain("up to 14 days and 20 exercises a day");
  });
});

describe("retry cost", () => {
  it("states what Try again uses", () => {
    expect(retryCostLine({ used: 2, limit: 5 })).toBe(
      "Trying again uses one of today's imports (3 left).",
    );
    expect(retryCostLine({ used: 5, limit: 5 })).toMatch(/reset at midnight/);
    expect(retryCostLine(null)).toBeNull();
  });

  it("appears under Try again on a retryable failure", () => {
    const html = renderToStaticMarkup(
      <ImportFlow
        sessionId="s1"
        initialStatus={{
          sessionId: "s1",
          status: "failed_retryable",
          step: "processing" as never,
          errorCode: "provider_timeout",
        }}
        initialDraft={null}
        source={[]}
        mesocycleId={null}
        usage={{ used: 1, limit: 5 }}
      />,
    );
    expect(html).toContain(
      "Trying again uses one of today&#x27;s imports (4 left).",
    );
  });
});
