/**
 * Workout Plan Import & Review — what the Processing step tells the lifter when
 * an extraction attempt failed, chosen from the recorded failure code. Pure and
 * client-safe. Never names the provider or a status code.
 *
 * Honesty rules: each message says what actually happened (unreadable result vs.
 * too long vs. timed out vs. service unavailable). "No plan was created" is
 * always true of a failed import; nothing here claims the attempt was free,
 * because a request the provider already processed may have been billed.
 */
export type FailureCopy = { title: string; body: string };

export function extractionFailureCopy(
  code: string | null,
  retryable: boolean,
): FailureCopy {
  switch (code) {
    case "provider_rate_limited":
    case "provider_unavailable":
      return {
        title: "Plan extraction is busy",
        body: "Plan extraction is temporarily unavailable. Try again in a few minutes.",
      };
    case "provider_timeout":
      return {
        title: "This took too long",
        body: "Reading it took longer than the limit. Try again, or import fewer pages or days at a time. No plan was created.",
      };
    case "provider_unconfigured":
    case "provider_unauthorized":
      return {
        title: "Plan extraction is unavailable",
        body: "Plan extraction is temporarily unavailable. Try again later.",
      };
    case "provider_rejected":
      return {
        title: "We couldn't process this file",
        body: "It may be too large or too complex. Try a smaller or clearer file, or paste the text instead. No plan was created.",
      };
    case "output_truncated":
      return {
        title: "This plan is too long to read at once",
        body: "Import fewer days or pages at a time, or split it into parts. No plan was created.",
      };
    case "malformed_output":
      return {
        title: "We couldn't use the result",
        body: "The reader returned something we couldn't use. Try again, or paste the text instead. No plan was created.",
      };
    case "draft_build_failed":
      return {
        title: "We couldn't build the review",
        body: "The plan was read, but we couldn't turn it into a review. Try again, or paste the text instead. No plan was created.",
      };
    default:
      return retryable
        ? {
            title: "We couldn't read this one",
            body: "Something went wrong reading your plan. Try again.",
          }
        : {
            title: "Plan import is unavailable right now",
            body: "We couldn't process this import. No plan was created.",
          };
  }
}
