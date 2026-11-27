/**
 * OVE-265 (Pitch 21l Gate 4): the public privacy policy. The page is public
 * for everyone, reads nothing about the visitor, is linked from the public
 * footer, /support, and signup, and makes no claim the code contradicts.
 */
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PRIVACY_POLICY_PATH,
  PRIVACY_POLICY_URL,
} from "@overload/shared/legal/privacy";
import {
  isPublicPath,
  routeRedirect,
  MARKETING_PATHS,
} from "@/lib/auth-routes";
import {
  INDEXABLE_PUBLIC_PATHS,
  PUBLIC_SITE_ORIGIN,
  canonicalUrl,
} from "@/lib/marketing/site";
import { MarketingFooter } from "@/components/marketing/marketing-frame";
import { SupportCard } from "@/components/auth/support-card";

const WEB_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");
const PAGE = "src/app/(marketing)/privacy/page.tsx";
const read = (rel: string, root = WEB_ROOT) =>
  fs.readFileSync(path.join(root, rel), "utf8");

async function renderPage(): Promise<string> {
  const { default: Page } = await import("@/app/(marketing)/privacy/page");
  return renderToStaticMarkup(<Page />);
}

/** Visible text only: tags stripped, entities and whitespace normalized. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("where the policy lives", () => {
  it("one public URL, on the canonical origin, for the web and the app", () => {
    expect(PRIVACY_POLICY_PATH).toBe("/privacy");
    expect(PRIVACY_POLICY_URL).toBe(
      `${PUBLIC_SITE_ORIGIN}${PRIVACY_POLICY_PATH}`,
    );
    expect(PRIVACY_POLICY_URL).toBe("https://www.overloadtraining.app/privacy");
  });

  it("is public signed in and signed out, never bounced to /login", () => {
    expect(MARKETING_PATHS).toContain(PRIVACY_POLICY_PATH);
    expect(isPublicPath(PRIVACY_POLICY_PATH)).toBe(true);
    expect(routeRedirect(PRIVACY_POLICY_PATH, false)).toBeNull();
    expect(routeRedirect(PRIVACY_POLICY_PATH, true)).toBeNull();
  });

  it("is indexed and in the sitemap", () => {
    expect(INDEXABLE_PUBLIC_PATHS).toContain(PRIVACY_POLICY_PATH);
  });

  it("reads nothing about the visitor (no session, account, or database)", () => {
    const src = read(PAGE);
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (m) => m[1],
    );
    for (const i of imports) {
      expect(i).not.toMatch(
        /^@\/lib\/(auth|data|db|supabase|entitlements|billing)|next\/headers|server-only/,
      );
    }
    expect(src).not.toMatch(/\bcookies\(|\bheaders\(|connection\(/);
  });
});

describe("the page", () => {
  const saved = process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL;
  afterEach(() => {
    if (saved === undefined)
      delete process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL = saved;
  });

  it("has a title, a real publication date, and canonical metadata", async () => {
    const mod = await import("@/app/(marketing)/privacy/page");
    expect(mod.PRIVACY_POLICY_UPDATED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mod.metadata.title).toBe("Privacy Policy · Overload");
    expect(mod.metadata.alternates?.canonical).toBe(
      canonicalUrl(PRIVACY_POLICY_PATH),
    );
    const html = await renderPage();
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(
      `<time dateTime="${mod.PRIVACY_POLICY_UPDATED_ON}">`,
    );
    expect(text(html)).toMatch(/Last updated [A-Z][a-z]+ \d{1,2}, \d{4}/);
  });

  it("names the operator and the configured support address", async () => {
    process.env.NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL = "help@overload.test";
    const html = await renderPage();
    expect(text(html)).toContain("William Rhodes");
    expect(html).toContain('href="mailto:help@overload.test"');
  });

  it("covers every section Apple and the owner asked for", async () => {
    const t = text(await renderPage());
    for (const heading of [
      "Who runs Overload",
      "What we collect",
      "Account information",
      "Training records",
      "Feedback and screenshots",
      "Subscription and billing information",
      "Technical and security information",
      "How we use it",
      "Who we share it with",
      "How we protect it",
      "How long we keep it",
      "Your choices and rights",
      "The iPhone app and TestFlight",
      "Children",
      "Changes to this policy",
      "Contact",
    ]) {
      expect(t).toContain(heading);
    }
    // Every provider that receives personal information is named.
    for (const provider of [
      "Supabase",
      "Vercel",
      "Stripe",
      "Cloudflare Turnstile",
      "Resend",
      "Expo",
      "Apple",
    ]) {
      expect(t).toContain(provider);
    }
    // Export and deletion are described where the lifter finds them.
    expect(t).toContain("More → Export your data");
    expect(t).toContain("More → Delete account");
  });

  it("makes none of the absolute promises the service can't keep", async () => {
    const t = text(await renderPage()).toLowerCase();
    for (const overclaim of [
      "we collect no",
      "we don't collect any",
      "never share",
      "immediately deleted",
      "permanently erased",
      "deleted immediately",
      "all data is deleted",
      "100% secure",
      "completely secure",
      "fully secure",
      "gdpr compliant",
      "ccpa compliant",
      "hipaa",
    ]) {
      expect(t).not.toContain(overclaim);
    }
    // Deletion says what can remain.
    expect(t).toContain("some information can remain after deletion");
    expect(t).toContain("backups");
  });
});

describe("the no-tracking claim matches the dependencies", () => {
  // The policy says Overload uses no advertising, analytics, or crash-reporting
  // tools. If one of these is ever added, the policy must change first.
  const TRACKERS =
    /analytics|speed-insights|sentry|bugsnag|crashlytics|firebase|posthog|mixpanel|amplitude|segment|datadog|hotjar|plausible|gtag|googletagmanager|branch|appsflyer|adjust|facebook|onesignal|expo-insights|expo-tracking-transparency|expo-location|expo-contacts|expo-camera|expo-notifications|healthkit/i;

  it.each([
    "apps/web/package.json",
    "apps/mobile/package.json",
    "package.json",
  ])("%s has no tracking, analytics, or crash-reporting package", (rel) => {
    const pkg = JSON.parse(read(rel, REPO_ROOT)) as {
      dependencies?: Record<string, string>;
    };
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(name).not.toMatch(TRACKERS);
    }
  });

  it("the web loads no third-party script tags", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toMatch(/next\/script|<script[^>]+src=/);
  });
});

describe("links to the policy", () => {
  it("the public footer links it", () => {
    const html = renderToStaticMarkup(<MarketingFooter />);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Privacy Policy");
  });

  it.each([false, true])("/support links it (signed in: %s)", (signedIn) => {
    const html = renderToStaticMarkup(
      <SupportCard signedIn={signedIn} supportAddress="s@overload.test" />,
    );
    expect(html).toContain('href="/privacy"');
  });

  it("the signup page links it", () => {
    const src = read("src/app/signup/page.tsx");
    expect(src).toContain("href={PRIVACY_POLICY_PATH}");
    expect(src).toContain("Privacy Policy");
  });
});
