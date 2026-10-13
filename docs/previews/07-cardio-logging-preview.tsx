/* eslint-disable */
// @ts-nocheck
/**
 * Cardio Logging — UI Design Preview (implementation contract)
 * ============================================================
 * Pitch 7 · generated from docs/design/07-cardio-logging-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. It is a standalone,
 * offline, mock-data-only gallery used as the visual contract the spec and
 * implementation tickets are held to. It is deliberately disconnected from
 * Prisma, Supabase, server actions, and every real API — all data below is
 * hardcoded mock training data. It is excluded from the app's typecheck, lint,
 * and format (tsconfig.json / eslint.config.mjs / .prettierignore) and is never
 * imported into the application. The real UI is built with shadcn/ui against
 * the theme in src/app/globals.css; where this preview and the theme disagree,
 * the theme wins.
 *
 * Tailwind utility classes use Overload's semantic theme tokens (bg-card,
 * text-muted-foreground, border-border, bg-primary…) so the contract reads in
 * the implementation's vocabulary. Every number is tabular-nums.
 *
 * The defining commitments this preview must make legible:
 *   • Strength training is interpreted. Cardio is recorded. Type + whole
 *     minutes — nothing else on any cardio surface. No timer, distance, pace,
 *     calories, heart rate, chart, streak, tag, or Gym.
 *   • Cardio belongs to the DAY, not the lifting Session: it is a second line
 *     inside the day row, never inside a Session's exercise list.
 *   • One planned cardio item per day (days that have one are disabled in the
 *     day picker).
 *   • Lifting keeps the floor: on a combined day "Start workout" is the only
 *     primary button; cardio's "Log" is secondary. A cardio-only day gets a real
 *     focal block with a primary "Log cardio".
 *   • Plan and record are different sentences: the record shows actual type +
 *     minutes; "Planned …" appears muted only when they differ.
 *   • Missed is a fact, not a prompt: muted "Missed" in History, optional Log,
 *     never an interruption, never the Log late / Shift / Skip prompt.
 *   • A lifting shift carries its day's cardio; cardio-only days never move.
 *   • Scheduled deload never touches cardio.
 *   • No delete for logged cardio. Removing planned cardio says logs stay.
 *   • No progress green / deload amber anywhere on a cardio surface.
 *
 * Mock data (internally consistent):
 *   Hypertrophy Block 3 · Push / Pull / Legs · starts Mon Sep 21 2026 · 5 weeks
 *   (ends Sun Oct 25) · deload every 5 weeks → week 5 (Oct 19–25) is the deload.
 *   Week: Mon Push Day 1 (6 ex) · Tue Pull Day 1 (6 ex) + Incline Walk 20 min ·
 *   Wed Leg Day (5 ex) · Thu Push Day 2 (6 ex) + Stair Climber 15 min · Fri rest ·
 *   Sat cardio only: Bike 30 min · Sun rest.
 *   Week 3 (Oct 5–11): Tue Oct 6 Pull done + Bike 25 (planned Incline Walk 20);
 *   Thu Oct 8 Push Day 2 done, Stair Climber missed; Sat Oct 10 Bike 30.
 *   Week 4 (Oct 12–18): Mon Push done; Tue Oct 13 Pull done + Incline Walk 23
 *   (planned 20); Sat Oct 17 Bike pending/32 logged.
 *   Shift example (week 4 alt): Tue Oct 13 Pull missed → Shift → Pull + Incline
 *   Walk on Wed Oct 14, Leg Day Thu, Push Day 2 + Stair Climber Fri; Bike stays Sat.
 */
import * as React from "react";

/* ─────────────────────────── icons (lucide paths) ─────────────────────────── */

