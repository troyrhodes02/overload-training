/* eslint-disable */
// @ts-nocheck
/**
 * Progressive Overload Engine — UI Design Preview (implementation contract)
 * =========================================================================
 * Pitch 5 · generated from docs/design/05-progressive-overload-engine-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. It is a standalone,
 * offline, mock-data-only gallery used as the visual contract the spec and
 * implementation tickets are held to. It is deliberately disconnected from
 * Prisma, Supabase, server actions, and every real API — all data below is
 * hardcoded mock training data. It is excluded from the app's typecheck, lint,
 * and format (see tsconfig.json / eslint.config.mjs / .prettierignore) and is
 * never imported into the application. The real UI is built with shadcn/ui
 * against the theme in src/app/globals.css; where this preview and the theme
 * disagree, the theme wins. The real e1RM chart uses Recharts; the inline SVG
 * here only stands in for its visual shape.
 *
 * Tailwind utility classes use Overload's semantic theme tokens (bg-card,
 * text-muted-foreground, border-border, bg-primary, text-progress, text-deload…)
 * so the contract reads in the same vocabulary as the implementation. Numbers
 * use tabular-nums. The ONLY colored elements are the accent (primary, the chart
 * line) and the progress green / deload amber tags. A "Hold" is simply an
 * untagged row — there is no gray "Hold" badge anywhere.
 *
 * The defining distinctions this preview must make legible:
 *   • Progress (green tag, +5 lb)  vs  reactive Deload (amber tag)
 *   • reactive Deload (per-exercise, amber tag)  vs  scheduled Deload
 *     (mesocycle-wide muted banner, 90% load, NO reactive tags at all)
 *   • stalled Progress candidate (amber "Hold — trend flat", NEVER "Deload")
 *     vs  ordinary Hold (nothing)  vs  reactive Deload
 *   • gym-variable machine trend is gym-scoped (selector); no cross-gym line.
 *
 * Coverage: dashboard (free-weight tagged / machine pre-gym / scheduled-deload
 * week) · logging card (Progress+5 / reactive Deload / stalled / scheduled
 * deload 90% / insufficient history) · session summary (per-lift calls /
 * scheduled-deload) · exercise progression detail (gym-consistent w/ chart /
 * gym-variable w/ gym selector) · chart states (none / 1 / 2 / 3+ / scheduled-
 * deload point / corrected) · past-log edit propagation · dark mode · loading.
 */
import * as React from "react";

/* ─────────────────────────── mock training data ─────────────────────────── */

const MESO = "Hypertrophy Block 3";

// e1RM session points (date, e1rm, scheduledDeload?) — gym-consistent lift.
const BENCH_POINTS = [
  { date: "Aug 2", e1rm: 211 },
  { date: "Aug 9", e1rm: 216 },
  { date: "Aug 16", e1rm: 221 },
  { date: "Aug 23", e1rm: 225 },
  { date: "Aug 30", e1rm: 229, deload: true }, // scheduled-deload week, marked, excluded from calls
  { date: "Sep 6", e1rm: 231 },
  { date: "Sep 13", e1rm: 234 },
];

// Gym-variable machine, Downtown scope only (no cross-gym line).
const CHESTPRESS_DOWNTOWN = [
  { date: "Aug 4", e1rm: 118 },
  { date: "Aug 11", e1rm: 122 },
  { date: "Aug 18", e1rm: 125 },
  { date: "Aug 25", e1rm: 128 },
  { date: "Sep 8", e1rm: 128 },
];

// A flat window → stalled Progress candidate.
const LATRAISE_FLAT = [
  { date: "Sep 1", e1rm: 92 },
  { date: "Sep 8", e1rm: 92 },
  { date: "Sep 15", e1rm: 91 },
];

/* ───────────────────────────── preview chrome ───────────────────────────── */

