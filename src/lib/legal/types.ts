/**
 * Legal documents as typed content (Public Landing Page & Changelog, spec
 * §12; RD-12). Pure and isomorphic. A document is a list of blocks whose
 * inline segments are plain text, an OWNER FACT the owner must supply (legal
 * name, address, minimum age, …), or the support address. Nothing here is
 * legal approval: a document is "published" only when its status says so,
 * every fact it uses has an owner value, and an approval is recorded.
 */

export type OwnerFactKey =
  | "operatorName"
  | "contactAddress"
  | "effectiveDate"
  | "minimumAge"
  | "governingLaw"
  | "refundPolicy"
  | "retentionStatement"
  | "regionalNotice"
  | "creatorDisclosure";

export type Segment = string | { fact: OwnerFactKey } | { support: true };

export type Block =
  | { kind: "h2"; text: string }
  | { kind: "p"; content: Segment[] }
  | { kind: "ul"; items: Segment[][] };

export type LegalKind = "privacy" | "terms";

export type LegalDoc = {
  kind: LegalKind;
  title: string;
  /** "draft" until the owner approves the text for publication. */
  status: "draft" | "published";
  /** Who approved it and when (YYYY-MM-DD). Required to publish. */
  approval: { approvedBy: string; approvedOn: string } | null;
  blocks: Block[];
};

export type OwnerFacts = Record<OwnerFactKey, string | null>;

/** How a legal page renders right now. */
export type LegalPageState = "published" | "draft-preview" | "finalizing";
