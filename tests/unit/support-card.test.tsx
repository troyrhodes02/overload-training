import { renderToStaticMarkup } from "react-dom/server";
import { SupportCard } from "@/components/auth/support-card";

/**
 * The /support contact card (Public Accounts design Screen 9, D5; spec §6, R10).
 * Static markup only (no effects run), which is all these need: the signed-out
 * variant is a `mailto:` affordance with "Back to sign in" and NO form/action
 * (no DB write), and the signed-in variant routes to Send feedback.
 */
const ADDRESS = "support@overload.test";

describe("SupportCard (design Screen 9, D5)", () => {
  it("signed out: shows the address, a mailto button, and back to sign in — and writes nothing", () => {
    const html = renderToStaticMarkup(
      <SupportCard signedIn={false} supportAddress={ADDRESS} />,
    );
    expect(html).toContain(ADDRESS);
    expect(html).toContain(`mailto:${ADDRESS}`);
    expect(html).toContain("Email support");
    expect(html).toContain("Back to sign in");
    expect(html).toContain('href="/login"');
    // D5: no database-writing form on the signed-out contact surface.
    expect(html).not.toContain("<form");
    expect(html).not.toContain("/feedback");
  });

  it("signed in: routes to Send feedback with the address as a muted fallback", () => {
    const html = renderToStaticMarkup(
      <SupportCard signedIn={true} supportAddress={ADDRESS} />,
    );
    expect(html).toContain("Send feedback");
    expect(html).toContain('href="/feedback"');
    // The address is still offered as a fallback mailto.
    expect(html).toContain(`mailto:${ADDRESS}`);
    expect(html).not.toContain("<form");
  });
});
