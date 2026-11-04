import type { MetadataRoute } from "next";
import { connection } from "next/server";
import {
  INDEXABLE_PUBLIC_PATHS,
  PUBLIC_SITE_ORIGIN,
  isProductionDeployment,
} from "@/lib/marketing/site";

/**
 * robots.txt (spec §11, RD-15). Only production invites crawlers, and only to
 * the public pages; every app, auth, admin, and API path is disallowed.
 * Previews and local builds disallow everything.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // VERCEL_ENV is a deployment fact read at request time, not baked in.
  await connection();
  if (!isProductionDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: INDEXABLE_PUBLIC_PATHS.map((p) => (p === "/" ? "/$" : p)),
      disallow: "/",
    },
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
