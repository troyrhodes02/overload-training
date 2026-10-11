/* eslint-disable */
// @ts-nocheck
/**
 * Guided Workout Logging — UI Design Preview (implementation contract)
 * =====================================================================
 * Pitch 4 · generated from docs/design/04-guided-workout-logging-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. It is a standalone,
 * offline, mock-data-only gallery used as the visual contract the spec and
 * implementation tickets are held to. It is deliberately disconnected from
 * Prisma, Supabase, server actions, and every real API — all data below is
 * hardcoded mock training data. It is excluded from the app's typecheck, lint,
 * and format (see tsconfig.json / eslint.config.mjs / .prettierignore) and is
 * never imported into the application. The real UI is built with shadcn/ui
 * against the theme in src/app/globals.css; where this preview and the theme
 * disagree, the theme wins.
 *
 * Tailwind utility classes use Overload's semantic theme tokens (bg-card,
 * text-muted-foreground, border-border, bg-primary, …) so the contract reads in
 * the same vocabulary as the implementation. Numbers use tabular-nums. The only
 * colored elements are the accent (primary); NO progress/deload colors exist in
 * this pitch, and a "hold" is simply an untagged row.
 *
 * Coverage: dashboard (pending, resume, complete, rest) · missed-day prompt ·
 * gym selection · guided exercise card (set rows, validation, save failure,
 * gym lock, archived-needs-substitution) · swap picker (+ no candidates) ·
 * completion summary · week-at-a-glance · logged workout detail · past-log
 * correction · loading/empty states.
 */
import * as React from "react";

/* ─────────────────────────── mock training data ─────────────────────────── */

const TODAY = "Mon, Nov 2";
const GYM = "Downtown Gym";
const SESSION = "Push Day 1";
const MESO = "Hypertrophy Block 3 · Week 2";

type PlannedExercise = {
  name: string;
  scheme: string; // "3 × 6–8"
  last?: string; // "185 lbs"
  done?: boolean;
  swappedFrom?: string;
  archived?: boolean;
};

const PLAN: PlannedExercise[] = [
  { name: "Barbell Bench Press", scheme: "3 × 6–8", last: "185 lbs" },
  { name: "Incline Dumbbell Press", scheme: "3 × 8–10", last: "70 lbs" },
  { name: "Cable Fly", scheme: "3 × 12–15", last: "35 lbs" },
  { name: "Lateral Raise", scheme: "3 × 12–15", last: "20 lbs" },
  { name: "Triceps Pushdown", scheme: "3 × 10–12", last: "50 lbs" },
];

const ACTIVE_GYMS = ["Downtown Gym", "Campus Rec Center", "Home Garage"];

/* ───────────────────────────── preview chrome ───────────────────────────── */

function Frame({
  name,
  route,
  tag,
  children,
}: {
  name: string;
  route: string;
  tag?: string;
  children: React.ReactNode;
}) {
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
      {/* .ov = product surface. Flip data-ov to "dark" to review dark mode. */}
      <div
        data-ov="light"
        className="ov w-[390px] overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm"
      >
        {children}
      </div>
    </figure>
  );
}

