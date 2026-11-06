import type { OwnerFactKey, OwnerFacts } from "./types";

/**
 * THE OWNER'S LEGAL FACTS (spec §12, RD-12; pitch P21-AC5). Every value is
 * null until the owner supplies it — the pipeline run invents none of them.
 * While any fact a document uses is null, that document cannot be published:
 * production shows the "being finalized" page and previews show the draft
 * with each missing fact highlighted.
 *
 * To publish (runbook §Legal): fill the facts the documents use, set the
 * document's status to "published" with an approval record, and let CI pass.
 */
export const OWNER_FACTS: OwnerFacts = {
  operatorName: null,
  contactAddress: null,
  effectiveDate: null,
  minimumAge: null,
  governingLaw: null,
  refundPolicy: null,
  retentionStatement: null,
  regionalNotice: null,
  creatorDisclosure: null,
};

/** How a missing fact is labelled in the draft preview. */
export const FACT_LABELS: Record<OwnerFactKey, string> = {
  operatorName: "Legal name of owner or business",
  contactAddress: "Business contact address",
  effectiveDate: "Date the document is published",
  minimumAge: "Minimum account age (and how signup enforces it)",
  governingLaw:
    "Liability limit, governing law, and dispute terms (legal review)",
  refundPolicy: "Refund and cancellation position (legal review)",
  retentionStatement:
    "Verified retention periods for logs, support, billing, and backups",
  regionalNotice: "Regional transfer notices and rights for launch regions",
  creatorDisclosure: "Creator material-connection disclosure for /blizzy",
};
