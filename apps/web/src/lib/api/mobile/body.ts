import "server-only";
import { ApiFailure } from "./errors";

/**
 * Read a mobile API request body as a JSON object (Pitch 21d spec §16). A body
 * over `maxBytes`, anything that isn't JSON, and any JSON that isn't a plain
 * object are a 400 `validation_error`. Unknown fields are left for the handler
 * to ignore; field types are checked by the module the handler calls.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const invalid = () =>
    new ApiFailure("validation_error", "Send a JSON object as the body.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw invalid();
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw invalid();
  }
  if (new TextEncoder().encode(text).length > maxBytes) throw invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid();
  }
  return parsed as Record<string, unknown>;
}
