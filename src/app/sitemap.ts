import type { MetadataRoute } from "next";
import { INDEXABLE_PUBLIC_PATHS, canonicalUrl } from "@/lib/marketing/site";
import { publishedLegalPaths } from "@/lib/legal/state";

/**
 * sitemap.xml (spec §11): the indexable public pages on the canonical origin.
 * Legal pages are added only once the owner publishes them (spec §12).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [...INDEXABLE_PUBLIC_PATHS, ...publishedLegalPaths()].map((path) => ({
    url: canonicalUrl(path),
  }));
}
