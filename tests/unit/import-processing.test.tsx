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
import { ImportFlow } from "@/components/plan/import/import-flow";

/** The processing / failure screens, by recorded status and failure code. */

function render(status: string, errorCode: string | null, step = "processing") {
  return renderToStaticMarkup(
    <ImportFlow
      sessionId="s1"
      initialStatus={{
        sessionId: "s1",
        status,
        step: step as never,
        errorCode,
      }}
      initialDraft={null}
      source={[]}
      mesocycleId={null}
    />,
  );
}

describe("processing screens", () => {
  it("shows an accessible working state with an honest expectation while extracting", () => {
    const html = render("extracting", null);
    expect(html).toContain('role="status"');
    expect(html).toContain("Reading your plan…");
    expect(html).toContain("Longer plans can take a few minutes");
    // reduced-motion respected
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("motion-safe:animate-pulse");
  });

  it("failure screens say what actually happened, by code", () => {
    expect(render("failed_final", "output_truncated")).toContain(
      "This plan is too long to read at once",
    );
    expect(render("failed_final", "malformed_output")).toContain(
      "We couldn&#x27;t use the result",
    );
    expect(render("failed_retryable", "provider_timeout")).toContain(
      "This took too long",
    );
    expect(render("failed_retryable", "provider_unavailable")).toContain(
      "Plan extraction is busy",
    );
    expect(render("failed_final", "draft_build_failed")).toContain(
      "We couldn&#x27;t build the review",
    );
  });

  it("a retryable failure offers Try again; a final one does not", () => {
    expect(render("failed_retryable", "provider_timeout")).toContain(
      "Try again",
    );
    expect(render("failed_final", "output_truncated")).not.toContain(
      ">Try again<",
    );
  });

  it("never claims the attempt was free or that nothing was processed", () => {
    for (const [s, c] of [
      ["failed_final", "malformed_output"],
      ["failed_final", "output_truncated"],
      ["failed_retryable", "provider_timeout"],
      ["failed_final", null],
      ["not_a_plan", null],
    ] as const) {
      expect(render(s, c)).not.toMatch(/charged|nothing was saved/i);
    }
  });
});

describe("the Try again button no longer looks stuck", () => {
  const flow = fs.readFileSync(
    path.join(__dirname, "../../src/components/plan/import/import-flow.tsx"),
    "utf8",
  );
  const page = fs.readFileSync(
    path.join(__dirname, "../../src/app/(app)/plan/import/page.tsx"),
    "utf8",
  );

  it("applies the status the retry returns and shows the working state meanwhile", () => {
    const retry = flow.slice(
      flow.indexOf("async function onRetry()"),
      flow.indexOf('if (\n    status.status === "extracting"'),
    );
    expect(retry).toContain("onStatus(res.data)");
    expect(retry).toContain("setRetrying(true)");
    expect(retry).toContain("setRetryError(res.error.message)");
    expect(flow).toMatch(/retrying \|\|/); // the working state renders while retrying
  });

  it("remounts the flow when the server status changes, so client state cannot lag", () => {
    expect(page).toContain("key={`${status.status}:${status.errorCode ??");
  });

  it("lets the route run as long as an extraction may", () => {
    expect(page).toMatch(/export const maxDuration = 300;/);
    const extract = fs.readFileSync(
      path.join(process.cwd(), "src/lib/import/extract.ts"),
      "utf8",
    );
    // The provider call is bounded well inside the route's limit.
    const ms = Number(
      /EXTRACTION_TIMEOUT_MS = ([\d_]+);/.exec(extract)![1].replace(/_/g, ""),
    );
    expect(ms).toBeLessThanOrEqual(300_000 - 45_000);
  });
});