function Shell({
  active = "Today",
  children,
}: {
  active?: "Today" | "Plan" | "History" | "Settings";
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[720px] flex-col">
      <header className="flex h-12 items-center border-b border-border px-4 text-sm font-semibold">
        Overload
      </header>
      <main className="flex-1 p-4">{children}</main>
      <nav className="grid grid-cols-4 border-t border-border text-center text-[11px]">
        {(["Today", "Plan", "History", "Settings"] as const).map((item) => (
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

function PrimaryAction({ children }: { children: React.ReactNode }) {
  // Thumb-reach bottom action, 44px.
  return (
    <div className="border-t border-border p-4">
      <button className="h-11 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground">
        {children}
      </button>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-lg border border-border bg-card p-4 " + className}>
      {children}
    </div>
  );
}

/* ───────────────────────────── set row (core) ───────────────────────────── */

type RowState = "saved" | "active" | "draft" | "error";

function SetRow({
  n,
  weight,
  reps,
  state,
}: {
  n: number;
  weight?: string;
  reps?: string;
  state: RowState;
}) {
  const saved = state === "saved";
  const error = state === "error";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 tabular-nums">
        <span className="w-12 text-sm text-muted-foreground">Set {n}</span>
        <div
          className={
            "flex h-11 flex-1 items-center rounded-md border px-3 text-base " +
            (saved
              ? "border-transparent bg-muted/50 text-foreground"
              : error
                ? "border-destructive text-foreground"
                : "border-border text-foreground")
          }
        >
          <span className="font-medium">{weight ?? "—"}</span>
          <span className="ml-1 text-sm text-muted-foreground">lbs</span>
        </div>
        <div
          className={
            "flex h-11 w-20 items-center rounded-md border px-3 text-base " +
            (saved
              ? "border-transparent bg-muted/50 text-foreground"
              : error
                ? "border-destructive text-foreground"
                : "border-border text-foreground")
          }
        >
          <span className="font-medium">{reps ?? "—"}</span>
          <span className="ml-1 text-sm text-muted-foreground">reps</span>
        </div>
        <span className="w-5 text-center text-sm text-muted-foreground">
          {saved ? "✓" : ""}
        </span>
      </div>
      {error ? (
        <p role="alert" className="pl-14 text-xs text-destructive">
          Enter reps above 0.
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────── screens ──────────────────────────────── */

function DashboardPending() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">Today · {TODAY}</p>
        <p className="text-base">Good morning, William. {SESSION} is up.</p>
        <Card>
          <p className="font-medium">{SESSION}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{MESO}</p>
          <div className="mt-3 space-y-1.5 tabular-nums">
            {PLAN.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between text-sm"
              >
                <span>{e.name}</span>
                <span className="text-muted-foreground">{e.scheme}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </Shell>
  );
}

function DashboardResume() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">Today · {TODAY}</p>
        <Card>
          <p className="font-medium">
            {SESSION} · <span className="text-muted-foreground">{GYM}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {MESO} · 2 of 5 exercises logged
          </p>
          <div className="mt-3 space-y-1.5 tabular-nums">
            {PLAN.map((e, i) => (
              <div
                key={e.name}
                className="flex items-center justify-between text-sm"
              >
                <span className={i < 2 ? "text-muted-foreground" : ""}>
                  {i < 2 ? "✓ " : ""}
                  {e.name}
                </span>
                <span className="text-muted-foreground">{e.scheme}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </Shell>
  );
}

function DashboardComplete() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">Today · {TODAY}</p>
        <Card>
          <p className="font-medium">✓ {SESSION} complete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {GYM} · 5 exercises · 14 working sets logged
          </p>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <button className="h-9 rounded-md border border-border px-3">
              View workout
            </button>
            <span className="text-muted-foreground">History →</span>
          </div>
        </Card>
      </section>
    </Shell>
  );
}

function DashboardRest() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">Today · Sun, Nov 1</p>
        <Card>
          <p className="font-medium">No lifting planned today.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Rest up. History →
          </p>
        </Card>
      </section>
    </Shell>
  );
}

function DashboardLoading() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <Card>
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
            ))}
          </div>
        </Card>
      </section>
    </Shell>
  );
}

function MissedDayPrompt() {
  return (
    <Shell active="Today">
      {/* dialog scrim */}
      <div className="space-y-4">
        <Card className="border-border">
          <p className="font-medium">You missed a workout</p>
          <p className="mt-1 text-sm">
            {SESSION} — Fri, Oct 30{" "}
            <span className="text-muted-foreground">(2 days ago)</span>
          </p>
          <div className="mt-4 space-y-2">
            {[
              ["Log it late", "Record the sets you did that day"],
              ["Shift the week", "Move the rest of this week forward one day"],
              ["Skip it", "Mark it missed and move on"],
            ].map(([label, hint]) => (
              <button
                key={label}
                className="h-auto w-full rounded-md border border-border p-3 text-left"
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  {hint}
                </span>
              </button>
            ))}
          </div>
        </Card>
        <p className="px-1 text-xs text-muted-foreground">
          Today&apos;s {SESSION} sits below until this is resolved.
        </p>
      </div>
    </Shell>
  );
}

