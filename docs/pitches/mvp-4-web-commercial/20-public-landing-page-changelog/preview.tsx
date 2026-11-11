/* eslint-disable */
// @ts-nocheck
/**
 * Public Landing Page & Changelog — UI Design Preview (implementation contract)
 * ============================================================================
 * Pitch 21 (repo slug 20) · generated from
 * docs/pitches/mvp-4-web-commercial/20-public-landing-page-changelog/design.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. Self-contained,
 * mock-data-only. It never touches Prisma, Supabase, Stripe, a server action,
 * or the network. Excluded from typecheck, lint, format, and the build; never
 * imported by the app. The real UI is built with shadcn/ui against
 * src/app/globals.css; where this preview and the theme disagree, the theme wins.
 *
 * UPDATE — premium landing redesign (branch `landing-premium-redesign`):
 * the shipped landing page (src/app/(marketing)/welcome/page.tsx) has been
 * re-art-directed into a dark, editorial, motion-aware surface: a layered hero
 * (a bespoke progression "call" card and the real Today capture floating over a
 * photo slot), a live reveal-animated e1RM trend beside its real screen,
 * per-gym weight callouts over the two gym captures, immersive photography
 * bands, and one-time scroll reveals (prefers-reduced-motion honored). New
 * building blocks live in src/components/landing/* and src/lib/landing/* (an
 * owner-managed photo placeholder system). Every product-truth commitment below
 * still holds unchanged — only composition, pacing, and motion changed, and the
 * order now leads with the progression call. Treat the implemented page as the
 * current visual contract for the landing surface; this file records the prior
 * layout and the still-binding truth rules.
 *
 * SCREENSHOTS: no real capture exists while this preview is written. Every
 * product screen inside a frame below is a PREVIEW MOCK, labelled as such on
 * the frame. The shipped page uses real captures of the seeded synthetic demo
 * account (docs/marketing/screenshots/) or the "pending" frame — never a mock.
 *
 * The chrome above the frame (screen, visitor, signup mode, billing, width,
 * appearance, legal state, screenshot state, CTA loading) is preview chrome.
 *
 * Commitments every frame respects (design doc §3):
 *   • A claim needs its screen — each section = one claim + one real screen.
 *   • The button tells the truth about today — CTA from (signed in, signup
 *     mode, billing). Closed: no signup, no waitlist. Billing off: no Subscribe
 *     anywhere, prices labelled "Not on sale yet".
 *   • Free said first. Pro names only shipped capabilities. No plan import.
 *   • Quiet instrument: no gradients, glows, countdowns, ratings, member
 *     counts, testimonials, or exclamation marks. Progress/deload colors only
 *     inside product screens.
 *   • Signed-in "/" is Today; public pages offer "Open Overload".
 */
import * as React from "react";
import { Check, Copy, ArrowRight, ExternalLink } from "lucide-react";

/* ───────────────────────────── mock data ───────────────────────────── */

const PRICES = { monthly: "$4.99", annual: "$39.99", annualPerMonth: "$3.33" };
const CODE = "BLIZZY";
const SUPPORT = "support@overloadtraining.app";

const RELEASES = [
  { id: "2026-11-01-introducing-free-and-pro", date: "Nov 1, 2026", title: "Introducing Free and Pro", body: "Keep planning and logging your workouts for free, always. Pro adds progression recommendations, e1RM trends, stall detection, and deeper exercise history. New accounts get 14 days of Pro to try it." },
  { id: "2026-10-29-reset-password-by-email", date: "Oct 29, 2026", title: "Reset your password by email", body: "Forgot your password? From the sign-in screen, choose Forgot password and we'll email you a link to set a new one. The link works once and expires after an hour." },
  { id: "2026-10-29-export-your-data", date: "Oct 29, 2026", title: "Export your data", body: "You can download everything in your account — plans, workouts, logged sets, goals, gyms, cardio, and profile — as one file, any time, from Settings. It's private to you and always free." },
  { id: "2026-10-22-exercise-history", date: "Oct 22, 2026", title: "Exercise history and records", body: "Open any exercise to see every session you've logged, your best set, heaviest weight, and rep records, and how the lift is trending." },
];

const FREE_FEATURES = [
  "Plans, mesocycles & sessions",
  "Guided logging, RIR, bodyweight sets",
  "Full history, editable",
  "Goals and their progress",
  "Gyms, with machine weights per gym",
  "Cardio log",
  "Export and account deletion",
  "No ads, ever",
];
const PRO_FEATURES = [
  "Everything in Free",
  "Progress, hold, and deload calls, with the reason",
  "e1RM trend and stall detection",
  "Exercise history, records, and past calls",
];