function Icon({ children, className = "size-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
const Check = ({ className }) => (
  <Icon className={className}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const ChevronRight = ({ className }) => (
  <Icon className={className}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
const ChevronLeft = ({ className }) => (
  <Icon className={className}>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
const ChevronDown = ({ className }) => (
  <Icon className={className}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
const Plus = ({ className }) => (
  <Icon className={className}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Icon>
);
const X = ({ className }) => (
  <Icon className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);
const Ellipsis = ({ className }) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </Icon>
);
const TriangleAlert = ({ className }) => (
  <Icon className={className}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Icon>
);

/* ───────────────────────────── mock plan data ─────────────────────────────── */

const WEEK = [
  { d: "Mon", session: "Push Day 1", meta: "6 exercises", cardio: null },
  { d: "Tue", session: "Pull Day 1", meta: "6 exercises", cardio: { type: "Incline Walk", min: 20 } },
  { d: "Wed", session: "Leg Day", meta: "5 exercises", cardio: null },
  { d: "Thu", session: "Push Day 2", meta: "6 exercises", cardio: { type: "Stair Climber", min: 15 } },
  { d: "Fri", session: null, cardio: null },
  { d: "Sat", session: null, cardio: { type: "Bike", min: 30 } },
  { d: "Sun", session: null, cardio: null },
];

const PULL = [
  ["Barbell Row", "3 × 6–8"],
  ["Lat Pulldown", "3 × 8–10"],
  ["Seated Cable Row", "3 × 10–12"],
  ["Hammer Curl", "3 × 10–12"],
  ["Lateral Raise", "3 × 12–15"],
  ["Triceps Pushdown", "3 × 10–12"],
];

/* ───────────────────────────── preview chrome ───────────────────────────── */

function Frame({ name, route, tag, dark, wide, children }) {
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
          "ov overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-sm " +
          (wide ? "w-[900px]" : "w-[375px]")
        }
      >
        {children}
      </div>
    </figure>
  );
}

const NAV = ["Today", "Plan", "History", "Goals", "Exercises", "Gyms"];

/** Phone shell: header, content, optional thumb-reach action bar, bottom nav. */
function Shell({ active = "Today", action, children }) {
  return (
    <div className="flex min-h-[720px] flex-col">
      <header className="flex h-12 items-center border-b border-border px-4 text-sm font-semibold">
        Overload
      </header>
      <main className="flex-1 space-y-5 p-4">{children}</main>
      {action ? <div className="border-t border-border p-3">{action}</div> : null}
      <nav className="grid grid-cols-6 border-t border-border bg-card text-center text-[10px]">
        {NAV.map((item) => (
          <div
            key={item}
            className={
              "py-3 " +
              (item === active ? "font-semibold text-primary" : "text-muted-foreground")
            }
          >
            {item}
          </div>
        ))}
      </nav>
    </div>
  );
}

/** md+ shell: left rail, centered max-w-2xl column. */
function DesktopShell({ active = "Today", children }) {
  return (
    <div className="flex min-h-[560px]">
      <aside className="w-56 shrink-0 border-r border-border p-3">
        <div className="mb-4 px-3 text-sm font-semibold">Overload</div>
        {NAV.map((item) => (
          <div
            key={item}
            className={
              "rounded-md px-3 py-2 text-sm " +
              (item === active
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground")
            }
          >
            {item}
          </div>
        ))}
      </aside>
      <main className="mx-auto w-full max-w-2xl space-y-5 p-8">{children}</main>
    </div>
  );
}

function PrimaryButton({ children, icon, disabled }) {
  return (
    <button
      disabled={disabled}
      className={
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium " +
        (disabled ? "bg-primary/60 text-primary-foreground" : "bg-primary text-primary-foreground")
      }
    >
      {icon}
      {children}
    </button>
  );
}
function SecondaryButton({ children, className = "" }) {
  return (
    <button
      className={
        "inline-flex h-11 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground " +
        className
      }
    >
      {children}
    </button>
  );
}
function OutlineButton({ children, className = "w-full", icon }) {
  return (
    <button
      className={
        "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium " +
        className
      }
    >
      {icon}
      {children}
    </button>
  );
}
function GhostButton({ children, className = "", destructive }) {
  return (
    <button
      className={
        "inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium " +
        (destructive ? "text-destructive " : "text-foreground ") +
        className
      }
    >
      {children}
    </button>
  );
}
function BackLink({ children }) {
  return <div className="text-sm text-muted-foreground">‹ {children}</div>;
}
function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
      {children}
    </span>
  );
}

/* ───────────────────── Cardio components (the contract) ───────────────────── */

const CardioLabel = () => (
  <span className="text-xs tracking-wide text-muted-foreground uppercase">Cardio</span>
);

/** Plan builder day row: lifting line (Pitch 3, unchanged) + optional cardio line. */
function DayRow({ day, readOnly }) {
  return (
    <li className="flex min-h-14 flex-col justify-center py-1 pr-1 pl-4">
      <div className="flex min-h-12 items-center gap-1">
        <abbr className="w-10 shrink-0 text-xs font-medium tracking-wide text-muted-foreground uppercase no-underline">
          {day.d}
        </abbr>
        {day.session ? (
          <>
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate text-sm font-medium">{day.session}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{day.meta}</p>
            </div>
            {readOnly ? null : (
              <span className="inline-flex size-11 items-center justify-center text-muted-foreground">
                <Ellipsis className="size-4" />
              </span>
            )}
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-muted-foreground">Rest</span>
            {readOnly ? null : (
              <span className="inline-flex h-11 items-center gap-1 px-3 text-sm text-muted-foreground">
                <Plus className="size-4" />
                Add session
              </span>
            )}
          </>
        )}
      </div>
      {day.cardio ? (
        <div className="ml-10 flex min-h-11 items-center gap-2 rounded-md pr-3 text-left text-sm">
          <CardioLabel />
          <span className="flex-1 truncate tabular-nums">
            {day.cardio.type} · {day.cardio.min} min
          </span>
          {readOnly ? null : <ChevronRight className="size-4 text-muted-foreground" />}
        </div>
      ) : null}
    </li>
  );
}

function PlanWeek({ readOnly, week = WEEK }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Week</h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {week.map((d) => (
          <DayRow key={d.d} day={d} readOnly={readOnly} />
        ))}
      </ul>
      {readOnly ? null : (
        <div className="mt-3">
          <OutlineButton className="h-9 px-3" icon={<Plus className="size-4" />}>
            Add cardio
          </OutlineButton>
        </div>
      )}
    </div>
  );
}

function PlanHeader({ status = "Active" }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <BackLink>Plan</BackLink>
        <Ellipsis className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          Hypertrophy Block 3 {status === "Active" ? <Badge>Active</Badge> : <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{status}</span>}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {status === "Archived" ? "Mon, Sep 21 – Sun, Oct 25" : "Starts Mon, Sep 21 · ends Sun, Oct 25"}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          5 weeks · deload every 5 weeks · Push / Pull / Legs
        </p>
      </div>
    </div>
  );
}

