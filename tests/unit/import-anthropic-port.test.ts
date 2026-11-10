import Anthropic from "@anthropic-ai/sdk";
import {
  AnthropicPlanExtractionPort,
  MAX_OUTPUT_TOKENS,
  effortFor,
} from "@/lib/import/extraction/anthropic";
import type { ExtractionPart } from "@/lib/import/extraction/port";
import { formatDiagnostic } from "@/lib/import/diagnostics";
import { providerMayHaveBilled } from "@/lib/import/provider-billing";
import { extractionFailureCopy } from "@/lib/import/failure-copy";

/**
 * The Anthropic extraction port against a MOCKED SDK client: no network, no
 * spend. It proves how every provider outcome maps to a failure code, and
 * especially that a TRUNCATED answer (stop_reason max_tokens) is no longer
 * reported as an unreadable one.
 */

const f = (raw: string | null) => ({ raw, legible: true, evidence: null });
const planJson = {
  isWorkoutPlan: true,
  title: f("Plan"),
  days: [
    {
      order: 0,
      label: f("Monday"),
      notes: f(null),
      exercises: [
        {
          order: 0,
          groupLabel: f(null),
          name: f("Barbell Bench Press"),
          sets: f("3"),
          reps: f("8"),
          load: f(null),
          rest: f(null),
          tempo: f(null),
          notes: f(null),
          alternativeReadings: [],
        },
      ],
    },
  ],
  generalNotes: f(null),
  unreadable: [],
  contradictions: [],
};

function message(over: Record<string, unknown> = {}) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(planJson) }],
    usage: { input_tokens: 2672, output_tokens: 4222 },
    ...over,
  };
}

function port(create: jest.Mock) {
  return new AnthropicPlanExtractionPort({ messages: { create } } as never);
}
const request = (parts: ExtractionPart[]) => ({
  parts,
  signal: new AbortController().signal,
});
const TEXT: ExtractionPart[] = [
  { kind: "text", index: 0, text: "Monday\nBench 3x8" },
];

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.PLAN_IMPORT_MODEL;
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.PLAN_IMPORT_MODEL = "claude-sonnet-5-5";
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = KEY;
  if (MODEL === undefined) delete process.env.PLAN_IMPORT_MODEL;
  else process.env.PLAN_IMPORT_MODEL = MODEL;
});