const BANNED = ["unlock your potential", "revolutionize", "train smarter", "game-changing", "supercharge", "unleash", "the ultimate", "crush your goals", "powerful analytics", "at your fingertips", "AI-powered", "AI-driven", "AI coach", "seamless", "next-level", "transform your", "!"];

/* ─────────────────────── CTA matrix (design §6.9) ─────────────────────── */

function resolveCta({ signedIn, mode, billing }) {
  if (signedIn) {
    return {
      primary: { label: "Open Overload", href: "/" },
      secondary: null,
      note: null,
      pro: billing ? { label: "Go to Plan & Billing", href: "/settings/billing" } : null,
    };
  }
  if (mode === "public") {
    return {
      primary: { label: "Create an account", href: "/signup" },
      secondary: { label: "Sign in", href: "/login" },
      note: "Free to use. New accounts get 14 days of Pro, no card.",
      pro: billing ? { label: "Create an account to subscribe", href: "/signup" } : null,
    };
  }
  if (mode === "invite") {
    return {
      primary: { label: "Join with an invite code", href: "/signup" },
      secondary: { label: "Sign in", href: "/login" },
      note: "Overload is invite-only right now. You'll need an invite code to create an account.",
      pro: billing ? { label: "Join with an invite code", href: "/signup" } : null,
    };
  }
  return {
    primary: { label: "Sign in", href: "/login" },
    secondary: null,
    note: "Overload isn't taking new accounts right now.",
    closed: true,
    pro: billing ? { label: "Sign in to subscribe", href: "/login" } : null,
  };
}

/* ─────────────────────────── primitives ─────────────────────────── */

const cx = (...a) => a.filter(Boolean).join(" ");

function Btn({ children, variant = "default", size = "default", full, className }) {
  const v = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-border bg-background hover:bg-muted",
    ghost: "hover:bg-muted",
    link: "text-primary underline-offset-4 hover:underline px-0",
  }[variant];
  const s = { default: "h-11 px-5 text-sm", sm: "h-9 px-3 text-sm" }[size];
  return (
    <a href="#" onClick={(e) => e.preventDefault()} className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", v, s, full && "w-full sm:w-auto", className)}>
      {children}
    </a>
  );
}

function Badge({ children }) {
  return <span className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>;
}

function ProChip() {
  return <span className="ml-2 inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 align-middle text-xs font-medium text-primary">Pro</span>;
}

function Skel({ className }) {
  return <div className={cx("animate-pulse rounded-md bg-muted", className)} />;
}

/* ─────────────────────── mode CTA (server-resolved) ─────────────────────── */