function Frame({ name, route, tag, dark, children }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3 text-xs text-neutral-500">
        <span className="font-medium text-neutral-700">{name}</span>
        <span className="flex items-center gap-2">
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600">
            {route}
          </code>
          {tag ? (
            <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              {tag}
            </span>
          ) : null}
        </span>
      </figcaption>
      {/* .ov = product surface. data-ov flips the appearance mode. */}
      <div
        data-ov={dark ? "dark" : "light"}
        className={
          (dark ? "dark " : "") +
          "ov w-[390px] overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm"
        }
      >
        {children}
      </div>
    </figure>
  );
}

function Shell({ active = "Today", children }) {
  return (
    <div className="flex min-h-[720px] flex-col">
      <header className="flex h-12 items-center border-b border-border px-4 text-sm font-semibold">
        Overload
      </header>
      <main className="flex-1 p-4">{children}</main>
      <nav className="grid grid-cols-4 border-t border-border text-center text-[11px]">
        {["Today", "Plan", "History", "Goals"].map((item) => (
          <div
            key={item}
            className={
              "py-3 " +
              (item === active
                ? "font-medium text-foreground"
                : "text-muted-foreground")
            }
          >
            {item}
          </div>
        ))}
      </nav>
    </div>
  );
}

function PrimaryAction({ children, disabled }) {
  return (
    <div className="border-t border-border p-3">
      <button
        disabled={disabled}
        className={
          "h-11 w-full rounded-md text-sm font-medium " +
          (disabled
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground")
        }
      >
        {children}
      </button>
    </div>
  );
}

/* ── the load-bearing shared component: ProgressTag (null for Hold) ── */
function ProgressTag({ state }) {
  if (state === "progress")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-progress/10 px-2 py-0.5 text-xs font-medium text-progress">
        Progress
      </span>
    );
  if (state === "deload")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-deload/10 px-2 py-0.5 text-xs font-medium text-deload">
        Deload
      </span>
    );
  if (state === "stalled")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-deload/10 px-2 py-0.5 text-xs font-medium text-deload">
        <Triangle /> Hold — trend flat
      </span>
    );
  return null; // Hold, insufficient history, scheduled-deload suppression → nothing
}

function Triangle() {
  // lucide triangle-alert, stroke-only, sized to the badge
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function DeloadBanner() {
  return (
    <div className="mb-3 rounded-md bg-muted px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground">
      DELOAD WEEK · 90% LOAD ACROSS THE SPLIT
    </div>
  );
}

/* ── inline SVG stand-in for the Recharts e1RM line (theme-token styled) ── */
function E1rmChart({ points, height = 150 }) {
  const w = 320;
  const h = height;
  const padX = 10;
  const padY = 16;
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
        style={{ height: h }}
      >
        No logged sessions yet
      </div>
    );
  }
  const vals = points.map((p) => p.e1rm);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const stepX =
    points.length === 1 ? 0 : (w - padX * 2) / (points.length - 1);
  const xy = points.map((p, i) => {
    const x = points.length === 1 ? w / 2 : padX + i * stepX;
    const y = padY + (h - padY * 2) * (1 - (p.e1rm - min) / span);
    return { ...p, x, y };
  });
  const path = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label="e1RM trend"
    >
      {/* light grid baseline */}
      <line
        x1={padX}
        x2={w - padX}
        y1={h - padY}
        y2={h - padY}
        className="stroke-border"
        strokeWidth="1"
      />
      {points.length > 1 && (
        <path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {xy.map((p, i) =>
        p.deload ? (
          // scheduled-deload point: muted hollow SQUARE — shape + color differ
          <rect
            key={i}
            x={p.x - 3.5}
            y={p.y - 3.5}
            width="7"
            height="7"
            className="fill-background stroke-muted-foreground"
            strokeWidth="1.5"
          />
        ) : (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === xy.length - 1 ? 4 : 3}
            className="fill-primary"
          />
        ),
      )}
    </svg>
  );
}

function ChartCard({ points, caption, current, scope, height }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium">
          e1RM trend{scope ? <span className="text-muted-foreground"> · {scope}</span> : null}
        </p>
        {current != null && (
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">Current</div>
            <div className="text-lg font-semibold tabular-nums tracking-tight">
              {current} lb
            </div>
          </div>
        )}
      </div>
      <E1rmChart points={points} height={height} />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{points[0]?.date}</span>
        <span>{points[points.length - 1]?.date}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{caption}</p>
    </div>
  );
}

