import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import {
  LANDING_IMAGE_SLOTS,
  LANDING_IMAGES,
  type LandingImageSlot,
} from "./images";

/**
 * Which landing photographs actually exist on disk, resolved on the server at
 * request time. This is the deliberate missing-asset strategy the design calls
 * for: the server decides image-or-placeholder before any HTML is sent, so a
 * missing file never produces a broken-image icon, an onError flash, or a
 * layout shift on the client.
 *
 * `cache()` dedupes the stat calls within a single request. The landing page is
 * already request-dynamic (its CTA reads the live signup/billing state), so in
 * development this re-runs on every refresh — drop a file into
 * `public/images/landing/` and a hard refresh shows it, no restart. In
 * production the check runs during the render that serves the page, so a
 * redeploy that ships the asset picks it up. Next's image optimizer caches the
 * optimized output separately; the README documents the one refresh step.
 */

const LANDING_DIR = path.join(process.cwd(), "public", "images", "landing");

export type LandingManifest = Record<LandingImageSlot, boolean>;

export const getLandingManifest = cache((): LandingManifest => {
  const manifest = {} as LandingManifest;
  for (const slot of LANDING_IMAGE_SLOTS) {
    manifest[slot] = existsSync(
      path.join(LANDING_DIR, LANDING_IMAGES[slot].file),
    );
  }
  return manifest;
});

export function landingImageExists(slot: LandingImageSlot): boolean {
  return getLandingManifest()[slot];
}