function ModeCta({ ctx, placement = "hero" }) {
  const cta = resolveCta(ctx);
  if (ctx.loading) {
    return (
      <div className="space-y-3" aria-hidden>
        <Skel className="h-11 w-full sm:w-48" />
        <Skel className="h-4 w-56" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Btn full={placement === "hero"}>{cta.primary.label}{placement === "hero" && <ArrowRight className="size-4" aria-hidden />}</Btn>
      </div>
      {cta.note ? (
        <p className="text-sm text-muted-foreground">
          {cta.note}
          {cta.closed ? <> <a className="text-primary underline-offset-4 hover:underline" href="#">Contact support</a></> : null}
        </p>
      ) : null}
    </div>
  );
}

/* ─────────────────────── frame: header / footer ─────────────────────── */

function Header({ ctx, phone }) {
  const cta = resolveCta(ctx);
  return (
    <header className={cx("border-b border-border", !phone && "sticky top-0 z-10 bg-background/90 backdrop-blur")}>
      <nav aria-label="Site" className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-6">
        <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-5 rounded-sm bg-primary/90" />
          Overload
        </a>
        <div className="flex items-center gap-1 sm:gap-2">
          {!phone && (
            <>
              <a href="#" className="px-2 text-sm text-muted-foreground hover:text-foreground">Pricing</a>
              <a href="#" className="px-2 text-sm text-muted-foreground hover:text-foreground">Changelog</a>
            </>
          )}
          {cta.secondary ? <Btn variant="ghost" size="sm">{cta.secondary.label}</Btn> : null}
          {ctx.loading ? <Skel className="h-9 w-28" /> : <Btn size="sm">{cta.primary.label}</Btn>}
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {["Pricing", "Changelog", "Support", "Privacy", "Terms"].map((l) => (
            <a key={l} href="#" className="hover:text-foreground">{l}</a>
          ))}
        </nav>
        <p>© 2026 Overload</p>
      </div>
    </footer>
  );
}

/* ───────────────────── screenshot frame + mocks ───────────────────── */

function Frame({ shot, captured, caption, alt }) {
  return (
    <figure>
      <div role={captured ? undefined : "img"} aria-label={captured ? undefined : "Screenshot not yet captured"} className="relative overflow-hidden rounded-xl border border-border bg-card">
        {captured ? (
          <>
            <div className="absolute right-2 top-2 z-10 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Preview mock — real capture replaces this</div>
            <div aria-label={alt}>{MOCKS[shot]}</div>
          </>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Screenshot coming — captured from demo data before launch.
          </div>
        )}
      </div>
      {caption ? <figcaption className="mt-3 text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}

const Tag = ({ kind }) => (
  <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-medium", kind === "progress" ? "bg-[#2F9E6B]/12 text-[#2F9E6B] dark:text-[#4CC38A]" : "bg-[#B7791F]/12 text-[#B7791F] dark:text-[#E0A93B]")}>
    {kind === "progress" ? "Progress" : "Deload"}
  </span>
);

const MOCKS = {
  today: (
    <div className="space-y-4 p-5 text-sm">
      <p className="text-muted-foreground">Good evening, Demo. Upper A is up.</p>
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-medium">Upper A</p>
          <p className="text-xs text-muted-foreground">Northside Strength · Week 7</p>
        </div>
        <ul className="mt-3 divide-y divide-border">
          <li className="py-2.5">
            <div className="flex items-center gap-2">Barbell Bench Press <Tag kind="progress" /></div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">Ready to go up · try 190 lbs. 3 × 8 at 185 two sessions running.</p>
          </li>
          <li className="py-2.5">
            <div>Seated Cable Row</div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">Hold at 140 lbs · 2 reps short of the top.</p>
          </li>
          <li className="py-2.5">
            <div className="flex items-center gap-2">Overhead Press <Tag kind="deload" /></div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">Sets fell short twice at 115 lbs.</p>
          </li>
          <li className="py-2.5">Chest Press Machine</li>
        </ul>
        <div className="mt-3 h-10 rounded-lg bg-primary/90 text-center text-sm leading-10 text-primary-foreground">Start workout</div>
      </div>
    </div>
  ),
  logging: (
    <div className="space-y-3 p-5 text-sm">
      <div className="flex items-baseline justify-between"><p className="font-medium">Barbell Bench Press</p><p className="text-xs text-muted-foreground">3 × 6–8</p></div>
      <p className="text-xs text-muted-foreground tabular-nums">Last time · 185 × 8, 8, 7</p>
      {[[1, 185, 8], [2, 185, 8]].map(([n, w, r]) => (
        <div key={n} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 tabular-nums">
          <span className="text-muted-foreground">Set {n}</span><span className="text-lg font-semibold tracking-tight">{w} <span className="text-xs font-normal text-muted-foreground">lbs</span> × {r}</span>
        </div>
      ))}
      <div className="flex items-center justify-between rounded-lg border border-primary/50 px-3 py-2 tabular-nums">
        <span className="text-muted-foreground">Set 3</span><span className="text-lg font-semibold tracking-tight">185 <span className="text-xs font-normal text-muted-foreground">lbs</span> × <span className="inline-block w-8 border-b border-primary text-center">&nbsp;</span></span>
      </div>
    </div>
  ),
  exercise: (
    <div className="space-y-3 p-5 text-sm">
      <p className="font-medium">Barbell Bench Press</p>
      <div className="rounded-lg border border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">Next time</p>
        <p className="mt-1 flex items-center gap-2">Ready to go up · try 190 lbs <Tag kind="progress" /></p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">Hit 8, 8, 8 at 185 on Oct 27 and Oct 30 — the top of 6–8, two sessions running.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
        {[["Best set", "185 × 8"], ["Heaviest", "185 lbs"], ["Best e1RM", "234 est."]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border p-2"><p className="text-muted-foreground">{k}</p><p className="mt-0.5 font-medium">{v}</p></div>
        ))}
      </div>
    </div>
  ),
  gymA: (
    <div className="space-y-2 p-5 text-sm">
      <p className="font-medium">Chest Press Machine</p>
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs"><span className="rounded-md bg-muted px-2 py-1">Northside Strength</span><span className="px-2 py-1 text-muted-foreground">Riverside Fitness</span></div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">130 <span className="text-sm font-normal text-muted-foreground">lbs working weight</span></p>
      <p className="text-xs text-muted-foreground">Last at this gym · 130 × 10, 10, 9</p>
    </div>
  ),
  gymB: (
    <div className="space-y-2 p-5 text-sm">
      <p className="font-medium">Chest Press Machine</p>
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs"><span className="px-2 py-1 text-muted-foreground">Northside Strength</span><span className="rounded-md bg-muted px-2 py-1">Riverside Fitness</span></div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">160 <span className="text-sm font-normal text-muted-foreground">lbs working weight</span></p>
      <p className="text-xs text-muted-foreground">Last at this gym · 160 × 10, 9, 9</p>
    </div>
  ),
  trend: (
    <div className="p-5 text-sm">
      <p className="font-medium">e1RM trend · Barbell Bench Press</p>
      <svg viewBox="0 0 300 120" className="mt-3 w-full" aria-hidden>
        {[20, 50, 80, 110].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} className="stroke-border" strokeWidth="1" />)}
        <rect x="188" y="10" width="36" height="100" className="fill-muted" />
        <polyline fill="none" className="stroke-primary" strokeWidth="2" points="0,96 30,90 60,88 90,80 120,82 150,72 180,70 206,84 240,62 270,58 300,50" />
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">Shaded: scheduled deload week.</p>
    </div>
  ),
};

/* ───────────────────────────── screens ───────────────────────────── */

function HeroConcepts({ ctx }) {
  const concepts = [
    { key: "A", chosen: true, h: "You logged the reps. Know what to do next.", p: "Overload reads each set you log against the plan you wrote, then makes the call for every lift: go up, hold, or back off.", shot: "today", why: "Core job in one line; the screen is the answer. True for every visitor." },
    { key: "B", h: "Your notes say 185 × 8. They can't say whether to go up.", p: "Keep the plan you already wrote. Overload keeps every set and tells you what the numbers mean.", notes: true, why: "Speaks to Notes users, but opens on the problem, not the product." },
    { key: "C", h: "One exercise. Two gyms. Two working weights.", p: "Machine weights aren't universal. Overload keeps a working weight per gym, so the number fits the machine in front of you.", shot: "gymA", why: "Memorable and unique, but only matters to multi-gym lifters." },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 md:px-6">
      <p className="text-sm text-muted-foreground">Three honest hero concepts (design doc §6 Screen 1). Each rests on a real screen. <strong className="font-medium text-foreground">A is chosen</strong>; B becomes section 2, C becomes section 4.</p>
      {concepts.map((c) => (
        <section key={c.key} className={cx("grid gap-8 rounded-xl border p-6 md:grid-cols-12", c.chosen ? "border-primary/50" : "border-border")}>
          <div className="space-y-5 md:col-span-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Concept {c.key}{c.chosen ? " · chosen" : ""}</p>
            <h2 className="text-3xl font-semibold tracking-tight">{c.h}</h2>
            <p className="text-base leading-relaxed text-muted-foreground">{c.p}</p>
            <ModeCta ctx={ctx} />
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">{c.why}</p>
          </div>
          <div className="md:col-span-7">
            {c.notes ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <pre className="rounded-xl border border-border bg-card p-4 font-mono text-xs leading-relaxed text-muted-foreground">{"Upper A\nBench 185x8 185x8 185x7\nRow 140x10 x10 x9\nOHP 115x6 x5 x5\n\n(last week's numbers\n overwritten)"}</pre>
                <Frame shot="logging" captured={ctx.shots} />
              </div>
            ) : (
              <Frame shot={c.shot} captured={ctx.shots} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function Feature({ n, title, pro, children, shot, flip, ctx, caption }) {
  return (
    <section className="border-t border-border">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 md:grid-cols-12 md:items-center md:px-6 md:py-24">
        <div className={cx("space-y-4 md:col-span-5", flip && "md:order-2")}>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}{pro ? <ProChip /> : null}</h2>
          <div className="max-w-xl space-y-3 text-base leading-relaxed text-muted-foreground md:text-lg">{children}</div>
        </div>
        <div className={cx("md:col-span-7", flip && "md:order-1")}>{shot}</div>
      </div>
    </section>
  );
}

function Landing({ ctx, phone }) {
  return (
    <>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-12 md:px-6 md:py-24">
        <div className="space-y-6 md:col-span-5 md:self-center">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">You logged the reps. Know what to do next.</h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">Overload reads each set you log against the plan you wrote, then makes the call for every lift: go up, hold, or back off.</p>
          <ModeCta ctx={ctx} />
        </div>
        <div className="md:col-span-7">
          <Frame shot="today" captured={ctx.shots} alt="Overload Today screen: Barbell Bench Press marked ready to go up, try 190 lbs" caption="Demo data. Week 7: bench is ready to go up; the held lifts show nothing extra." />
        </div>
      </section>

      <Feature title="A log tells you what you did." ctx={ctx} shot={<Frame shot="logging" captured={ctx.shots} caption="The last session sits on the card while you log the next one." />}>
        <p>Every set is kept and editable, and it shows up next time: the weight, the reps, at the gym you're in. Nothing gets overwritten.</p>
      </Feature>

      <Feature title="The call, and the reason." pro flip ctx={ctx} shot={<Frame shot="exercise" captured={ctx.shots} caption="The weight to try, and the sets that earned it." />}>
        <p>"Ready to go up" comes with the weight to try and the sets that earned it. A hold says what's left to earn. A deload says where the sets fell short.</p>
        <p>Overload never changes your plan or your weights for you.</p>
      </Feature>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-xl space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Machines aren't universal.</h2>
            <p className="text-base leading-relaxed text-muted-foreground md:text-lg">100 lbs on one chest press isn't 100 lbs on another. Machine and cable weights are tracked per gym. Barbells and dumbbells stay the same everywhere.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Frame shot="gymA" captured={ctx.shots} caption="Northside Strength" />
            <Frame shot="gymB" captured={ctx.shots} caption="Riverside Fitness" />
          </div>
        </div>
      </section>

      <Feature title="A trend, not a list." pro ctx={ctx} shot={<Frame shot="trend" captured={ctx.shots} caption="Estimated 1-rep max by session. Deload weeks are marked, not hidden." />}>
        <p>Estimated 1-rep max over the weeks, so a stall shows up as a flat line instead of a feeling.</p>
      </Feature>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-16 md:px-6 md:py-24">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Logging is free. The call is Pro.</h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="font-medium">Free</p>
              <p className="mt-2 text-muted-foreground">Plans, logging, history, goals, export. No ads.</p>
            </div>
            <div>
              <p className="font-medium">Pro</p>
              <p className="mt-2 text-muted-foreground">The calls and their reasons, e1RM trends and stall detection, exercise history and records.</p>
            </div>
          </div>
          <Btn variant="outline">See pricing</Btn>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-16 md:px-6 md:py-24">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">What Overload won't do.</h2>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">It won't write your program, coach you, show your training to anyone, or run ads. You build the plan. Overload keeps the record and makes the load call inside it.</p>
        </div>
      </section>

      {ctx.releases ? (
        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl space-y-6 px-4 py-16 md:px-6 md:py-24">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Recently shipped</h2>
            <ol className="divide-y divide-border border-t border-border">
              {RELEASES.slice(0, 3).map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:gap-6">
                  <time className="w-28 shrink-0 text-xs font-medium text-muted-foreground tabular-nums sm:pt-0.5">{r.date}</time>
                  <p className="font-medium">{r.title}</p>
                </li>
              ))}
            </ol>
            <Btn variant="link">All updates <ArrowRight className="size-4" aria-hidden /></Btn>
          </div>
        </section>
      ) : null}
    </>
  );
}

function PlanCard({ title, price, children, pro, ctx }) {
  return (
    <div className={cx("flex flex-col rounded-lg border bg-card p-6", pro ? "border-primary/40" : "border-border")}>
      <p className="font-medium">{title}</p>
      <div className="mt-3">{price}</div>
      <div className="mt-6 flex-1">{children}</div>
    </div>
  );
}

function FeatureList({ items }) {
  return (
    <ul className="space-y-2.5 text-sm">
      {items.map((f) => (
        <li key={f} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{f}</li>
      ))}
    </ul>
  );
}

function NotOnSale() {
  return (
    <div className="mt-3 space-y-1.5">
      <Badge>Not on sale yet</Badge>
      <p className="text-sm text-muted-foreground">Pro subscriptions aren't on sale yet. These are the prices when they are.</p>
    </div>
  );
}

function Pricing({ ctx }) {
  const cta = resolveCta(ctx);
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-16 md:px-6 md:py-24">
      <div className="max-w-xl space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Free to log. Pro to decide.</h1>
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">Everything you enter stays yours on either plan.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <PlanCard title="Free" price={<p className="text-3xl font-semibold tabular-nums">$0</p>}>
          <FeatureList items={FREE_FEATURES} />
          <div className="mt-8"><ModeCta ctx={ctx} placement="free-card" /></div>
        </PlanCard>
        <PlanCard pro title="Pro" price={
          <div>
            <p className="text-3xl font-semibold tabular-nums">{PRICES.monthly} <span className="text-base font-normal text-muted-foreground">/ month</span></p>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">or {PRICES.annual} / year (about {PRICES.annualPerMonth} a month)</p>
            {!ctx.billing ? <NotOnSale /> : null}
          </div>
        }>
          <FeatureList items={PRO_FEATURES} />
          <p className="mt-6 text-sm text-muted-foreground">New accounts get 14 days of Pro, no card. After that you're on Free unless you subscribe, and nothing is deleted.</p>
          <div className="mt-8">
            {ctx.loading ? <Skel className="h-11 w-full sm:w-56" /> : cta.pro ? <Btn full>{cta.pro.label}</Btn> : null}
          </div>
        </PlanCard>
      </div>
      <section className="space-y-6 border-t border-border pt-10">
        <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
        <dl className="grid gap-6 md:grid-cols-2">
          {[
            ["What happens when the trial ends?", "You move to Free. Your plans, history, goals, and export stay. The calls and trends are Pro."],
            ["What if I stop paying?", "Same as above. Nothing you logged is deleted, and logging never stops."],
            ["Is there a discount code?", <>BLIZZY gives 50% off the first three monthly bills for first-time subscribers, while redemptions last. <a href="#" className="text-primary underline-offset-4 hover:underline">BLIZZY offer details</a>.{!ctx.billing ? " Subscriptions aren't on sale yet, so it can't be used today." : ""}</>],
            ["Can I take my data with me?", "Yes. Export everything from Settings, any time, on either plan."],
          ].map(([q, a]) => (
            <div key={q}><dt className="font-medium">{q}</dt><dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{a}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function CopyCode() {
  const [state, setState] = React.useState("idle");
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">Code</p>
        <p className="font-mono text-lg tracking-wide select-all">{CODE}</p>
      </div>
      <button type="button" onClick={() => { setState("copied"); setTimeout(() => setState("idle"), 2000); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {state === "copied" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {state === "copied" ? "Copied" : "Copy"}
      </button>
      <span role="status" className="sr-only">{state === "copied" ? "Copied" : ""}</span>
    </div>
  );
}

function Blizzy({ ctx }) {
  const cta = resolveCta(ctx);
  return (
    <div className="mx-auto max-w-2xl space-y-10 px-4 py-16 md:py-24">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">The BLIZZY offer</p>
        <h1 className="text-4xl font-semibold tracking-tight">50% off your first three months of Pro.</h1>
      </div>
      <div>
        <div className="rounded-lg border border-border bg-card p-5">
          <CopyCode />
          <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            {[
              `Monthly plan only (${PRICES.monthly} / month).`,
              "50% off the first three monthly bills, then the regular price.",
              "First-time subscribers only.",
              "Up to 200 redemptions in total, so it can run out.",
              "Entered at checkout. The total shown there is final.",
            ].map((t) => <li key={t} className="flex gap-2.5"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />{t}</li>)}
          </ul>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">This is a promotion for Overload offered through the creator BLIZZY. <span className="rounded bg-primary/10 px-1">‹owner confirms disclosure›</span></p>
      </div>
      <div className="space-y-4">
        {ctx.loading ? <Skel className="h-5 w-72" /> : ctx.billing ? (
          <p className="text-sm text-muted-foreground">Enter BLIZZY at checkout on the monthly plan. Checkout shows whether it applies to you.</p>
        ) : (
          <div className="space-y-1.5"><Badge>Not on sale yet</Badge><p className="text-sm text-muted-foreground">Pro subscriptions aren't on sale yet, so the code can't be used today. When they are, you'll enter it at checkout on the monthly plan.</p></div>
        )}
        {ctx.signedIn && ctx.billing ? <Btn>{cta.pro.label}</Btn> : <ModeCta ctx={ctx} placement="offer" />}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">How it fits the trial: new accounts start with 14 days of Pro, no card. The code is for when you subscribe after that.</p>
      <section className="space-y-3 border-t border-border pt-8">
        <h2 className="text-lg font-semibold">What Overload is</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">A workout log for lifters who write their own plan. It keeps every set and, on Pro, makes the call for each lift: go up, hold, or back off.</p>
        <Btn variant="link">How it works <ArrowRight className="size-4" aria-hidden /></Btn>
      </section>
    </div>
  );
}

function Changelog({ ctx }) {
  const entries = ctx.releases ? RELEASES : [];
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-16 md:py-24">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Changelog</h1>
        <p className="text-base text-muted-foreground">Every update to Overload, newest first. Lifters see the same notes in the app under What's New.</p>
      </div>
      {entries.length === 0 ? (
        <p className="border-t border-border pt-5 text-sm text-muted-foreground">No updates yet. When something changes in Overload, it's listed here.</p>
      ) : (
        <ol className="divide-y divide-border border-t border-border">
          {entries.map((e) => (
            <li key={e.id} id={e.id} className="py-5">
              <article className="flex flex-col gap-1">
                <time className="text-xs font-medium text-muted-foreground tabular-nums">{e.date}</time>
                <h2 className="text-base font-semibold">{e.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{e.body}</p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const Fact = ({ children }) => <span className="rounded bg-primary/10 px-1 text-foreground">‹{children}›</span>;

function Legal({ kind, ctx }) {
  const title = kind === "privacy" ? "Privacy policy" : "Terms of service";
  if (ctx.legal === "finalizing") {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-16 md:py-24">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">Our {title.toLowerCase()} {kind === "privacy" ? "is" : "are"} being finalized and will be published at this address.</p>
        <p className="text-base leading-relaxed text-muted-foreground">
          Until then, questions {kind === "privacy" ? "about your data" : ""} go to <a className="text-primary underline-offset-4 hover:underline" href="#">{SUPPORT}</a>.
          {kind === "privacy" ? " You can export or delete your account from Settings at any time." : ""}
        </p>
      </div>
    );
  }
  const draft = ctx.legal === "draft";
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-16 md:py-24">
      {draft ? (
        <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
          <p className="font-medium">Draft for owner review — not in effect</p>
          <p className="mt-1 text-muted-foreground">Highlighted items are facts the owner must supply. This draft is shown only outside production.</p>
        </div>
      ) : null}
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Effective {draft ? <Fact>Date the policy is published</Fact> : "December 1, 2026"}</p>
      </header>
      <div className="space-y-5 text-base leading-relaxed text-muted-foreground">
        {kind === "privacy" ? (
          <>
            <p>Overload ("Overload," "we," "us," or "our") is a strength-training web application operated by {draft ? <Fact>Legal name of owner or business</Fact> : "Example Operator LLC"}.</p>
            <h2 className="pt-2 text-xl font-semibold text-foreground">Information we collect</h2>
            <p><span className="font-medium text-foreground">Account information.</span> When you create an account, we collect your name, email address, and the authentication information needed to sign you in…</p>
            <h2 className="pt-2 text-xl font-semibold text-foreground">Cookies and similar technologies</h2>
            <p>Overload uses cookies to keep you signed in. If you arrive from a campaign page such as /blizzy, a first-party cookie remembers that campaign for up to two hours…</p>
          </>
        ) : (
          <>
            <p>These Terms of Service govern your use of Overload, the strength-training web application at www.overloadtraining.app, operated by {draft ? <Fact>Legal name of owner or business</Fact> : "Example Operator LLC"}.</p>
            <h2 className="pt-2 text-xl font-semibold text-foreground">What Overload does</h2>
            <p>Overload lets you organize workouts, log training, keep workout history, and, when eligible for Pro, view progression information derived from your logged performance…</p>
            <h2 className="pt-2 text-xl font-semibold text-foreground">Accounts and eligibility</h2>
            <p>You must be at least {draft ? <Fact>Minimum account age</Fact> : "18"} years old to create an account…</p>
          </>
        )}
      </div>
    </article>
  );
}

function SettingsLinks() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed-in app · bottom of Settings (excerpt)</p>
      <div className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
        <div className="flex items-center justify-between p-4"><span>What's New</span><span className="text-muted-foreground">›</span></div>
        <div className="flex items-center justify-between p-4"><span className="text-destructive">Delete account</span><span className="text-muted-foreground">›</span></div>
      </div>
      <nav aria-label="Legal" className="flex gap-3 text-xs text-muted-foreground">
        <a href="#" className="hover:text-foreground">Changelog</a><span aria-hidden>·</span>
        <a href="#" className="hover:text-foreground">Privacy</a><span aria-hidden>·</span>
        <a href="#" className="hover:text-foreground">Terms</a>
      </nav>
    </div>
  );
}

function BillingReminder({ ctx }) {
  const shown = ctx.billing;
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed-in app · Settings › Plan & Billing (existing screen, excerpt)</p>
      <div className="space-y-4 rounded-lg border border-border bg-card p-5 text-sm">
        <p className="font-medium">Free</p>
        <p className="text-muted-foreground">You're on Free. Logging, history, goals, and export stay free.</p>
        {shown ? (
          <>
            <div className="flex flex-col gap-2 rounded-md bg-primary/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p>Have the BLIZZY code? Enter <span className="font-mono">BLIZZY</span> at checkout on the monthly plan.</p>
              <button type="button" className="inline-flex h-8 items-center gap-1.5 self-start rounded-md border border-border bg-background px-2.5 text-xs font-medium"><Copy className="size-3.5" aria-hidden />Copy</button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Btn full>Subscribe monthly · $4.99</Btn>
              <Btn variant="outline" full>Subscribe yearly · $39.99</Btn>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Pro subscriptions aren’t available yet — everything you log stays free. <span className="text-xs">(no reminder line while billing is off)</span></p>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── chrome ───────────────────────────── */

const SCREENS = [
  ["concepts", "Hero concepts"],
  ["landing", "Landing /"],
  ["pricing", "Pricing"],
  ["blizzy", "/blizzy"],
  ["changelog", "Changelog"],
  ["privacy", "Privacy"],
  ["terms", "Terms"],
  ["settings", "Settings links"],
  ["billing", "Plan & Billing reminder"],
  ["matrix", "CTA matrix"],
];

function Seg({ label, value, options, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-neutral-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs text-neutral-900">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Matrix() {
  const rows = [];
  for (const signedIn of [true, false]) for (const mode of signedIn ? ["any"] : ["public", "invite", "closed"]) for (const billing of [false, true]) {
    const c = resolveCta({ signedIn, mode, billing });
    rows.push({ signedIn, mode, billing, c });
  }
  return (
    <div className="mx-auto max-w-5xl overflow-x-auto px-4 py-10">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted-foreground"><tr>{["Visitor", "Mode", "Billing", "Primary", "Note", "Pro card"].map((h) => <th key={h} className="border-b border-border py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              <td className="border-b border-border py-2 pr-4">{r.signedIn ? "Signed in" : "Signed out"}</td>
              <td className="border-b border-border py-2 pr-4">{r.mode}</td>
              <td className="border-b border-border py-2 pr-4">{r.billing ? "on" : "off"}</td>
              <td className="border-b border-border py-2 pr-4 font-medium">{r.c.primary.label}</td>
              <td className="border-b border-border py-2 pr-4 text-muted-foreground">{r.c.note ?? "—"}</td>
              <td className="border-b border-border py-2 pr-4">{r.c.pro ? r.c.pro.label : <Badge>Not on sale yet</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-muted-foreground">Banned-phrase review list: {BANNED.join(" · ")}</p>
    </div>
  );
}

export default function PublicLandingPreview() {
  const [screen, setScreen] = React.useState("landing");
  const [signedIn, setSignedIn] = React.useState("out");
  const [mode, setMode] = React.useState("invite");
  const [billing, setBilling] = React.useState("off");
  const [width, setWidth] = React.useState("phone");
  const [dark, setDark] = React.useState("light");
  const [legal, setLegal] = React.useState("draft");
  const [shots, setShots] = React.useState("captured");
  const [loading, setLoading] = React.useState("no");
  const [releases, setReleases] = React.useState("some");

  const ctx = {
    signedIn: signedIn === "in",
    mode,
    billing: billing === "on",
    legal,
    shots: shots === "captured",
    loading: loading === "yes",
    releases: releases === "some",
  };
  const phone = width === "phone";
  const marketing = !["settings", "billing", "matrix"].includes(screen);

  return (
    <div className="min-h-screen bg-neutral-100 p-4 font-sans text-neutral-900">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-300 bg-white p-3">
        <Seg label="Screen" value={screen} onChange={setScreen} options={SCREENS} />
        <Seg label="Visitor" value={signedIn} onChange={setSignedIn} options={[["out", "Signed out"], ["in", "Signed in"]]} />
        <Seg label="Signup" value={mode} onChange={setMode} options={[["closed", "closed"], ["invite", "invite"], ["public", "public"]]} />
        <Seg label="Billing" value={billing} onChange={setBilling} options={[["off", "off (production today)"], ["on", "on"]]} />
        <Seg label="Width" value={width} onChange={setWidth} options={[["phone", "Phone 390"], ["desktop", "Desktop 1280"]]} />
        <Seg label="Appearance" value={dark} onChange={setDark} options={[["light", "Light"], ["dark", "Dark"]]} />
        <Seg label="Legal" value={legal} onChange={setLegal} options={[["draft", "Draft preview (non-prod)"], ["finalizing", "Being finalized (prod)"], ["published", "Published"]]} />
        <Seg label="Screenshots" value={shots} onChange={setShots} options={[["captured", "Captured"], ["pending", "Pending frame"]]} />
        <Seg label="CTA" value={loading} onChange={setLoading} options={[["no", "Resolved"], ["yes", "Streaming (skeleton)"]]} />
        <Seg label="Release notes" value={releases} onChange={setReleases} options={[["some", "Some"], ["none", "None (empty)"]]} />
      </div>

      <div className={cx(dark === "dark" && "dark")}>
        <div className={cx("mx-auto overflow-hidden rounded-xl border border-neutral-300 bg-background text-foreground shadow-sm", phone ? "max-w-[390px]" : "max-w-[1280px]")}>
          {marketing ? (
            <>
              <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-background focus:px-3 focus:py-2">Skip to content</a>
              <Header ctx={ctx} phone={phone} />
              <main id="main">
                {screen === "concepts" && <HeroConcepts ctx={ctx} />}
                {screen === "landing" && (ctx.signedIn ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">Signed in: <code>/</code> renders Today (the app), unchanged. No marketing page in between. Open any other public page to see “Open Overload”.</div>
                ) : <Landing ctx={ctx} phone={phone} />)}
                {screen === "pricing" && <Pricing ctx={ctx} />}
                {screen === "blizzy" && <Blizzy ctx={ctx} />}
                {screen === "changelog" && <Changelog ctx={ctx} />}
                {screen === "privacy" && <Legal kind="privacy" ctx={ctx} />}
                {screen === "terms" && <Legal kind="terms" ctx={ctx} />}
              </main>
              <Footer />
            </>
          ) : (
            <>
              {screen === "settings" && <SettingsLinks />}
              {screen === "billing" && <BillingReminder ctx={ctx} />}
              {screen === "matrix" && <Matrix />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
