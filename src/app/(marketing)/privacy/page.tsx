import { connection } from "next/server";
import { LegalDocumentView } from "@/components/marketing/legal-document";
import { supportEmail } from "@/lib/accounts/support-email";
import { OWNER_FACTS } from "@/lib/legal/facts";
import { LEGAL_DOCS, isPublished, legalPageState } from "@/lib/legal/state";
import {
  isProductionDeployment,
  publicPageMetadata,
} from "@/lib/marketing/site";

const doc = LEGAL_DOCS.privacy;

export const metadata = publicPageMetadata({
  path: "/privacy",
  title: "Privacy policy · Overload",
  description: "How Overload collects, uses, and protects your information.",
  // Never indexed until the owner publishes it (spec RD-12).
  index: isPublished(doc),
});

/**
 * /privacy (design doc Screen 5; spec §12, RD-12). The publication state is
 * decided per request: production shows "being finalized" until the owner
 * records the facts and an approval; previews and local show the draft.
 */
export const instant = false;

export default async function PrivacyPage() {
  await connection();
  return (
    <LegalDocumentView
      doc={doc}
      state={legalPageState(doc, isProductionDeployment())}
      facts={OWNER_FACTS}
      supportEmail={supportEmail()}
    />
  );
}
