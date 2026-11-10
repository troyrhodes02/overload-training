import { ExtractedPlanObservationSchema } from "./schema";
import type {
  ExtractionRequest,
  ExtractionResult,
  PlanExtractionPort,
} from "./port";
import { PROMPT_VERSION } from "./prompt";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the in-memory extraction
 * port used by every test and by any run without a real provider. It makes NO
 * network call and costs nothing: the whole slice is proven against this mock,
 * and real-provider accuracy is reported UNVERIFIED (owner-gated) rather than
 * faked (spec §14.12).
 *
 * The mock is scripted: you hand it an ordered list of canned results (or a
 * function that produces one per request) and it returns them in order. It still
 * validates its success payloads against the SAME strict schema the real port
 * uses, so a test fixture that drifts from the schema fails loudly here instead
 * of pretending.
 */

export type MockScript =
  | ExtractionResult
  | ((request: ExtractionRequest, attempt: number) => ExtractionResult);

export class MockPlanExtractionPort implements PlanExtractionPort {
  private attempt = 0;
  readonly requests: ExtractionRequest[] = [];

  constructor(private readonly script: MockScript | MockScript[]) {}

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    this.requests.push(request);
    // Honour cancellation like the real port.
    if (request.signal.aborted) {
      return {
        ok: false,
        code: "cancelled",
        retryable: false,
      };
    }
    const step = Array.isArray(this.script)
      ? (this.script[Math.min(this.attempt, this.script.length - 1)] ??
        this.script[this.script.length - 1])
      : this.script;
    const result =
      typeof step === "function" ? step(request, this.attempt) : step;
    this.attempt += 1;

    if (result.ok) {
      // The mock holds itself to the real schema so fixtures can't drift.
      ExtractedPlanObservationSchema.parse(result.observation);
      return {
        ...result,
        promptVersion: result.promptVersion ?? PROMPT_VERSION,
      };
    }
    return result;
  }
}

/** A convenience success wrapper with the current prompt version filled in. */
export function mockSuccess(
  observation: unknown,
  opts: {
    modelId?: string;
    inputTokens?: number;
    outputTokens?: number;
  } = {},
): ExtractionResult {
  return {
    ok: true,
    observation: ExtractedPlanObservationSchema.parse(observation),
    modelId: opts.modelId ?? "mock-model",
    promptVersion: PROMPT_VERSION,
    usage:
      opts.inputTokens != null && opts.outputTokens != null
        ? { inputTokens: opts.inputTokens, outputTokens: opts.outputTokens }
        : null,
  };
}
