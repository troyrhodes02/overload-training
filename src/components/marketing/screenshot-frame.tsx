import {
  SHOTS,
  type ShotId,
  type ShotImage,
} from "@/lib/marketing/screenshots";

/**
 * One product screenshot in a quiet bordered frame (design doc §4, §6; spec
 * RD-19). Real captures of the synthetic demo account only. Light and dark
 * captures follow the page's appearance; a phone capture is used below `sm`
 * when one exists. A shot that hasn't been captured renders the pending frame
 * at the same size — never a mockup.
 */

function Img({
  image,
  alt,
  priority,
  phone,
  className,
}: {
  image: ShotImage;
  alt: string;
  priority?: boolean;
  phone: ShotImage | null;
  className?: string;
}) {
  return (
    <picture className={className}>
      {phone ? <source media="(max-width: 639px)" srcSet={phone.src} /> : null}
      {/* Static, pre-sized captures: a plain img with explicit dimensions (no
          layout shift) — no image service is needed for a handful of files. */}
      <img
        src={image.src}
        width={image.width}
        height={image.height}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
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
          sources.dark ? (
            <>
              <Img
                image={sources.light.desktop}
                phone={sources.light.phone}
                alt={alt}
                priority={priority}
                className="block dark:hidden"
              />
              <Img
                image={sources.dark.desktop}
                phone={sources.dark.phone}
                alt={alt}
                priority={priority}
                className="hidden dark:block"
              />
            </>
          ) : (
            <Img
              image={sources.light.desktop}
              phone={sources.light.phone}
              alt={alt}
              priority={priority}
            />
          )
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