describe("a valid provider answer", () => {
  it("yields a validated observation with usage, via create() + our own parse", async () => {
    const create = jest.fn().mockResolvedValue(message());
    const res = await port(create).extract(request(TEXT));
    expect(res).toMatchObject({
      ok: true,
      modelId: "claude-sonnet-5-5",
      usage: { inputTokens: 2672, outputTokens: 4222 },
    });
    if (res.ok)
      expect(res.observation.days[0].exercises[0].name.raw).toBe(
        "Barbell Bench Press",
      );
  });

  it("requests low effort and the enlarged output budget", async () => {
    const create = jest.fn().mockResolvedValue(message());
    await port(create).extract(request(TEXT));
    const body = create.mock.calls[0][0];
    expect(body.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThan(8000);
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("omits effort for models that reject it", () => {
    expect(effortFor("claude-sonnet-5-5")).toBe("low");
    expect(effortFor("claude-opus-4-8")).toBe("low");
    expect(effortFor("claude-haiku-5-5")).toBe("low");
    expect(effortFor("claude-haiku-4-5")).toBeUndefined();
    expect(effortFor("claude-sonnet-4-5")).toBeUndefined();
  });
});

describe("request construction per source kind", () => {
  it("sends text parts (including a text-layer PDF's extracted text) as text blocks", async () => {
    const create = jest.fn().mockResolvedValue(message());
    await port(create).extract(
      request([
        { kind: "text", index: 0, text: "--- PAGE 1 ---\nBench Press 3x8" },
      ]),
    );
    const content = create.mock.calls[0][0].messages[0].content;
    expect(
      content.some(
        (b: { type: string; text?: string }) =>
          b.type === "text" && b.text?.includes("--- PAGE 1 ---"),
      ),
    ).toBe(true);
    expect(content.some((b: { type: string }) => b.type === "document")).toBe(
      false,
    );
  });

  it("sends a scanned PDF as a supported base64 document block", async () => {
    const create = jest.fn().mockResolvedValue(message());
    const bytes = new Uint8Array(Buffer.from("%PDF-1.4 fake"));
    await port(create).extract(
      request([{ kind: "pdf", index: 0, bytes, pageCount: 1 }]),
    );
    const doc = create.mock.calls[0][0].messages[0].content.find(
      (b: { type: string }) => b.type === "document",
    );
    expect(doc.source).toEqual({
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from(bytes).toString("base64"),
    });
  });
});

describe("failures are distinguished, not collapsed", () => {
  const run = (m: unknown) =>
    port(jest.fn().mockResolvedValue(m)).extract(request(TEXT));

  it("a TRUNCATED answer (max_tokens) is output_truncated, even with partial JSON", async () => {
    const partial = JSON.stringify(planJson).slice(0, 200);
    const res = await run(
      message({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: partial }],
      }),
    );
    expect(res).toEqual({
      ok: false,
      code: "output_truncated",
      retryable: false,
    });
  });

  it("invalid JSON, a schema violation, and an empty answer are malformed_output", async () => {
    for (const content of [
      [{ type: "text", text: "not json at all" }],
      [{ type: "text", text: JSON.stringify({ ...planJson, invented: true }) }],
      [{ type: "text", text: JSON.stringify({ isWorkoutPlan: true }) }],
      [],
    ]) {
      const res = await run(message({ content }));
      expect(res).toEqual({
        ok: false,
        code: "malformed_output",
        retryable: false,
      });
    }
  });

  it("a refusal is provider_rejected", async () => {
    expect(await run(message({ stop_reason: "refusal" }))).toMatchObject({
      ok: false,
      code: "provider_rejected",
    });
  });

  it("maps HTTP, timeout and transport errors to retryable/terminal codes", async () => {
    const api = (status: number) =>
      Anthropic.APIError.generate(
        status,
        { type: "error" },
        "x",
        new Headers(),
      );
    const codeFor = async (err: unknown) =>
      port(jest.fn().mockRejectedValue(err)).extract(request(TEXT));
    expect(await codeFor(api(429))).toMatchObject({
      code: "provider_rate_limited",
      retryable: true,
    });
    expect(await codeFor(api(503))).toMatchObject({
      code: "provider_unavailable",
      retryable: true,
    });
    expect(await codeFor(api(401))).toMatchObject({
      code: "provider_unauthorized",
      retryable: false,
    });
    expect(await codeFor(api(400))).toMatchObject({
      code: "provider_rejected",
      retryable: false,
    });
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(await codeFor(abort)).toMatchObject({
      code: "provider_timeout",
      retryable: true,
    });
    // an unexpected fault escaping the call is transport, not "bad output"
    expect(await codeFor(new TypeError("fetch failed"))).toMatchObject({
      code: "provider_unavailable",
      retryable: true,
    });
  });

  it("without an API key it never calls the provider", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const create = jest.fn();
    expect(await port(create).extract(request(TEXT))).toMatchObject({
      code: "provider_unconfigured",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("the diagnostics formatter has no free-text field and drops unknown stop reasons", () => {
    const line = formatDiagnostic({
      event: "extraction_failed",
      code: "output_truncated",
      stopReason: "Bench Press 3x8 secret",
      inputTokens: 10,
      outputTokens: 20.9,
      elapsedMs: 1234,
    });
    expect(line).toBe(
      "plan-import: extraction_failed code=output_truncated stop=none in=10 out=20 ms=1234",
    );
  });

  it("logs codes, stop reason and token counts only — never source text", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await run(message({ stop_reason: "max_tokens" }));
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("code=output_truncated");
    expect(logged).toContain("stop=max_tokens");
    expect(logged).toContain("out=4222");
    expect(logged).not.toContain("Bench");
  });
});

describe("user-facing copy and billing accounting", () => {
  it("tells unreadable output, truncation, timeout and unavailability apart", () => {
    const titles = new Set(
      [
        "malformed_output",
        "output_truncated",
        "provider_timeout",
        "provider_unavailable",
        "draft_build_failed",
      ].map((c) => extractionFailureCopy(c, false).title),
    );
    expect(titles.size).toBe(5);
    expect(extractionFailureCopy("output_truncated", false).body).toMatch(
      /too long|fewer/i,
    );
    expect(extractionFailureCopy("malformed_output", false).body).toMatch(
      /couldn't use|paste the text/i,
    );
  });

  it("never claims an attempt was free or that nothing was processed", () => {
    for (const c of [
      null,
      "malformed_output",
      "output_truncated",
      "provider_timeout",
      "provider_rejected",
      "draft_build_failed",
      "provider_unavailable",
    ]) {
      for (const r of [true, false]) {
        const { title, body } = extractionFailureCopy(c, r);
        expect(`${title} ${body}`).not.toMatch(
          /charged|free of charge|nothing was (saved|charged)/i,
        );
      }
    }
  });

  it("keeps the spend reservation as spent when the provider may have billed", () => {
    for (const c of [
      "provider_timeout",
      "malformed_output",
      "output_truncated",
      "provider_rejected",
      "draft_build_failed",
    ]) {
      expect(providerMayHaveBilled(c)).toBe(true);
    }
    for (const c of [
      "provider_rate_limited",
      "provider_unavailable",
      "provider_unauthorized",
      "provider_unconfigured",
      "cancelled",
    ]) {
      expect(providerMayHaveBilled(c)).toBe(false);
    }
  });
});