function GymSelect() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <p className="font-medium">Where are you training?</p>
        <Card>
          <div className="space-y-2">
            {ACTIVE_GYMS.map((g, i) => (
              <label
                key={g}
                className="flex h-11 items-center gap-3 rounded-md px-2 text-sm"
              >
                <span
                  className={
                    "inline-block size-4 rounded-full border " +
                    (i === 0 ? "border-primary bg-primary" : "border-border")
                  }
                />
                {g}
              </label>
            ))}
          </div>
        </Card>
      </section>
      <PrimaryAction>Start logging</PrimaryAction>
    </Shell>
  );
}

function ExerciseCard() {
  return (
    <Shell active="Today">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">‹ {SESSION}</span>
          <span className="tabular-nums text-muted-foreground">1 / 5</span>
        </div>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">Barbell Bench Press</p>
              <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                3 × 6–8 · last: 185 lbs
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{GYM} 🔒</span>
          </div>
          <div className="mt-4 space-y-3">
            <SetRow n={1} weight="185" reps="8" state="saved" />
            <SetRow n={2} weight="185" reps="8" state="saved" />
            <SetRow n={3} weight="190" reps="" state="active" />
          </div>
          <button
            disabled
            className="mt-4 h-9 w-full rounded-md border border-border text-sm text-muted-foreground"
          >
            Swap exercise · locked (sets logged)
          </button>
        </Card>
      </div>
      <PrimaryAction>Save set 3</PrimaryAction>
    </Shell>
  );
}

function ExerciseCardValidation() {
  return (
    <Shell active="Today">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">‹ {SESSION}</span>
          <span className="tabular-nums text-muted-foreground">1 / 5</span>
        </div>
        <Card>
          <p className="font-medium">Barbell Bench Press</p>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            3 × 6–8
          </p>
          <div className="mt-4 space-y-3">
            <SetRow n={1} weight="185" reps="0" state="error" />
          </div>
        </Card>
        <p className="px-1 text-xs text-muted-foreground">
          Missing is not zero — a set saves only when both weight and reps are
          above 0.
        </p>
      </div>
      <PrimaryAction>Save set 1</PrimaryAction>
    </Shell>
  );
}

function ExerciseCardSaveFailed() {
  return (
    <Shell active="Today">
      <div className="space-y-3">
        <Card>
          <p className="font-medium">Barbell Bench Press</p>
          <div className="mt-4 space-y-3">
            <SetRow n={3} weight="190" reps="7" state="active" />
          </div>
          <div
            role="alert"
            className="mt-3 flex items-center justify-between rounded-md border border-destructive p-3 text-sm text-destructive"
          >
            <span>Couldn&apos;t save. Your numbers are still here.</span>
            <button className="rounded border border-destructive px-2 py-0.5 text-xs">
              Retry
            </button>
          </div>
        </Card>
      </div>
      <PrimaryAction>Save set 3</PrimaryAction>
    </Shell>
  );
}

function ExerciseCardArchived() {
  return (
    <Shell active="Today">
      <div className="space-y-3">
        <Card>
          <p className="font-medium">Chest Press Machine</p>
          <p className="mt-1 text-sm text-destructive">
            Unavailable — choose a substitute
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            This planned exercise was archived. Pick a same-muscle substitute to
            complete it. The plan is not changed.
          </p>
          <button className="mt-4 h-9 w-full rounded-md border border-border text-sm">
            Swap exercise
          </button>
        </Card>
      </div>
    </Shell>
  );
}

function SwapPicker() {
  const candidates = [
    { name: "Incline Dumbbell Press", fav: true },
    { name: "Barbell Bench Press", fav: false },
    { name: "Cable Fly", fav: false },
    { name: "Chest Press Machine (Hammer)", fav: false },
  ];
  return (
    <Shell active="Today">
      <section className="space-y-3">
        <div>
          <p className="font-medium">Swap: Chest Press Machine</p>
          <p className="text-sm text-muted-foreground">Same muscle: Chest</p>
        </div>
        <input
          placeholder="Search exercises…"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
          readOnly
        />
        <Card className="p-0">
          <div className="divide-y divide-border">
            {candidates.map((c) => (
              <div
                key={c.name}
                className="flex h-14 items-center gap-2 px-4 text-sm"
              >
                <span className="w-4 text-muted-foreground">
                  {c.fav ? "★" : ""}
                </span>
                {c.name}
              </div>
            ))}
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">
          Favorites help you find things; they never change eligibility.
        </p>
      </section>
    </Shell>
  );
}

