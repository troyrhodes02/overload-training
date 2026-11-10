/**
 * Workout Plan Import & Review — what the Processing step tells the lifter when
 * an extraction attempt failed, chosen from the recorded failure code. Pure and
 * client-safe. Never names the provider, a status code, or an internal.
 */
export type FailureCopy = { title: string; body: string };

export function extractionFailureCopy(
  code: string | null,
  retryable: boolean,
): FailureCopy {
  switch (code) {
    case "provider_rate_limited":
    case "provider_unavailable":
    case "provider_timeout":
      return {
        title: "Plan extraction is busy",
        body: "Plan extraction is temporarily unavailable. Try again in a few minutes. Nothing was charged.",
      };
    case "provider_unconfigured":
    case "provider_unauthorized":
      return {
        title: "Plan extraction is unavailable",
        body: "Plan extraction is temporarily unavailable. Try again later. Nothing was saved.",
      };
    case "provider_rejected":
      return {
        title: "We couldn't process this file",
        body: "It may be too large or too complex. Try a smaller or clearer file, or paste the text instead.",
      };
    case "malformed_output":
      return {
        title: "We couldn't read the result",
        body: "Try again, or paste the text instead. Nothing was saved.",
      };
    default:
      return retryable
        ? {
            title: "We couldn't read this one",
            body: "Something went wrong reading your plan. Nothing was charged. Try again.",
          }
        : {
            title: "Plan import is unavailable right now",
            body: "We couldn't process this import. Nothing was saved and nothing was charged.",
          };
  }
}
