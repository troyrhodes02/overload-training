/** Whether a failed attempt may already have been billed by the provider. */
export function providerMayHaveBilled(code: string): boolean {
  switch (code) {
    case "provider_timeout":
    case "provider_rejected": // a refusal is billed; a 400 is not — assume billed
    case "malformed_output":
    case "output_truncated":
    case "draft_build_failed":
      return true;
    default:
      return false; // 429 / 5xx / auth / unconfigured / cancelled: no answer was produced
  }
}