/* ── dialogs ── */

function Scrim({ children, height = "min-h-[600px]" }) {
  return <div className={"relative bg-black/50 p-4 " + height}>{children}</div>;
}

function Field({ label, children, error, help }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
function TextInput({ value, placeholder, invalid }) {
  return (
    <div
      className={
        "flex h-11 items-center rounded-md border bg-background px-3 text-sm " +
        (invalid ? "border-destructive" : "border-input")
      }
    >
      {value ? value : <span className="text-muted-foreground">{placeholder}</span>}
    </div>
  );
}
function MinutesInput({ value, invalid }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={
          "flex h-11 w-24 items-center rounded-md border bg-background px-3 text-base tabular-nums " +
          (invalid ? "border-destructive" : "border-input")
        }
      >
        {value}
      </div>
      <span className="text-sm text-muted-foreground">min</span>
    </div>
  );
}
function DaySelect({ value, invalid }) {
  return (
    <div
      className={
        "flex h-11 items-center justify-between rounded-md border bg-background px-3 text-sm " +
        (invalid ? "border-destructive" : "border-input")
      }
    >
      {value}
      <ChevronDown className="size-4 text-muted-foreground" />
    </div>
  );
}

function DialogBox({ title, description, children }) {
  return (
    <div className="mt-6 space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-semibold">{title}</p>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <X className="size-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}

function AddCardioDialog({ type = "Incline Walk", min = "20", day = "Tuesday", errors = {} }) {
  return (
    <Scrim>
      <DialogBox title="Add cardio" description="One cardio item per day.">
        <Field label="Day" error={errors.day}>
          <DaySelect value={day} invalid={errors.day} />
        </Field>
        <Field label="Activity" error={errors.type}>
          <TextInput value={type} placeholder="e.g. Incline Walk" invalid={errors.type} />
        </Field>
        <Field label="Minutes" error={errors.min}>
          <MinutesInput value={min} invalid={errors.min} />
        </Field>
        <div className="flex flex-col gap-2 pt-1">
          <PrimaryButton>Add cardio</PrimaryButton>
          <OutlineButton>Cancel</OutlineButton>
        </div>
      </DialogBox>
    </Scrim>
  );
}

/** The day picker open: days that already have cardio are listed but disabled. */
function DayPickerOpen() {
  const rows = [
    ["Monday", "Push Day 1", false],
    ["Tuesday", "Pull Day 1 · has cardio", true],
    ["Wednesday", "Leg Day", false],
    ["Thursday", "Push Day 2 · has cardio", true],
    ["Friday", "Rest", false],
    ["Saturday", "Rest · has cardio", true],
    ["Sunday", "Rest", false],
  ];
  return (
    <Scrim>
      <DialogBox title="Add cardio" description="One cardio item per day.">
        <Field label="Day">
          <DaySelect value="Wednesday" />
        </Field>
        <div className="rounded-md border border-border bg-popover p-1 shadow-md">
          {rows.map(([d, note, disabled]) => (
            <div
              key={d}
              className={
                "flex min-h-11 items-center justify-between rounded-sm px-2 text-sm " +
                (disabled ? "text-muted-foreground opacity-60" : "") +
                (d === "Wednesday" ? " bg-accent" : "")
              }
            >
              <span>{d}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </div>
          ))}
        </div>
      </DialogBox>
    </Scrim>
  );
}

function SuggestionsOpen() {
  const s = ["Incline Walk", "Treadmill", "Stair Climber", "Bike", "Elliptical", "Rowing", "Outdoor Walk"];
  return (
    <Scrim>
      <DialogBox title="Add cardio" description="One cardio item per day.">
        <Field label="Day">
          <DaySelect value="Saturday" />
        </Field>
        <Field label="Activity" help="Any activity — suggestions are just shortcuts.">
          <TextInput value="B" />
        </Field>
        <div className="rounded-md border border-border bg-popover p-1 shadow-md">
          {s
            .filter((x) => /b/i.test(x))
            .map((x) => (
              <div key={x} className="flex min-h-11 items-center rounded-sm px-2 text-sm">
                {x}
              </div>
            ))}
        </div>
      </DialogBox>
    </Scrim>
  );
}

function EditCardioDialog() {
  return (
    <Scrim>
      <DialogBox
        title="Edit cardio"
        description="Changes the plan only. Cardio you've logged stays as recorded."
      >
        <Field label="Day">
          <DaySelect value="Tuesday" />
        </Field>
        <Field label="Activity">
          <TextInput value="Incline Walk" />
        </Field>
        <Field label="Minutes">
          <MinutesInput value="20" />
        </Field>
        <div className="flex flex-col gap-2 pt-1">
          <PrimaryButton>Save</PrimaryButton>
          <GhostButton destructive>Remove from plan</GhostButton>
          <OutlineButton>Cancel</OutlineButton>
        </div>
      </DialogBox>
    </Scrim>
  );
}

function RemoveConfirm() {
  return (
    <Scrim height="min-h-[420px]">
      <div className="mt-24 space-y-4 rounded-lg border border-border bg-background p-5 shadow-lg">
        <p className="text-base font-semibold">Remove Incline Walk from Tuesday?</p>
        <p className="text-sm text-muted-foreground">
          It comes off the plan from now on. Cardio you've already logged stays in your history.
        </p>
        <div className="flex flex-col gap-2">
          <button className="inline-flex h-11 w-full items-center justify-center rounded-md bg-destructive text-sm font-medium text-white">
            Remove
          </button>
          <OutlineButton>Keep it</OutlineButton>
        </div>
      </div>
    </Scrim>
  );
}

function LogCardioDialog({
  date = "Tue, Oct 13",
  planned = "Incline Walk · 20 min",
  type = "Incline Walk",
  min = "20",
  errors = {},
  title = "Log cardio",
  saving,
  failed,
}) {
  return (
    <Scrim>
      <DialogBox title={title} description={`${date} · Planned ${planned}`}>
        {failed ? (
          <div role="alert" className="flex gap-2 rounded-lg border border-border px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 text-destructive" />
            <p className="text-destructive">Couldn't save. Your entries are still here.</p>
          </div>
        ) : null}
        <Field label="Activity" error={errors.type}>
          <TextInput value={type} placeholder="e.g. Incline Walk" invalid={errors.type} />
        </Field>
        <Field label="Minutes" error={errors.min}>
          <MinutesInput value={min} invalid={errors.min} />
        </Field>
        <div className="flex flex-col gap-2 pt-1">
          <PrimaryButton disabled={saving}>{saving ? "Saving…" : "Save"}</PrimaryButton>
          <OutlineButton>Cancel</OutlineButton>
        </div>
      </DialogBox>
    </Scrim>
  );
}

/* ── dashboard ── */

function Today({ date }) {
  return <p className="text-sm text-muted-foreground">Today · {date}</p>;
}

function LiftingBlock({ name = "Pull Day 1", week = 4, rows = PULL }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="font-medium">{name}</p>
      <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
        Week {week} · {rows.length} exercises
      </p>
      <ul className="mt-3 space-y-1.5 tabular-nums">
        {rows.map(([n, s]) => (
          <li key={n} className="flex items-center justify-between gap-2 text-sm">
            <span>{n}</span>
            <span className="text-muted-foreground">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompleteBlock({ name = "Pull Day 1" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="font-medium">✓ {name} complete</p>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        Downtown Gym · 6 exercises · 18 working sets logged
      </p>
      <div className="mt-4 flex items-center gap-4 text-sm">
        <SecondaryButton className="h-8 px-3">View workout</SecondaryButton>
        <span className="text-muted-foreground">History →</span>
      </div>
    </div>
  );
}

/** Combined-day cardio card: secondary action; lifting keeps the floor. */
function CardioCard({ type = "Incline Walk", min = 20, logged, plannedNote }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <CardioLabel />
      {logged ? (
        <div className="mt-1 flex min-h-11 items-center gap-2">
          <Check className="size-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm tabular-nums">
              {logged.type} — {logged.min} min
            </p>
            {plannedNote ? (
              <p className="text-xs text-muted-foreground tabular-nums">{plannedNote}</p>
            ) : null}
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-sm tabular-nums">
            {type} — {min} min
          </p>
          <SecondaryButton>Log</SecondaryButton>
        </div>
      )}
    </div>
  );
}

function DeloadBanner() {
  return (
    <div className="rounded-md bg-muted px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground">
      Deload week · 90% load across the split
    </div>
  );
}

function DashCombinedPending() {
  return (
    <Shell>
      <Today date="Tue, Oct 13" />
      <LiftingBlock />
      <PrimaryButton>Start workout</PrimaryButton>
      <CardioCard />
    </Shell>
  );
}
function DashLiftDoneCardioPending() {
  return (
    <Shell>
      <Today date="Tue, Oct 13" />
      <CompleteBlock />
      <CardioCard />
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Goals</h2>
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          (Goals block — unchanged Pitch 6 rules)
        </div>
      </div>
    </Shell>
  );
}
function DashCardioDoneLiftPending() {
  return (
    <Shell>
      <Today date="Tue, Oct 13" />
      <LiftingBlock />
      <PrimaryButton>Start workout</PrimaryButton>
      <CardioCard logged={{ type: "Incline Walk", min: 23 }} plannedNote="Planned 20 min" />
    </Shell>
  );
}
function DashBothDone() {
  return (
    <Shell>
      <Today date="Tue, Oct 13" />
      <CompleteBlock />
      <CardioCard logged={{ type: "Incline Walk", min: 23 }} plannedNote="Planned 20 min" />
    </Shell>
  );
}
function DashCardioOnlyPending() {
  return (
    <Shell action={<PrimaryButton>Log cardio</PrimaryButton>}>
      <Today date="Sat, Oct 17" />
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Cardio</p>
        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">Week 4</p>
        <p className="mt-3 text-base tabular-nums">Bike — 30 min</p>
      </div>
    </Shell>
  );
}
function DashCardioOnlyDone() {
  return (
    <Shell>
      <Today date="Sat, Oct 17" />
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">✓ Cardio complete</p>
        <div className="mt-2 flex min-h-11 items-center gap-2">
          <div className="flex-1">
            <p className="text-base tabular-nums">Bike — 32 min</p>
            <p className="text-xs text-muted-foreground tabular-nums">Planned 30 min</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">History →</p>
      </div>
    </Shell>
  );
}
function DashDesktop() {
  return (
    <DesktopShell>
      <Today date="Tue, Oct 13" />
      <LiftingBlock />
      <PrimaryButton>Start workout</PrimaryButton>
      <CardioCard />
    </DesktopShell>
  );
}
function DashShifted() {
  return (
    <Shell>
      <Today date="Wed, Oct 14" />
      <LiftingBlock />
      <PrimaryButton>Start workout</PrimaryButton>
      <CardioCard />
      <p className="text-xs text-muted-foreground">
        (Tuesday was shifted from the missed-day prompt; its Incline Walk came with it.)
      </p>
    </Shell>
  );
}
function DashDeloadWeek() {
  return (
    <Shell>
      <Today date="Tue, Oct 20" />
      <DeloadBanner />
      <LiftingBlock week={5} />
      <PrimaryButton>Start workout</PrimaryButton>
      <CardioCard />
    </Shell>
  );
}
function DashMissedLifting() {
  return (
    <Shell>
      <Today date="Wed, Oct 14" />
      <div className="space-y-3 rounded-lg border border-border bg-card p-5">
        <p className="font-medium">You missed Pull Day 1 yesterday.</p>
        {["Log it late", "Shift the week", "Skip it"].map((c) => (
          <OutlineButton key={c}>{c}</OutlineButton>
        ))}
      </div>
      <div className="pointer-events-none space-y-4 opacity-50">
        <LiftingBlock name="Leg Day" rows={[["Hack Squat", "3 × 6–8"], ["Romanian Deadlift", "3 × 8–10"]]} />
      </div>
      <p className="text-xs text-muted-foreground">
        The prompt is the lifting missed day only — Tuesday's unlogged Incline Walk never prompts.
      </p>
    </Shell>
  );
}

/* ── history ── */

function HistoryWeek({ title, groups }) {
  return (
    <Shell active="History">
      <div className="flex items-center justify-between text-sm">
        <ChevronLeft className="size-4 text-muted-foreground" />
        <span className="font-medium tabular-nums">{title}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {groups.map((g) => (
          <li key={g.date} className="px-4 py-2 text-sm tabular-nums">
            {g.lifting ? (
              <div className="flex min-h-10 items-center">
                <span className="w-28 text-muted-foreground">{g.date}</span>
                <span className="flex-1">{g.lifting.name}</span>
                <span className={g.lifting.state === "Done" ? "" : "text-muted-foreground"}>
                  {g.lifting.state}
                </span>
              </div>
            ) : null}
            {g.cardio.map((c, i) => (
              <div key={i} className="flex min-h-11 items-center">
                <span className="w-28 text-muted-foreground">{g.lifting ? "" : g.date}</span>
                <div className="flex-1">
                  <p>
                    <span className="mr-2 text-xs tracking-wide text-muted-foreground uppercase">
                      Cardio
                    </span>
                    {c.type} · {c.min} min
                  </p>
                  {c.planned ? (
                    <p className="text-xs text-muted-foreground">Planned {c.planned}</p>
                  ) : null}
                </div>
                {c.state === "done" ? (
                  <span className="flex items-center gap-1">
                    <Check className="size-4 text-muted-foreground" />
                    <span className="sr-only">Logged</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </span>
                ) : c.state === "missed" ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    Missed
                    <GhostButton className="h-9 px-2">Log</GhostButton>
                  </span>
                ) : c.state === "pending" ? (
                  <GhostButton className="h-9 px-2">Log</GhostButton>
                ) : (
                  <span className="text-muted-foreground">Upcoming</span>
                )}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </Shell>
  );
}

const WEEK4 = [
  { date: "Mon, Oct 12", lifting: { name: "Push Day 1", state: "Done" }, cardio: [] },
  {
    date: "Tue, Oct 13",
    lifting: { name: "Pull Day 1", state: "Done" },
    cardio: [{ type: "Incline Walk", min: 23, planned: "20 min", state: "done" }],
  },
  { date: "Wed, Oct 14", lifting: { name: "Leg Day", state: "Upcoming" }, cardio: [] },
  {
    date: "Thu, Oct 15",
    lifting: { name: "Push Day 2", state: "Upcoming" },
    cardio: [{ type: "Stair Climber", min: 15, state: "upcoming" }],
  },
  { date: "Sat, Oct 17", lifting: null, cardio: [{ type: "Bike", min: 30, state: "upcoming" }] },
];
const WEEK3 = [
  { date: "Mon, Oct 5", lifting: { name: "Push Day 1", state: "Done" }, cardio: [] },
  {
    date: "Tue, Oct 6",
    lifting: { name: "Pull Day 1", state: "Done" },
    cardio: [{ type: "Bike", min: 25, planned: "Incline Walk · 20 min", state: "done" }],
  },
  { date: "Wed, Oct 7", lifting: { name: "Leg Day", state: "Done" }, cardio: [] },
  {
    date: "Thu, Oct 8",
    lifting: { name: "Push Day 2", state: "Done" },
    cardio: [{ type: "Stair Climber", min: 15, state: "missed" }],
  },
  { date: "Sat, Oct 10", lifting: null, cardio: [{ type: "Bike", min: 30, state: "done" }] },
];
const WEEK4_SHIFTED = [
  { date: "Mon, Oct 12", lifting: { name: "Push Day 1", state: "Done" }, cardio: [] },
  {
    date: "Wed, Oct 14",
    lifting: { name: "Pull Day 1", state: "Shifted" },
    cardio: [{ type: "Incline Walk", min: 20, state: "pending" }],
  },
  { date: "Thu, Oct 15", lifting: { name: "Leg Day", state: "Shifted" }, cardio: [] },
  {
    date: "Fri, Oct 16",
    lifting: { name: "Push Day 2", state: "Shifted" },
    cardio: [{ type: "Stair Climber", min: 15, state: "upcoming" }],
  },
  { date: "Sat, Oct 17", lifting: null, cardio: [{ type: "Bike", min: 30, state: "upcoming" }] },
];

function CorrectDialog() {
  return (
    <LogCardioDialog
      title="Edit cardio"
      date="Tue, Oct 6"
      planned="Incline Walk · 20 min"
      type="Bike"
      min="25"
    />
  );
}

/* ── clone ── */

function CloneSummary() {
  return (
    <Shell active="Plan">
      <BackLink>Plan</BackLink>
      <h1 className="text-lg font-semibold">Clone forward</h1>
      <div className="space-y-2">
        <h2 className="text-sm font-medium">What comes across</h2>
        <div className="space-y-1 rounded-lg border border-border bg-card p-4 text-sm">
          <p className="font-medium">Push / Pull / Legs</p>
          <p className="tabular-nums">4 sessions · 23 exercises</p>
          <p className="tabular-nums">Cardio on 3 days</p>
          <p className="text-muted-foreground">Days, order, sets, and rep ranges, ready to edit.</p>
          <p className="text-muted-foreground">
            Workout history, cardio logs, goals, and gym weights are not copied.
          </p>
        </div>
      </div>
    </Shell>
  );
}

/* ── states ── */

function Sk({ className }) {
  return <div className={"rounded bg-muted " + className} />;
}
function DashLoading() {
  return (
    <Shell>
      <Sk className="h-6 w-40" />
      <Sk className="h-28 w-full rounded-lg" />
      <Sk className="h-16 w-full rounded-lg" />
    </Shell>
  );
}
function Toast({ children, tone }) {
  return (
    <div className="mb-2 w-full rounded-lg border border-border bg-popover p-4 text-sm shadow-lg">
      <p className={tone === "error" ? "text-destructive" : ""}>{children}</p>
    </div>
  );
}

/* ─────────────────────────────── gallery ──────────────────────────────── */

export default function Preview() {
  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-8 font-sans text-neutral-900">
      <header className="mx-auto mb-8 max-w-6xl">
        <div className="text-sm font-semibold">Overload · Cardio Logging</div>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Strength training is interpreted. Cardio is recorded. One planned cardio item per day —
          activity and whole minutes — sitting beside (or instead of) the day's lifting. Log what
          you actually did in two fields; history tells the whole day. No timer, metrics, tags,
          charts, goals, or gym — and lifting keeps the floor on a combined day.
        </p>
        <p className="mt-2 inline-block rounded-full bg-neutral-200 px-3 py-1 text-xs text-neutral-600">
          Rendering of the design — not product code. The app is built with shadcn/ui against
          src/app/globals.css.
        </p>
      </header>

      <Section n="01" title="Plan — cardio is a line in the day, never inside the Session">
        <Frame name="Week with cardio" route="/plan/[mesocycleId]" tag="lifting · cardio · both · rest">
          <Shell active="Plan">
            <PlanHeader />
            <PlanWeek />
          </Shell>
        </Frame>
        <Frame name="Week with cardio (dark)" route="/plan/[mesocycleId]" tag="dark mode" dark>
          <Shell active="Plan">
            <PlanHeader />
            <PlanWeek />
          </Shell>
        </Frame>
        <Frame name="Week · md+" route="/plan/[mesocycleId]" tag="desktop" wide>
          <DesktopShell active="Plan">
            <PlanHeader />
            <PlanWeek />
          </DesktopShell>
        </Frame>
        <Frame name="No cardio yet" route="/plan/[mesocycleId]" tag="empty">
          <Shell active="Plan">
            <PlanHeader status="Draft" />
            <PlanWeek week={WEEK.map((d) => ({ ...d, cardio: null }))} />
          </Shell>
        </Frame>
        <Frame name="Archived block" route="/plan/[mesocycleId]" tag="read-only">
          <Shell active="Plan">
            <PlanHeader status="Archived" />
            <PlanWeek readOnly />
          </Shell>
        </Frame>
      </Section>

      <Section n="02" title="Add / edit / remove planned cardio — one per day, two fields">
        <Frame name="Add cardio" route="dialog" tag="type + minutes">
          <AddCardioDialog />
        </Frame>
        <Frame name="Day picker" route="dialog" tag="one per day">
          <DayPickerOpen />
        </Frame>
        <Frame name="Activity suggestions" route="dialog" tag="free text">
          <SuggestionsOpen />
        </Frame>
        <Frame name="Validation" route="dialog" tag="inline errors">
          <AddCardioDialog
            type="  "
            min="0"
            errors={{ type: "Enter the activity.", min: "Enter whole minutes, 1 or more." }}
          />
        </Frame>
        <Frame name="Conflict" route="dialog" tag="day taken">
          <AddCardioDialog day="Thursday" errors={{ day: "Thursday already has cardio." }} />
        </Frame>
        <Frame name="Edit cardio" route="dialog" tag="plan only">
          <EditCardioDialog />
        </Frame>
        <Frame name="Edit cardio (dark)" route="dialog" tag="dark mode" dark>
          <EditCardioDialog />
        </Frame>
        <Frame name="Remove from plan" route="alertdialog" tag="logs stay">
          <RemoveConfirm />
        </Frame>
      </Section>

      <Section n="03" title="Today — lifting keeps the floor; cardio-only days get a real focal block">
        <Frame name="Combined · both pending" route="/" tag="Start = only primary">
          <DashCombinedPending />
        </Frame>
        <Frame name="Combined · both pending (dark)" route="/" tag="dark mode" dark>
          <DashCombinedPending />
        </Frame>
        <Frame name="Lifting done · cardio pending" route="/" tag="independent">
          <DashLiftDoneCardioPending />
        </Frame>
        <Frame name="Cardio done · lifting pending" route="/" tag="independent">
          <DashCardioDoneLiftPending />
        </Frame>
        <Frame name="Both complete" route="/" tag="no hand-off">
          <DashBothDone />
        </Frame>
        <Frame name="Cardio-only · pending" route="/" tag="focal · primary Log">
          <DashCardioOnlyPending />
        </Frame>
        <Frame name="Cardio-only · complete" route="/" tag="no fake workout">
          <DashCardioOnlyDone />
        </Frame>
        <Frame name="Combined · md+" route="/" tag="desktop" wide>
          <DashDesktop />
        </Frame>
      </Section>

      <Section n="04" title="Schedule — shifts carry cardio; cardio never shifts; deload never touches it">
        <Frame name="Shifted split day" route="/" tag="cardio followed Pull">
          <DashShifted />
        </Frame>
        <Frame name="Lifting missed-day prompt" route="/" tag="cardio never prompts">
          <DashMissedLifting />
        </Frame>
        <Frame name="Scheduled-deload week" route="/" tag="cardio as authored">
          <DashDeloadWeek />
        </Frame>
        <Frame name="Shifted week in history" route="/history" tag="Sat Bike stays">
          <HistoryWeek title="Week 4 · Mon, Oct 12 – Sun, Oct 18" groups={WEEK4_SHIFTED} />
        </Frame>
      </Section>

      <Section n="05" title="Log cardio — two fields, prefilled from the plan, nothing else">
        <Frame name="Log cardio" route="dialog" tag="prefilled">
          <LogCardioDialog />
        </Frame>
        <Frame name="Duration differs" route="dialog" tag="27 ≠ 20 · plan unchanged">
          <LogCardioDialog min="27" />
        </Frame>
        <Frame name="Type differs" route="dialog" tag="Bike ≠ Incline Walk">
          <LogCardioDialog type="Bike" min="25" date="Tue, Oct 6" />
        </Frame>
        <Frame name="Validation" route="dialog" tag="no history written">
          <LogCardioDialog
            type=""
            min="2.5"
            errors={{ type: "Enter the activity.", min: "Enter whole minutes, 1 or more." }}
          />
        </Frame>
        <Frame name="Saving" route="dialog" tag="buttons disabled">
          <LogCardioDialog min="23" saving />
        </Frame>
        <Frame name="Save failed" route="dialog" tag="entries kept">
          <LogCardioDialog min="23" failed />
        </Frame>
        <Frame name="Log cardio (dark)" route="dialog" tag="dark mode" dark>
          <LogCardioDialog min="23" />
        </Frame>
      </Section>

      <Section n="06" title="History — the whole day, plan vs record, missed as a fact">
        <Frame name="This week" route="/history" tag="combined · cardio-only">
          <HistoryWeek title="Week 4 · Mon, Oct 12 – Sun, Oct 18" groups={WEEK4} />
        </Frame>
        <Frame name="Last week" route="/history?week=3" tag="changed type · missed">
          <HistoryWeek title="Week 3 · Mon, Oct 5 – Sun, Oct 11" groups={WEEK3} />
        </Frame>
        <Frame name="Last week (dark)" route="/history?week=3" tag="dark mode" dark>
          <HistoryWeek title="Week 3 · Mon, Oct 5 – Sun, Oct 11" groups={WEEK3} />
        </Frame>
        <Frame name="Correct cardio" route="dialog" tag="type + minutes · no delete">
          <CorrectDialog />
        </Frame>
        <Frame name="Correction validation" route="dialog" tag="rejected, unchanged">
          <LogCardioDialog
            title="Edit cardio"
            date="Tue, Oct 6"
            planned="Incline Walk · 20 min"
            type="Bike"
            min="-5"
            errors={{ min: "Enter whole minutes, 1 or more." }}
          />
        </Frame>
      </Section>

      <Section n="07" title="Clone forward — the cardio plan comes along, the record doesn't">
        <Frame name="What comes across" route="/plan/clone/[sourceId]" tag="plan-forward">
          <CloneSummary />
        </Frame>
      </Section>

      <Section n="08" title="States — loading, notifications">
        <Frame name="Dashboard loading" route="/" tag="skeleton">
          <DashLoading />
        </Frame>
        <Frame name="Toasts" route="toast" tag="success · info · error">
          <div className="bg-background p-4">
            <Toast>Incline Walk added to Tuesday</Toast>
            <Toast>Cardio updated</Toast>
            <Toast>Removed from Tuesday. Logged cardio stays.</Toast>
            <Toast>Cardio logged</Toast>
            <Toast>Already logged</Toast>
            <Toast tone="error">Couldn't save. Your entries are still here.</Toast>
          </div>
        </Frame>
      </Section>

      <Section n="09" title="Theme specimen & commitments">
        <Frame name="Tokens" route="theme" tag="no status color">
          <div className="space-y-3 p-5 text-sm">
            <p><span className="inline-block h-3 w-8 rounded bg-primary align-middle" /> primary — Start workout; Log cardio only on a cardio-only day</p>
            <p><span className="inline-block h-3 w-8 rounded bg-secondary align-middle" /> secondary — Log on a combined day</p>
            <p className="text-muted-foreground">muted-foreground — "Cardio" label, Planned …, Missed, Upcoming</p>
            <p className="text-base tabular-nums">Incline Walk — 23 min · text-base / text-sm, tabular</p>
            <p className="text-xs text-muted-foreground">No progress green. No deload amber. No cardio tag.</p>
          </div>
        </Frame>
        <Frame name="Commitments" route="legend" tag="check every frame">
          <ul className="space-y-2 p-5 text-sm">
            <li>✓ Type + whole minutes only; no metric, timer, chart, tag, gym</li>
            <li>✓ Cardio belongs to the day, not the Session</li>
            <li>✓ One planned cardio item per day</li>
            <li>✓ Lifting is primary on a combined day</li>
            <li>✓ Cardio-only day is a real day (no fake workout)</li>
            <li>✓ Record ≠ plan; "Planned …" only when different</li>
            <li>✓ Missed is muted text, never a prompt</li>
            <li>✓ Shift carries day cardio; cardio never shifts; deload ignores it</li>
            <li>✓ No delete for logged cardio</li>
          </ul>
        </Frame>
      </Section>

      <footer className="mx-auto mt-10 max-w-6xl border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Generated from docs/design/07-cardio-logging-design-doc.md v1.0. Commitments: planned
        cardio per day (≤ 1) · type + whole minutes · plan-first logging · record ≠ plan ·
        independent completion · missed is display-only · shifts carry day cardio · no deload,
        progression, e1RM, goals, gym, or health data. Rendering only — not imported into the app.
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
