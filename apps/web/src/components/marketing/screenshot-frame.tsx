import {
  SHOTS,
  type ShotId,
  type ShotImage,
  type ShotSources,
} from "@/lib/marketing/screenshots";

/**
 * One product screenshot in a quiet bordered frame (design doc §4, §6; spec
 * RD-19). Real captures of the synthetic demo account only. A shot that
 * hasn't been captured renders the pending frame at the same size — never a
 * mockup.
 *
 * ONE <picture> chooses a single file by the visitor's color scheme and
 * width, so exactly one image downloads (review finding 4 on PR #121), and
 * every <source> carries its own dimensions, so the box is reserved at the
 * right aspect ratio before the image arrives — no layout shift when a phone
 * gets the portrait capture (finding 3). Public pages follow the system
 * appearance, which is what the media queries read.
 */

const PHONE = "(max-width: 639px)";
const DARK = "(prefers-color-scheme: dark)";

function Source({ media, image }: { media: string; image: ShotImage }) {
  return (
    <source
      media={media}
      srcSet={image.src}
      width={image.width}
      height={image.height}
    />
  );
}

function Picture({
  sources,
  alt,
  priority,
}: {
  sources: ShotSources;
  alt: string;
  priority?: boolean;
}) {
  const { light, dark } = sources;
  return (
    <picture>
      {dark?.phone ? (
        <Source media={`${DARK} and ${PHONE}`} image={dark.phone} />
      ) : null}
      {dark ? <Source media={DARK} image={dark.desktop} /> : null}
      {light.phone ? <Source media={PHONE} image={light.phone} /> : null}
      {/* Static, pre-sized captures: a plain img with explicit dimensions —
          no image service is needed for a handful of files. */}
      <img
        src={light.desktop.src}
        width={light.desktop.width}
        height={light.desktop.height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="block h-auto w-full"
      />
    </picture>
  );
}

export function ScreenshotFrame({
  shot,
  caption,
  priority,
}: {
  shot: ShotId;
  caption?: string;
  priority?: boolean;
}) {
  const { alt, sources } = SHOTS[shot];
  return (
    <figure>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {sources ? (
          <Picture sources={sources} alt={alt} priority={priority} />
        ) : (
          <div
            role="img"
            aria-label="Screenshot not yet captured"
            className="flex aspect-[4/3] items-center justify-center p-6 text-center text-sm text-muted-foreground"
          >
            Screenshot coming — captured from demo data before launch.
          </div>
        )}
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
