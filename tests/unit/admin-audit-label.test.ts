import { auditActionText, type AuditKind } from "@/lib/admin/types";

/**
 * Audit-log wording (Admin Center & Feedback design doc Screen 9; Public
 * Accounts R8). Every audit kind reads as a human line, including the new
 * "send reset email" action, so the account page and the full log can label
 * it without a fallback.
 */

it("labels the new account_reset_email_sent kind", () => {
  expect(
    auditActionText({ kind: "account_reset_email_sent", detail: null }),
  ).toBe("sent a password-reset email");
});

it("labels every audit kind (no unlabeled action)", () => {
  const kinds: AuditKind[] = [
    "account_suspend",
    "account_reactivate",
    "account_reset_email_sent",
    "feedback_handled",
    "feedback_reopened",
    "feedback_recategorized",
  ];
  for (const kind of kinds) {
    const text = auditActionText({
      kind,
      detail:
        kind === "feedback_recategorized" ? { from: "bug", to: "idea" } : null,
    });
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  }
});