function Suggested({ children }) {
  return (
    <span className="text-muted-foreground tabular-nums">{children}</span>
  );
}

/* ─────────────────────────── 1 · dashboard states ───────────────────────── */

function DashboardPendingPreGym() {
  // Free-weight lifts show their tag now; machine lifts wait for the gym.
  return (
    <Shell active="Today">
      <p className="text-xs text-muted-foreground">Wednesday · Week 2</p>
      <h1 className="mb-4 text-lg font-semibold">Push Day 1</h1>
      <div className="divide-y divide-border rounded-lg border border-border">
        {[
          { n: "Barbell Bench Press", s: "3 × 6–8", tag: "progress" },
          { n: "Overhead Press", s: "3 × 5–6", tag: null },
          { n: "Chest Press Machine", s: "3 × 8–10", gym: true },
          { n: "Triceps Pushdown", s: "3 × 10–12", gym: true },
        ].map((e) => (
          <div key={e.n} className="flex items-center justify-between gap-2 p-3">
            <div>
              <div className="text-sm font-medium">{e.n}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {e.s}
                {e.gym ? (
                  <span className="ml-1 text-muted-foreground">· once gym is set</span>
                ) : null}
              </div>
            </div>
            <ProgressTag state={e.tag} />
          </div>
        ))}
      </div>
      <PrimaryAction>Start workout</PrimaryAction>
    </Shell>
  );
}

function DashboardScheduledDeload() {
  return (
    <Shell active="Today">
      <DeloadBanner />
      <p className="text-xs text-muted-foreground">Wednesday · Week 5</p>
      <h1 className="mb-4 text-lg font-semibold">Push Day 1</h1>
      <div className="divide-y divide-border rounded-lg border border-border">
        {[
          { n: "Barbell Bench Press", s: "3 × 6–8", load: "165 lb" },
          { n: "Overhead Press", s: "3 × 5–6", load: "95 lb" },
          { n: "Chest Press Machine", s: "3 × 8–10", gym: true },
        ].map((e) => (
          <div key={e.n} className="flex items-center justify-between gap-2 p-3">
            <div>
              <div className="text-sm font-medium">{e.n}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{e.s}</div>
            </div>
            {/* NO reactive tag during scheduled deload — only the reduced load */}
            {e.gym ? (
              <Suggested>· once gym is set</Suggested>
            ) : (
              <Suggested>{e.load} (90%)</Suggested>
            )}
          </div>
        ))}
      </div>
      <PrimaryAction>Start workout</PrimaryAction>
    </Shell>
  );
}

/* ─────────────────────────── 2 · logging cards ──────────────────────────── */

