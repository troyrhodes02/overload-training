import type { Metadata } from "next";

/**
 * Public-site constants (Public Landing Page & Changelog, spec §11; RD-15).
 * Pure. The canonical origin is the owner-confirmed production host; every
 * public page's canonical URL and the sitemap use it, whatever deployment
 * renders them, so a preview never competes with production in search.
 */
export const PUBLIC_SITE_ORIGIN = "https://www.overloadtraining.app";

export const SITE_DESCRIPTION =
  "A strength training log that tells you, per lift, whether to progress, hold, or deload.";

/** The indexable public pages, in sitemap order. Legal pages join once published. */
export const INDEXABLE_PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/blizzy",
  "/changelog",
  "/support",
] as const;

/** Absolute canonical URL for a public path. */
export function canonicalUrl(path: string): string {
  return path === "/"
    ? `${PUBLIC_SITE_ORIGIN}/`
    : `${PUBLIC_SITE_ORIGIN}${path}`;
}

/** Metadata for one public page: title, description, canonical, social card. */
export function publicPageMetadata(input: {
  path: string;
  title: string;
  description: string;
  index?: boolean;
}): Metadata {
  const url = canonicalUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: "Overload",
      type: "website",
    },
    robots: input.index === false ? { index: false, follow: true } : undefined,
  };
}

/** Whether this deployment is production (Vercel sets VERCEL_ENV). */
export function isProductionDeployment(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === "production";
}
