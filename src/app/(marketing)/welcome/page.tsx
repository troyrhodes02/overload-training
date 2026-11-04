import { ModeCta } from "@/components/marketing/mode-cta";
import { publicPageMetadata, SITE_DESCRIPTION } from "@/lib/marketing/site";

export const metadata = publicPageMetadata({
  path: "/",
  title: "Overload — know whether to progress, hold, or deload",
  description: SITE_DESCRIPTION,
});

/**
 * The landing page (design doc Screen 1). Signed-out `/` is rewritten here by
 * the proxy, so its canonical URL is `/`. Hero concept A (RD-14).
 */
export default function LandingPage() {
  return (
    <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-12 md:px-6 md:py-24">
      <div className="space-y-6 md:col-span-5 md:self-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          You logged the reps. Know what to do next.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Overload reads each set you log against the plan you wrote, then makes
          the call for every lift: go up, hold, or back off.
        </p>
        <ModeCta placement="hero" />
      </div>
    </section>
  );
}
