import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ExtractedPlanObservationSchema,
  type ExtractedPlanObservation,
} from "./schema";
import type {
  ExtractionErrorCode,
  ExtractionPart,
  ExtractionRequest,
  ExtractionResult,
  PlanExtractionPort,
} from "./port";
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_PREAMBLE } from "./prompt";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the Anthropic
 * `PlanExtractionPort` (RD-11). SERVER-ONLY: it holds the provider key, builds
 * the request, and returns a strict schema-validated observation. It is the ONLY
 * file that imports the provider SDK.
 *
 * Decisions (recorded in the run, RD-11):
 *  - SDK: `@anthropic-ai/sdk` (pinned in package.json). Structured output via
 *    `messages.parse()` + `output_config.format` (zodOutputFormat) against the
 *    strict schema — the SDK's first-class structured-output path.
 *  - Model id is read from PLAN_IMPORT_MODEL with a sensible default; it is NOT
 *    hardcoded as fact. The default tracks the current supported model but the
 *    owner can override it per deploy. The id actually used is returned so it can
 *    be persisted (sanitized) for owner review.
 *  - Adaptive thinking is omitted (a deterministic transcription task), and no
 *    sampling params are sent.
 *  - A real AbortSignal + hard timeout bound the call; the SDK is told the model
 *    call must stay OUTSIDE any Prisma transaction (the caller enforces that).
 *  - NO prompt bodies and NO source content are ever logged. Errors are mapped
 *    to the safe taxonomy categories only.
 */

/** The model id, from env, with a current sensible default (RD-11). */
export function resolvedModelId(): string {
  const configured = process.env.PLAN_IMPORT_MODEL?.trim();
  return configured && configured.length > 0 ? configured : "claude-opus-4-8";
}

const MAX_OUTPUT_TOKENS = 8000;

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Build the user content blocks from the source parts (text + raw bytes). */
function userContent(parts: ExtractionPart[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text: USER_PREAMBLE },
  ];
  for (const part of parts) {
    if (part.kind === "text") {
      blocks.push({
        type: "text",
        text: `--- SOURCE PART ${part.index} (text) ---\n${part.text}`,
      });
    } else if (part.kind === "pdf") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: toBase64(part.bytes),
        },
      });
    } else {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: part.mime,
          data: toBase64(part.bytes),
        },
      });
    }
  }
  return blocks;
}

/** Map a provider/transport error to the safe taxonomy (never logs its body). */
function classifyError(error: unknown): {
  code: ExtractionErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
} {
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    const retryAfter = retryAfterMs(error);
    if (status === 429) {
      return {
        code: "provider_rate_limited",
        retryable: true,
        retryAfterMs: retryAfter,
      };
    }
    if (status != null && status >= 500) {
      return {
        code: "provider_unavailable",
        retryable: true,
        retryAfterMs: retryAfter,
      };
    }
    if (status === 401 || status === 403) {
      return { code: "provider_unauthorized", retryable: false };
    }
    if (status === 400 || status === 413 || status === 422) {
      return { code: "provider_rejected", retryable: false };
    }
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { code: "provider_unavailable", retryable: true };
  }
  if (
    error instanceof Anthropic.APIUserAbortError ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return { code: "provider_timeout", retryable: true };
  }
  // Anything else (including schema validation / parse failures) is terminal.
  return { code: "malformed_output", retryable: false };
}

function retryAfterMs(
  error: InstanceType<typeof Anthropic.APIError>,
): number | undefined {
  const headers = (error as { headers?: unknown }).headers;
  let raw: string | null | undefined;
  if (headers && typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get("retry-after");
  } else if (headers && typeof headers === "object") {
    raw = (headers as Record<string, string>)["retry-after"];
  }
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : undefined;
}

export class AnthropicPlanExtractionPort implements PlanExtractionPort {
  private readonly client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      // Defer the "unconfigured" decision to extract() so construction never
      // throws into a request; mirrors the fail-closed kill-switch posture.
      this.client = new Anthropic({ apiKey: "" });
    } else {
      this.client = new Anthropic({ apiKey });
    }
  }

  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      return { ok: false, code: "provider_unconfigured", retryable: false };
    }
    const modelId = resolvedModelId();
    try {
      const message = await this.client.messages.parse(
        {
          model: modelId,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_PROMPT,
          output_config: {
            format: zodOutputFormat(ExtractedPlanObservationSchema),
          },
          messages: [{ role: "user", content: userContent(request.parts) }],
        },
        { signal: request.signal },
      );

      if (message.stop_reason === "refusal") {
        return { ok: false, code: "provider_rejected", retryable: false };
      }
      const parsed = message.parsed_output as ExtractedPlanObservation | null;
      if (parsed == null) {
        return { ok: false, code: "malformed_output", retryable: false };
      }
      // Defence in depth: re-validate against the strict schema. The model must
      // not smuggle extra fields past the SDK's parse.
      const observation = ExtractedPlanObservationSchema.parse(parsed);
      return {
        ok: true,
        observation,
        modelId,
        promptVersion: PROMPT_VERSION,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    } catch (error) {
      return { ok: false, ...classifyError(error) };
    }
  }
}
