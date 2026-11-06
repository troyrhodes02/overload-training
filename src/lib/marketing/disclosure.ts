import { BLIZZY_PAGE } from "./copy";

/**
 * The creator disclosure shown directly under the BLIZZY offer (spec RD-13).
 * Until the owner records an approved material-connection disclosure (legal
 * fact `creatorDisclosure`, wired in the legal facts module), the neutral
 * draft is shown: it says only what is known.
 */
export function creatorDisclosure(approved?: string | null): string {
  const text = approved?.trim();
  return text ? text : BLIZZY_PAGE.disclosureDraft;
}
