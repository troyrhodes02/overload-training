import type { MetadataRoute } from "next";
import { INDEXABLE_PUBLIC_PATHS, canonicalUrl } from "@/lib/marketing/site";

/**
 * sitemap.xml (spec §11): the indexable public pages on the canonical origin.
 * Legal pages are added only once the owner publishes them (spec §12).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PUBLIC_PATHS.map((path) => ({ url: canonicalUrl(path) }));
}
