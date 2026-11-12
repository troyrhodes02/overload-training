import type { ExtractedPlanObservation } from "./schema";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the extraction port
 * (blueprint §3.3). A `PlanExtractionPort` turns a source bundle into a strict,
 * schema-validated `ExtractedPlanObservation`. It is the ONLY boundary between
 * the lifecycle/review code and any model provider: routes, Prisma, and the
 * deterministic parser never import the provider SDK, and tests inject the
 * in-memory mock instead of making a real call.
 *
 * The model call happens here and ALWAYS outside any Prisma transaction (the
 * caller enforces that). The port never touches the database, never sees an
 * account id, and never logs prompt bodies or source content.
 */

/** One part of the source bundle handed to the port. Server-derived only. */
export type ExtractionPart =
  | { kind: "text"; index: number; text: string }
  | {
      kind: "pdf";
      index: number;
      /** Raw bytes (base64 is formed inside the provider impl). */
      bytes: Uint8Array;
      pageCount?: number;
    }
  | {
      kind: "image";
      index: number;
      bytes: Uint8Array;
      mime: "image/jpeg" | "image/png" | "image/webp";
    };

export type ExtractionRequest = {
  parts: ExtractionPart[];
  /** Cooperative cancellation + hard timeout. */
  signal: AbortSignal;
};

export type ExtractionUsage = {
  inputTokens: number;
  outputTokens: number;
} | null;

export type ExtractionSuccess = {
  ok: true;
  observation: ExtractedPlanObservation;
  modelId: string;
  promptVersion: string;
  usage: ExtractionUsage;
};

/**
 * A typed failure category. `retryable` drives the state machine: a retryable
 * failure (429/5xx/timeout) can be re-attempted within bounds; a terminal one
 * (400/401/malformed/cancel/non-plan) cannot. `retryAfterMs` honours a provider
 * `Retry-After` when present.
 */
export type ExtractionErrorCode =
  | "provider_rate_limited" // 429 — retryable
  | "provider_unavailable" // 5xx / network — retryable
  | "provider_timeout" // abort/deadline — retryable
  | "provider_rejected" // 400 — terminal (bad request / too large)
  | "provider_unauthorized" // 401/403 — terminal (config problem)
  | "malformed_output" // returned, but not valid JSON / not our schema — terminal
  | "output_truncated" // hit the output-token cap mid-answer (plan too long) — terminal
  | "draft_build_failed" // the model answered, but building the review draft failed — terminal
  | "cancelled" // user cancelled — terminal
  | "provider_unconfigured"; // no API key / model — terminal

export type ExtractionFailure = {
  ok: false;
  code: ExtractionErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
};

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

export interface PlanExtractionPort {
  extract(request: ExtractionRequest): Promise<ExtractionResult>;
}