function SwapNoCandidates() {
  return (
    <Shell active="Today">
      <section className="space-y-3">
        <p className="font-medium">Swap: Chest Press Machine</p>
        <Card>
          <p className="text-sm">
            No active exercises share this muscle group (Chest).
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add one in the library, or leave this exercise unresolved for now.
            The workout can&apos;t be completed until it&apos;s resolved — we
            never cross muscle groups to unblock.
          </p>
        </Card>
      </section>
    </Shell>
  );
}

function CompletionSummary() {
  return (
    <Shell active="Today">
      <section className="space-y-4">
        <Card>
          <p className="font-medium">✓ Workout complete</p>
          <p className="mt-2 text-sm">
            {SESSION} · {GYM}
          </p>
          <p className="text-sm text-muted-foreground">{TODAY}</p>
          <p className="mt-2 text-sm tabular-nums text-muted-foreground">
            5 exercises · 14 working sets
          </p>
        </Card>
      </section>
      <PrimaryAction>Done</PrimaryAction>
    </Shell>
  );
}

function WeekAtAGlance() {
  const days = [
    ["Mon Nov 2", "Push Day 1", "Done"],
    ["Tue Nov 3", "Pull Day 1", "Upcoming"],
    ["Wed Nov 4", "Rest", "—"],
    ["Thu Nov 5", "Leg Day", "Upcoming"],
    ["Fri Oct 30", "Push Day 1", "Skipped"],
    ["Sat Oct 31", "— (shifted)", "Shifted"],
    ["Sun Nov 1", "Rest", "—"],
  ];
  return (
    <Shell active="History">
      <section className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">‹</span>
          <span className="font-medium">Week of Oct 27 – Nov 2</span>
          <span className="text-muted-foreground">›</span>
        </div>
        <Card className="p-0">
          <div className="divide-y divide-border">
            {days.map(([d, s, st]) => (
              <div
                key={d}
                className="flex items-center justify-between px-4 py-3 text-sm tabular-nums"
              >
                <span className="w-24 text-muted-foreground">{d}</span>
                <span className="flex-1">{s}</span>
                <span
                  className={
                    st === "Done"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {st}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </Shell>
  );
}

function WorkoutDetail() {
  return (
    <Shell active="History">
      <section className="space-y-3">
        <div>
          <p className="font-medium">‹ {SESSION}</p>
          <p className="text-sm text-muted-foreground">
            {TODAY} · {GYM}
          </p>
        </div>
        <Card>
          <p className="text-sm font-medium">
            Barbell Bench Press{" "}
            <span className="font-normal text-muted-foreground">
              (as planned)
            </span>
          </p>
          <div className="mt-2 space-y-1 text-sm tabular-nums">
            {[
              ["1", "185", "8"],
              ["2", "185", "8"],
              ["3", "190", "7"],
            ].map(([n, w, r]) => (
              <div key={n} className="flex items-center justify-between">
                <span>
                  Set {n} &nbsp; {w} lbs × {r}
                </span>
                <button className="text-xs text-muted-foreground underline">
                  edit
                </button>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-sm font-medium">
            Incline Dumbbell Press{" "}
            <span className="font-normal text-muted-foreground">
              (swapped from Chest Press Machine)
            </span>
          </p>
          <div className="mt-2 space-y-1 text-sm tabular-nums">
            <div className="flex items-center justify-between">
              <span>Set 1 &nbsp; 70 lbs × 10</span>
              <button className="text-xs text-muted-foreground underline">
                edit
              </button>
            </div>
          </div>
        </Card>
      </section>
    </Shell>
  );
}

function EditSetDialog() {
  return (
    <Shell active="History">
      <div className="space-y-4">
        <Card>
          <p className="font-medium">Edit set 3 — Barbell Bench Press</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Weight</label>
              <div className="mt-1 flex h-11 items-center rounded-md border border-border px-3 text-base tabular-nums">
                190 <span className="ml-1 text-sm text-muted-foreground">lbs</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reps</label>
              <div className="mt-1 flex h-11 items-center rounded-md border border-border px-3 text-base tabular-nums">
                7
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="h-11 flex-1 rounded-md border border-border text-sm">
              Cancel
            </button>
            <button className="h-11 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground">
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Only weight and reps are editable. No delete. Editing a past set does
            not replay gym baselines.
          </p>
        </Card>
      </div>
    </Shell>
  );
}

/* ───────────────────────────────── gallery ──────────────────────────────── */

export default function GuidedWorkoutLoggingPreview() {
  return (
    <div className="min-h-screen bg-neutral-50 p-8 text-neutral-900">
      <header className="mx-auto mb-8 max-w-6xl">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Overload · Pitch 4
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Guided Workout Logging — UI preview
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          The card gets out of the way of the bar. Record reality; never rewrite
          the plan. Missing is not zero; history is editable, never deleted.
        </p>
        <p className="mt-3 inline-block rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-600">
          This is a rendering of the design, not product code. No Prisma /
          Supabase / API. The app is built with shadcn/ui against globals.css.
        </p>
      </header>

      <Section n="01" title="Dashboard — one thing now">
        <Frame name="Today — pending" route="/" tag="not started">
          <DashboardPending />
        </Frame>
        <Frame name="Today — resume" route="/" tag="in progress">
          <DashboardResume />
        </Frame>
        <Frame name="Today — complete" route="/" tag="quiet, no hand-off">
          <DashboardComplete />
        </Frame>
        <Frame name="Today — rest" route="/" tag="legitimate state">
          <DashboardRest />
        </Frame>
        <Frame name="Today — loading" route="/" tag="skeleton">
          <DashboardLoading />
        </Frame>
      </Section>

      <Section n="02" title="Missed day — exactly three choices, oldest first">
        <Frame name="Missed-day prompt" route="dialog" tag="blocks today">
          <MissedDayPrompt />
        </Frame>
      </Section>

      <Section n="03" title="Starting — gym attribution before the first set">
        <Frame name="Gym selection" route="/log/[id]/start" tag="active gyms only">
          <GymSelect />
        </Frame>
      </Section>

      <Section n="04" title="Guided exercise card — numbers over decoration">
        <Frame name="Logging a set" route="/log/[id]" tag="saved + active rows">
          <ExerciseCard />
        </Frame>
        <Frame name="Validation" route="/log/[id]" tag="zero rejected">
          <ExerciseCardValidation />
        </Frame>
        <Frame name="Save failure" route="/log/[id]" tag="numbers kept">
          <ExerciseCardSaveFailed />
        </Frame>
        <Frame
          name="Archived planned exercise"
          route="/log/[id]"
          tag="needs substitution"
        >
          <ExerciseCardArchived />
        </Frame>
      </Section>

      <Section n="05" title="Swap — same primary muscle, logged occurrence only">
        <Frame name="Swap picker" route="dialog" tag="same muscle">
          <SwapPicker />
        </Frame>
        <Frame name="No candidates" route="dialog" tag="cannot false-complete">
          <SwapNoCandidates />
        </Frame>
      </Section>

      <Section n="06" title="Completion — factual, quiet">
        <Frame name="Completion summary" route="/log/[id]/complete" tag="no analytics">
          <CompletionSummary />
        </Frame>
      </Section>

      <Section n="07" title="History — record navigation, not statistics">
        <Frame name="Week at a glance" route="/history" tag="effective schedule">
          <WeekAtAGlance />
        </Frame>
        <Frame name="Logged workout detail" route="/history/[id]" tag="read-only + edit">
          <WorkoutDetail />
        </Frame>
        <Frame name="Past-log correction" route="dialog" tag="weight/reps only">
          <EditSetDialog />
        </Frame>
      </Section>

      <footer className="mx-auto mt-10 max-w-6xl border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Generated from docs/design/04-guided-workout-logging-design-doc.md v1.0.
        Commitments: record reality not the plan · missing is not zero · history
        editable never deleted · no progression/e1RM/goal content · gym shown
        only for the logging context · thumb-reach primary actions. Rendering
        only — not imported into the app.
      </footer>
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
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