function SetRows({ prefilled }) {
  const rows = prefilled ?? [
    ["", ""],
    ["", ""],
    ["", ""],
  ];
  return (
    <div className="space-y-2 tabular-nums">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-12 text-muted-foreground">Set {i + 1}</span>
          <span className="flex h-11 flex-1 items-center justify-center rounded-md border border-border">
            {r[0] || "—"} <span className="ml-1 text-muted-foreground">lb</span>
          </span>
          <span className="flex h-11 flex-1 items-center justify-center rounded-md border border-border">
            {r[1] || "—"} <span className="ml-1 text-muted-foreground">reps</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function CardHeader({ title, scheme, gym, tag, suggest }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-base font-medium">{title}</div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {scheme}
          {gym ? ` · ${gym}` : ""}
          {suggest ? <span className="ml-2">{suggest}</span> : null}
        </div>
      </div>
      <ProgressTag state={tag} />
    </div>
  );
}

function LoggingCard({ title, scheme, gym, tag, suggest, note, prefilled, step }) {
  return (
    <Shell active="Today">
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>‹ Push Day 1</span>
        <span className="tabular-nums">{step}</span>
      </div>
      <div className="space-y-4 rounded-lg border border-border p-4">
        <CardHeader title={title} scheme={scheme} gym={gym} tag={tag} suggest={suggest} />
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
        <SetRows prefilled={prefilled} />
        <div className="flex items-center justify-between">
          <button className="text-sm text-muted-foreground">Swap exercise</button>
          <button className="text-sm text-primary">View trend ›</button>
        </div>
      </div>
      <PrimaryAction>Next: Overhead Press</PrimaryAction>
    </Shell>
  );
}

/* ─────────────────────────── 3 · session summary ────────────────────────── */

function SummaryRow({ name, tag, next }) {
  return (
    <div className="flex items-center justify-between gap-2 p-3">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">
          {name}
          <ProgressTag state={tag} />
        </div>
        {next ? (
          <div className="text-xs text-muted-foreground tabular-nums">{next}</div>
        ) : null}
      </div>
      <button className="text-xs text-primary">trend ›</button>
    </div>
  );
}

function SessionSummary({ deloadWeek }) {
  return (
    <Shell active="Today">
      <h1 className="text-lg font-semibold">Push Day 1 · complete</h1>
      <p className="mb-3 text-xs text-muted-foreground">
        Wednesday · Week {deloadWeek ? "5" : "2"} · Downtown Gym
      </p>
      {deloadWeek && (
        <div className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Deload week — recovery, not a verdict.
        </div>
      )}
      <div className="divide-y divide-border rounded-lg border border-border">
        {deloadWeek ? (
          <>
            <SummaryRow name="Barbell Bench Press" tag={null} />
            <SummaryRow name="Overhead Press" tag={null} />
            <SummaryRow name="Chest Press Machine" tag={null} />
          </>
        ) : (
          <>
            <SummaryRow
              name="Barbell Bench Press"
              tag="progress"
              next="Suggested next: 190 lb (+5)"
            />
            <SummaryRow name="Overhead Press" tag={null} />
            <SummaryRow name="Chest Press Machine" tag="deload" />
            <SummaryRow name="Triceps Pushdown" tag="stalled" />
          </>
        )}
      </div>
      <PrimaryAction>Done</PrimaryAction>
    </Shell>
  );
}

/* ─────────────────────── 4 · exercise progression detail ─────────────────── */

function DetailShell({ children, active = "Plan" }) {
  return (
    <Shell active={active}>
      <div className="mb-3 text-xs text-muted-foreground">‹ Exercises</div>
      {children}
    </Shell>
  );
}

function ExerciseHeader({ name, badges, archived }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-2">
      <h1
        className={
          "text-xl font-semibold" + (archived ? " text-muted-foreground" : "")
        }
      >
        {name}
      </h1>
      <div className="flex gap-1">
        {badges.map((b) => (
          <span
            key={b}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
          >
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

function DetailGymConsistent() {
  return (
    <DetailShell>
      <ExerciseHeader name="Barbell Bench Press" badges={["Barbell", "Chest"]} />
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Progression</h2>
        </div>
        <div className="flex items-center gap-3">
          <ProgressTag state="progress" />
          <Suggested>Suggested next: 190 lb (+5)</Suggested>
        </div>
        <ChartCard
          points={BENCH_POINTS}
          current={234}
          caption="7 sessions · Epley estimate · □ deload week"
        />
      </section>
    </DetailShell>
  );
}

function DetailGymVariable() {
  return (
    <DetailShell>
      <ExerciseHeader name="Chest Press Machine" badges={["Machine", "Chest"]} />
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Progression</h2>
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
            Gym: Downtown ▾
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ProgressTag state="progress" />
          <Suggested>Suggested next: 95 lb (+5)</Suggested>
        </div>
        <ChartCard
          points={CHESTPRESS_DOWNTOWN}
          current={128}
          scope="Downtown"
          caption="5 sessions at Downtown · Epley estimate"
        />
        <p className="rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          Campus Rec history is tracked separately — machine pounds aren't
          comparable between gyms. Switch the gym above to see its own trend.
        </p>
      </section>
    </DetailShell>
  );
}

/* ─────────────────────────── 5 · chart states ───────────────────────────── */

function ChartStateCard({ label, points, current, caption }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      <ChartCard points={points} current={current} caption={caption} height={110} />
    </div>
  );
}

/* ─────────────────────────────── gallery ────────────────────────────────── */

export default function Preview() {
  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8 font-sans text-neutral-900">
      <header className="mx-auto mb-8 max-w-6xl">
        <div className="text-sm font-semibold">
          Overload · Progressive Overload Engine
        </div>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          The tag is a conclusion, not a control. Progress / Hold / reactive
          Deload / scheduled Deload / stalled candidate — each read on demand
          from logged history, never stored. Hold shows nothing; the
          progress/deload colors appear only on their tags and the accent only
          on the chart line.
        </p>
        <p className="mt-2 inline-block rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-600">
          Rendering of the design — not product code. The app is built with
          shadcn/ui against src/app/globals.css; the real chart uses Recharts.
        </p>
      </header>

      <Section n="01" title="Dashboard — tags appear only when the context can honestly say so">
        <Frame
          name="Today · pending (before gym)"
          route="/"
          tag="free-weight tagged · machine waits"
        >
          <DashboardPendingPreGym />
        </Frame>
        <Frame
          name="Today · scheduled deload week"
          route="/"
          tag="90% load · no reactive tags"
        >
          <DashboardScheduledDeload />
        </Frame>
        <Frame name="Today · scheduled deload (dark)" route="/" tag="dark mode" dark>
          <DashboardScheduledDeload />
        </Frame>
      </Section>

      <Section n="02" title="Logging card — the call sits beside the bar, never blocks entry">
        <Frame name="Progress (free weight)" route="/log/[id]" tag="green · +5 lb">
          <LoggingCard
            title="Barbell Bench Press"
            scheme="3 × 6–8"
            tag="progress"
            suggest="Try 190 lb (+5)"
            step="1 / 4"
            prefilled={[["185", "8"], ["185", "8"], ["185", ""]]}
          />
        </Frame>
        <Frame name="Reactive Deload (machine)" route="/log/[id]" tag="amber · gym-scoped">
          <LoggingCard
            title="Chest Press Machine"
            scheme="3 × 8–10"
            gym="Downtown"
            tag="deload"
            note="Back the weight down at your discretion — no forced number."
            step="3 / 4"
          />
        </Frame>
        <Frame name="Stalled Progress candidate" route="/log/[id]" tag="NOT a deload">
          <LoggingCard
            title="Lateral Raise"
            scheme="3 × 12–15"
            tag="stalled"
            note="Rep target met, but e1RM flat across 3 sessions — holding."
            step="4 / 4"
          />
        </Frame>
        <Frame name="Scheduled deload (reactive suppressed)" route="/log/[id]" tag="90% · no tag">
          <LoggingCard
            title="Barbell Bench Press"
            scheme="3 × 6–8 · deload week"
            tag={null}
            suggest="Try 165 lb (90%)"
            step="1 / 4"
          />
        </Frame>
        <Frame name="Insufficient history (Hold)" route="/log/[id]" tag="2nd time · no tag">
          <LoggingCard
            title="Seated Leg Curl"
            scheme="3 × 10–12"
            tag={null}
            step="2 / 4"
          />
        </Frame>
      </Section>

      <Section n="03" title="Session summary — the first time interpretation enters completion">
        <Frame name="Summary · per-lift calls" route="/log/[id]" tag="no celebration">
          <SessionSummary />
        </Frame>
        <Frame name="Summary · scheduled deload" route="/log/[id]" tag="no reactive calls">
          <SessionSummary deloadWeek />
        </Frame>
      </Section>

      <Section n="04" title="Exercise progression detail — one lift, current call, one trend">
        <Frame name="Gym-consistent · chart" route="/exercises/[id]" tag="global history">
          <DetailGymConsistent />
        </Frame>
        <Frame name="Gym-variable · gym selector" route="/exercises/[id]?gym=" tag="gym-scoped">
          <DetailGymVariable />
        </Frame>
        <Frame name="Detail (dark)" route="/exercises/[id]" tag="dark mode" dark>
          <DetailGymConsistent />
        </Frame>
      </Section>

      <Section n="05" title="Chart states — every honest answer gets a frame">
        <Frame name="Chart states" route="/exercises/[id]" tag="none/1/2/3+">
          <Shell active="Plan">
            <div className="space-y-3">
              <ChartStateCard
                label="No history — a legitimate state, not an error"
                points={[]}
                caption="No logged sessions yet. Train this lift to see its trend."
              />
              <ChartStateCard
                label="One session — a point, not a line"
                points={[{ date: "Sep 13", e1rm: 231 }]}
                current={231}
                caption="1 session — not enough to call progress yet."
              />
              <ChartStateCard
                label="Two sessions — tag eligible, stall gate not yet"
                points={[
                  { date: "Sep 6", e1rm: 229 },
                  { date: "Sep 13", e1rm: 234 },
                ]}
                current={234}
                caption="2 sessions · stall check begins at 3."
              />
            </div>
          </Shell>
        </Frame>
        <Frame name="Flat window → stalled" route="/exercises/[id]" tag="withholds Progress">
          <Shell active="Plan">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <ProgressTag state="stalled" />
                <span className="text-xs text-muted-foreground">
                  rep target met · e1RM not rising
                </span>
              </div>
              <ChartStateCard
                label="Lateral Raise — last 3 e1RM points flat"
                points={LATRAISE_FLAT}
                current={91}
                caption="3 sessions · end ≤ start → Progress withheld."
              />
            </div>
          </Shell>
        </Frame>
        <Frame name="Scheduled-deload point marked" route="/exercises/[id]" tag="□ visible, excluded">
          <Shell active="Plan">
            <ChartStateCard
              label="Deload-week point shown (□), but not counted in calls"
              points={BENCH_POINTS}
              current={234}
              caption="□ = scheduled deload · truthful history, excluded from reactive/stall sequences"
            />
          </Shell>
        </Frame>
      </Section>

      <Section n="06" title="Correcting history — the call follows the data, no recompute">
        <Frame name="Edit a past set" route="dialog" tag="Pitch 4 write path">
          <div className="p-5">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium">Edit set</div>
              <div className="mb-3 text-xs text-muted-foreground">
                Barbell Bench Press · Aug 23 · Set 2
              </div>
              <div className="flex gap-2 tabular-nums">
                <span className="flex h-11 flex-1 items-center justify-center rounded-md border border-border">
                  185 <span className="ml-1 text-muted-foreground">lb</span>
                </span>
                <span className="flex h-11 flex-1 items-center justify-center rounded-md border border-border">
                  8 <span className="ml-1 text-muted-foreground">reps</span>
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="h-11 flex-1 rounded-md border border-border text-sm">
                  Cancel
                </button>
                <button className="h-11 flex-1 rounded-md bg-primary text-sm text-primary-foreground">
                  Save
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Saving corrects this set only. Every derived tag and trend
                updates on next read — there is nothing to recompute.
              </p>
            </div>
          </div>
        </Frame>
        <Frame name="Loading · progression detail" route="/exercises/[id]" tag="skeleton">
          <Shell active="Plan">
            <div className="mb-4 h-6 w-40 rounded bg-muted" />
            <div className="mb-3 h-4 w-28 rounded bg-muted" />
            <div className="h-[150px] w-full rounded-md bg-muted" />
          </Shell>
        </Frame>
      </Section>

      <footer className="mx-auto mt-10 max-w-6xl border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Generated from docs/design/05-progressive-overload-engine-design-doc.md
        v1.0. Commitments: derived never stored · Hold shows nothing · scheduled
        vs reactive deload read differently · stalled ≠ Deload · +5 lb &amp; 90%
        are suggestions only · machine trends are gym-scoped (no cross-gym line)
        · one readable trend, not a dashboard · tags are conclusions, never
        controls. Rendering only — not imported into the app.
      </footer>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <section className="mx-auto mb-10 max-w-6xl">
      <h2 className="mb-4 flex items-baseline gap-3 text-sm font-medium text-neutral-700">
        <span className="font-mono text-neutral-400">{n}</span>
        {title}
      </h2>
      <div className="flex flex-wrap gap-6">{children}</div>
    </section>
  );
}
