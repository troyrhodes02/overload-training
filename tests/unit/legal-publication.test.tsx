/**
 * Public Landing Page & Changelog — L7 (OVE-102; spec §5, §12; RD-12, RD-13,
 * RD-23; P21-AC5). The owner's drafts are integrated as reviewable content,
 * but nothing presents a draft as policy in force: production shows
 * "being finalized" until every owner fact and an approval are recorded, a
 * premature "published" fails the build, and no bracketed reviewer note ever
 * reaches the page.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { LegalDocumentView } from "@/components/marketing/legal-document";
import { OWNER_FACTS } from "@/lib/legal/facts";
import {
  LEGAL_DOCS,
  LegalPublicationError,
  factsUsed,
  isPublished,
  legalPageState,
  publishedLegalPaths,
  unresolvedFacts,
  validatePublished,
} from "@/lib/legal/state";
import type { LegalDoc, OwnerFacts } from "@/lib/legal/types";
import { creatorDisclosure } from "@/lib/marketing/disclosure";
import { BLIZZY_PAGE } from "@/lib/marketing/copy";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SUPPORT = "support@overloadtraining.app";

const ALL_FACTS: OwnerFacts = {
  operatorName: "Example Operator LLC",
  contactAddress: "1 Example Street, Example City",
  effectiveDate: "December 1, 2026",
  minimumAge: "18",
  governingLaw: "Example governing-law clause.",
  refundPolicy: "Example refund clause.",
  retentionStatement: "Example retention clause.",
  regionalNotice: "Example regional clause.",
  creatorDisclosure: "Example disclosure.",
};

const render = (doc: LegalDoc, production: boolean, facts = OWNER_FACTS) =>
  renderToStaticMarkup(
    <LegalDocumentView
      doc={doc}
      state={legalPageState(doc, production, facts)}
      facts={facts}
      supportEmail={SUPPORT}
    />,
  );

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe.each(Object.values(LEGAL_DOCS).map((d) => [d.kind, d] as const))(
  "%s",
  (_kind, doc) => {
    it("ships as a draft with no approval, and no owner fact invented", () => {
      expect(doc.status).toBe("draft");
      expect(doc.approval).toBeNull();
      expect(Object.values(OWNER_FACTS).every((v) => v === null)).toBe(true);
      expect(isPublished(doc)).toBe(false);
      expect(unresolvedFacts(doc).length).toBeGreaterThan(0);
      expect(factsUsed(doc)).toEqual(
        expect.arrayContaining([
          "operatorName",
          "contactAddress",
          "effectiveDate",
          "minimumAge",
        ]),
      );
    });

    it("production shows only the 'being finalized' page — no draft text", () => {
      const t = text(render(doc, true));
      expect(t).toContain(
        "being finalized and will be published at this address",
      );
      expect(t).toContain(SUPPORT);
      expect(t).not.toMatch(
        /not in effect|‹|Information we collect|What Overload does/,
      );
      expect(legalPageState(doc, true)).toBe("finalizing");
    });

    it("previews show the draft, labelled not in effect, with owner facts highlighted", () => {
      const html = render(doc, false);
      expect(legalPageState(doc, false)).toBe("draft-preview");
      expect(text(html)).toContain("Draft for owner review — not in effect");
      expect(html).toContain('data-owner-fact="operatorName"');
      expect(html).toContain('data-owner-fact="minimumAge"');
    });

    it("never renders a bracketed reviewer note, in any state", () => {
      for (const html of [
        render(doc, false),
        render(doc, true),
        render(
          {
            ...doc,
            status: "published",
            approval: { approvedBy: "Owner", approvedOn: "2026-12-01" },
          },
          true,
          ALL_FACTS,
        ),
      ]) {
        expect(text(html)).not.toMatch(
          /\[(OWNER|LEGAL|ENGINEERING|DATE|BUSINESS)|\]/,
        );
      }
    });

    it("publishes only with every fact AND an approval; renders the clean document then", () => {
      const approved = {
        ...doc,
        status: "published" as const,
        approval: { approvedBy: "Owner", approvedOn: "2026-12-01" },
      };
      expect(() => validatePublished(approved, OWNER_FACTS)).toThrow(
        LegalPublicationError,
      );
      expect(() =>
        validatePublished({ ...approved, approval: null }, ALL_FACTS),
      ).toThrow(/approval/);
      expect(() => validatePublished(approved, ALL_FACTS)).not.toThrow();
      expect(legalPageState(approved, true, ALL_FACTS)).toBe("published");
      const t = text(render(approved, true, ALL_FACTS));
      expect(t).toContain("Example Operator LLC");
      expect(t).toContain("Effective December 1, 2026");
      expect(t).not.toMatch(/‹|not in effect|being finalized/);
    });

    it("claims no legal approval anywhere in its text", () => {
      expect(text(render(doc, false))).not.toMatch(
        /approved by (counsel|an attorney|a lawyer)|legally (approved|reviewed)|attorney-approved/i,
      );
    });
  },
);

describe("the drafts were reconciled with the code (RD-23)", () => {
  const privacy = text(render(LEGAL_DOCS.privacy, false));
  const terms = text(render(LEGAL_DOCS.terms, false));

  it("privacy says what is stored where, and names no analytics", () => {
    expect(privacy).toContain("feedback screenshots");
    expect(privacy).toContain("up to two hours");
    expect(privacy).toContain("one-way hash of a request fingerprint");
    expect(privacy).toContain(
      "uses no analytics, advertising, or tracking tools",
    );
    expect(privacy).not.toMatch(/plan import|HealthKit/i);
  });

  it("terms say deletion does not cancel a Stripe subscription", () => {
    expect(terms).toContain(
      "Deleting your account does not cancel a paid subscription in Stripe",
    );
    expect(terms).toContain("Pro subscriptions are not on sale yet");
    expect(terms).not.toMatch(/no refunds/i);
  });

  it("the source strings carry no bracketed owner/legal notes", () => {
    for (const file of ["src/lib/legal/privacy.ts", "src/lib/legal/terms.ts"]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
      expect([
        file,
        /\[(OWNER|LEGAL|ENGINEERING|DATE|BUSINESS)/.test(src),
      ]).toEqual([file, false]);
    }
  });
});

describe("discoverability and the creator disclosure", () => {
  it("unpublished legal pages are noindex and stay out of the sitemap", async () => {
    jest.resetModules();
    jest.doMock("next/server", () => ({ connection: jest.fn(async () => {}) }));
    const privacy = await import("@/app/(marketing)/privacy/page");
    const terms = await import("@/app/(marketing)/terms/page");
    expect(privacy.metadata.robots).toEqual({ index: false, follow: true });
    expect(terms.metadata.robots).toEqual({ index: false, follow: true });
    expect(publishedLegalPaths()).toEqual([]);
    expect(publishedLegalPaths(ALL_FACTS)).toEqual([]); // still drafts
  });

  it("shows the neutral draft disclosure until the owner supplies one", () => {
    expect(creatorDisclosure(OWNER_FACTS.creatorDisclosure)).toBe(
      BLIZZY_PAGE.disclosureDraft,
    );
    expect(creatorDisclosure("Approved disclosure.")).toBe(
      "Approved disclosure.",
    );
    expect(BLIZZY_PAGE.disclosureDraft).not.toMatch(
      /paid|sponsor|affiliate|compensat/i,
    );
  });
});
