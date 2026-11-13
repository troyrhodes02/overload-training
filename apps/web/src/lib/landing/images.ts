/**
 * The landing page's photography slots, in one place (owner-managed asset
 * system). Each slot has a permanent public filename under
 * `public/images/landing/`; dropping a correctly named `.webp` there makes it
 * appear in the layout with no code change, and the layout, crop, overlays, and
 * motion are defined here and in the components — not in the image.
 *
 * Nothing here imports data, the Prisma client, or the Supabase client. These
 * are static presentation constants. Whether a file actually exists on disk is
 * resolved separately and on the server (see `image-manifest.ts`), so a missing
 * photograph renders a deliberate placeholder instead of a broken image.
 *
 * The five filenames are a fixed, documented contract (see
 * `public/images/landing/README.md`). Add a slot here only with a real design
 * reason, and document it there.
 */

export type LandingImageSlot =
  | "hero"
  | "trainingDetail"
  | "gymAtmosphere"
  | "machineDetail"
  | "trainingSecondary"
  | "effortBand"
  | "floorBand";

export type LandingImageConfig = {
  /** Permanent public filename. Never change once published. */
  file: string;
  /** Stable public URL Next serves the file from. */
  src: string;
  /**
   * Informative alt text for the finished photograph. Decorative/atmospheric
   * placements pass `alt=""` at the call site to override this; see the
   * component's `decorative` prop.
   */
  alt: string;
  /**
   * Responsive object-position as Tailwind classes, so a photo keeps its focal
   * point through mobile and desktop crops. Replacement images inherit it.
   */
  objectClass: string;
  /** One line used by the placeholder and the README. */
  purpose: string;
  /** Guidance surfaced in the README for whoever adds the real asset. */
  ratio: string;
  subject: string;
};

export const LANDING_IMAGES: Record<LandingImageSlot, LandingImageConfig> = {
  hero: {
    file: "hero-training.webp",
    src: "/images/landing/hero-training.webp",
    alt: "A lifter mid-set under a loaded barbell in a quiet gym.",
    objectClass: "object-[50%_35%] md:object-[50%_30%]",
    purpose: "Primary hero training photograph",
    ratio: "4:5 portrait (also used wide on desktop)",
    subject:
      "A single lifter mid-effort, upper-left to center focal point, with room for a dark scrim on the lower and right edges.",
  },
  trainingDetail: {
    file: "training-detail.webp",
    src: "/images/landing/training-detail.webp",
    alt: "A close detail of hands gripping a knurled barbell.",
    objectClass: "object-center",
    purpose: "Close-up equipment or training detail",
    ratio: "1:1 square",
    subject:
      "Tight detail — a grip, knurling, a loaded sleeve, chalk. Texture over face.",
  },
  gymAtmosphere: {
    file: "gym-atmosphere.webp",
    src: "/images/landing/gym-atmosphere.webp",
    alt: "A wide, low-lit view across a serious training floor.",
    objectClass: "object-center",
    purpose: "Wider atmospheric gym photography",
    ratio: "16:9 or wider landscape",
    subject:
      "A wide, moody floor with depth. Carries white text over a dark scrim, so keep the center uncluttered.",
  },
  machineDetail: {
    file: "machine-detail.webp",
    src: "/images/landing/machine-detail.webp",
    alt: "A cable or plate-loaded machine's weight stack in detail.",
    objectClass: "object-center",
    purpose: "Machine / cable equipment photography",
    ratio: "3:4 portrait",
    subject:
      "A weight stack, pin, or plate-loaded carriage — the thing whose weight differs between gyms.",
  },
  trainingSecondary: {
    file: "training-secondary.webp",
    src: "/images/landing/training-secondary.webp",
    alt: "A lifter resting between sets, chalked hands on the knees.",
    objectClass: "object-center",
    purpose: "Optional secondary editorial photograph",
    ratio: "3:2 landscape",
    subject:
      "A quieter editorial beat — a rack of dumbbells, a chalk bowl, a lifter resetting. Optional; a slot the layout can use but does not require.",
  },
  // Full-bleed immersive bands — art-directed dark, a short line of white text
  // over a scrim (like "What Overload won't do"). The center-left stays
  // uncluttered for the copy. Swapping the file changes the band, no code change.
  effortBand: {
    file: "effort-band.webp",
    src: "/images/landing/effort-band.webp",
    alt: "A lifter mid-effort under load in a dim gym.",
    objectClass: "object-center",
    purpose: "Immersive band — the work",
    ratio: "16:9 or wider landscape",
    subject:
      "A lifter mid-effort (a heavy set, a grind, chalk in the air). Dark and textured; the left-center carries white text, so keep it uncluttered.",
  },
  floorBand: {
    file: "floor-band.webp",
    src: "/images/landing/floor-band.webp",
    alt: "A wide, low-lit view down a serious training floor.",
    objectClass: "object-center",
    purpose: "Immersive band — the long run",
    ratio: "16:9 or wider landscape",
    subject:
      "A wide gym-floor shot with depth and quiet — racks, plates, a lifter in the distance. Carries white text over a dark scrim; keep the left uncluttered.",
  },
};

export const LANDING_IMAGE_SLOTS = Object.keys(
  LANDING_IMAGES,
) as LandingImageSlot[];
