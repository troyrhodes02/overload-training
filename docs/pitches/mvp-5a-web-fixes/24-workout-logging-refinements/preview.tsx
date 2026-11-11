/* eslint-disable */
// @ts-nocheck
/**
 * Workout Logging Refinements — UI Design Preview (implementation contract)
 * ========================================================================
 * Pitch 24 · generated from
 * docs/pitches/mvp-5a-web-fixes/24-workout-logging-refinements/design.md v1.0
 *
 * A RENDERING OF THE DESIGN, NOT PRODUCT CODE. Self-contained, mock data only,
 * never imported by the app, excluded from typecheck, lint, format, and the
 * build. Where this preview and the theme disagree, the theme wins.
 *
 * The bar above the frame (screen, state, appearance) is preview chrome only.
 *
 * Commitments every frame respects:
 *   • A reassess call is a HOLD: no tag, no color. Its action line uses the
 *     strong (foreground, medium) treatment; its evidence is muted. It never
 *     prints a weight.
 *   • A fixed target prints as one number ("3 × 10", "3 sets · 10 reps",
 *     "of 10"). A range keeps its en dash.
 *   • The swap picker opens on the planned muscle; the Select can reach any
 *     group. The empty state keeps the Select so the lifter can leave it.
 *   • The admin Plan column is words, never color alone: Pro, Pro + "trial",
 *     Comped (secondary badge), Free (plain muted text).
 */
import * as React from "react";
import { ChevronRight, Lock, Search, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MUSCLES = [
  "Chest", "Back", "Lower Back", "Traps", "Shoulders", "Biceps", "Triceps",
  "Forearms", "Core", "Quads", "Hamstrings", "Glutes", "Calves", "Adductors",
  "Abductors", "Neck",
];

const BY_MUSCLE: Record<string, { name: string; fav?: boolean }[]> = {
  Chest: [
    { name: "Incline Dumbbell Press", fav: true },
    { name: "Chest Press Machine" },
    { name: "Push-Up" },
  ],
  Core: [
    { name: "Crunches", fav: true },
    { name: "Hanging Leg Raise" },
    { name: "Plank" },
    { name: "Cable Crunch" },
  ],
  Neck: [],
};

/* ───────────────────────── Screen 1: planned exercise dialog ───────────── */

function PlannedExerciseDialogFrame() {
  const [mode, setMode] = React.useState<"range" | "fixed">("fixed");
  const [min, setMin] = React.useState("8");
  const [max, setMax] = React.useState("10");
  const [target, setTarget] = React.useState("10");
  const switchTo = (next: "range" | "fixed") => {
    if (next === mode) return;
    if (next === "fixed") setTarget(min || target);
    else {
      setMin(target);
      setMax(target);
    }
    setMode(next);
  };
  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="font-semibold">Cable Fly</p>
        <p className="text-sm text-muted-foreground">Chest · Cable</p>
      </div>
      <div className="flex items-end gap-6">
        <div className="space-y-2">
          <Label htmlFor="sets">Sets</Label>
          <Input id="sets" defaultValue="3" inputMode="numeric" className="h-11 w-20 text-center text-base tabular-nums" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-sm leading-none font-medium">Reps</span>
            <Tabs value={mode} onValueChange={(v) => switchTo(v as "range" | "fixed")}>
              <TabsList aria-label="Rep target type" className="h-8">
                <TabsTrigger value="range" className="h-6 px-2 text-xs">Range</TabsTrigger>
                <TabsTrigger value="fixed" className="h-6 px-2 text-xs">Fixed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {mode === "range" ? (
            <div className="flex items-center gap-2">
              <Input aria-label="Minimum reps" value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" className="h-11 w-20 text-center text-base tabular-nums" />
              <span aria-hidden className="text-muted-foreground">–</span>
              <Input aria-label="Maximum reps" value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" className="h-11 w-20 text-center text-base tabular-nums" />
            </div>
          ) : (
            <Input aria-label="Target reps" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="numeric" className="h-11 w-20 text-center text-base tabular-nums" />
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline">Cancel</Button>
        <Button>Save</Button>
      </div>
      <div className="rounded-md border border-border p-3 text-sm">
        <p className="text-xs text-muted-foreground">Session row after saving</p>
        <p className="mt-1 font-medium">Cable Fly</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          3 sets · {mode === "fixed" ? `${target} reps` : `${min}–${max} reps`}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── Screen 2: card + Today ──────────────────────── */

function Recommendation({ action, evidence, strong }: { action: string; evidence: string; strong: boolean }) {
  return (
    <div className="mt-2 space-y-0.5">
      <p className={strong ? "text-sm font-medium text-foreground tabular-nums" : "text-sm text-muted-foreground tabular-nums"}>{action}</p>
      <p className="text-xs text-muted-foreground tabular-nums">{evidence}</p>
    </div>
  );
}

function CardFrame({ state }: { state: string }) {
  const cases = {
    reassess: {
      name: "Lat Pulldown", scheme: "3 × 6–10", gym: "Downtown Gym",
      rec: { action: "Reassess the weight next time", evidence: "Last time: 3, 8, 8 of 6–10 at Downtown Gym, below 6. A deload follows 2 complete sessions running below 6.", strong: true },
    },
    fixed: {
      name: "Cable Crunch", scheme: "3 × 10", gym: "Downtown Gym",
      rec: { action: "Reassess the weight today", evidence: "Last time: 10, 6, 4 of 10 at Downtown Gym, below 10. A deload follows 2 complete sessions running below 10.", strong: true },
    },
    bodyweight: {
      name: "Hanging Leg Raise", scheme: "3 × 12 · bodyweight, reps only", gym: null,
      rec: { action: "Reassess the difficulty next time", evidence: "Last time: 12, 7, 5 of 12, below 12. A deload follows 2 complete sessions running below 12.", strong: true },
    },
    "in-range miss": {
      name: "Barbell Bench Press", scheme: "3 × 6–8", gym: null,
      rec: { action: "Stay at 185 lb next time", evidence: "Last time: 8, 7, 6 of 6–8", strong: false },
    },
  } as const;
  const c = cases[state as keyof typeof cases] ?? cases.reassess;
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-medium">{c.name}</h2>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{c.scheme}</p>
          </div>
          {c.gym ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">{c.gym}<Lock className="size-3" /></span>
          ) : null}
        </div>
        <Recommendation {...c.rec} />
        <div className="mt-4 grid grid-cols-[auto_1fr_1fr] items-center gap-3 tabular-nums">
          <span className="text-sm text-muted-foreground">Set 1</span>
          <Input defaultValue={c.scheme.includes("bodyweight") ? "" : "90"} disabled={c.scheme.includes("bodyweight")} placeholder={c.scheme.includes("bodyweight") ? "—" : "lbs"} className="h-12 text-center text-lg" />
          <Input placeholder="reps" className="h-12 text-center text-lg" />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Today · Push Day 1</p>
        <ul className="mt-2 divide-y divide-border text-sm">
          {[["Barbell Bench Press", "3 × 6–8"], ["Cable Fly", "3 × 10"], ["Cable Crunch", "3 × 10"]].map(([n, s]) => (
            <li key={n} className="flex justify-between py-2"><span>{n}</span><span className="tabular-nums text-muted-foreground">{s}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───────────────────────── Screen 3: swap picker ───────────────────────── */

function SwapFrame({ state }: { state: string }) {
  const [muscle, setMuscle] = React.useState(state === "empty" ? "Neck" : "Chest");
  const [q, setQ] = React.useState("");
  const locked = state === "locked";
  const rows = (BY_MUSCLE[muscle] ?? [{ name: `${muscle} exercise` }]).filter((r) =>
    r.name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <section className="mx-auto w-full max-w-md space-y-3">
      <div>
        <p className="font-medium">Swap: Cable Fly</p>
        <p className="text-sm text-muted-foreground">Planned: Chest</p>
      </div>
      {locked ? (
        <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">Sets are logged — this exercise is locked.</div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="swap-muscle">Muscle group</Label>
            <Select value={muscle} onValueChange={setMuscle}>
              <SelectTrigger id="swap-muscle" className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MUSCLES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(BY_MUSCLE[muscle] ?? [1]).length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm">No active exercises for {muscle}.</p>
              <p className="mt-1 text-sm text-muted-foreground">Pick another muscle group, or add one in the library.</p>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search exercises…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {rows.map((c) => (
                  <li key={c.name}>
                    <button type="button" className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-sm">
                      <span className="w-4 text-muted-foreground">{c.fav ? <Star className="size-3.5" /> : null}</span>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

/* ───────────────────────── Screen 4: admin directory ───────────────────── */

type Plan = "pro" | "trial" | "comped" | "free";

function PlanBadge({ plan }: { plan: Plan }) {
  if (plan === "free") return <span className="text-sm text-muted-foreground">Free</span>;
  if (plan === "comped") return <Badge variant="secondary">Comped</Badge>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant="outline">Pro</Badge>
      {plan === "trial" ? <span className="text-xs text-muted-foreground">trial</span> : null}
    </span>
  );
}

const ACCOUNTS: { name: string; handle: string; plan: Plan; joined: string; seen: string; tour: string }[] = [
  { name: "Ana Ruiz", handle: "@ana · ana@example.com", plan: "pro", joined: "Nov 2", seen: "Today", tour: "Finished" },
  { name: "Ben Lee", handle: "@ben · ben@example.com", plan: "trial", joined: "Nov 9", seen: "Yesterday", tour: "Not yet" },
  { name: "Cy Park", handle: "@cy · cy@example.com", plan: "comped", joined: "Oct 1", seen: "Nov 8", tour: "Skipped" },
  { name: "Di Shaw", handle: "@di · di@example.com", plan: "free", joined: "Sep 3", seen: "Not seen", tour: "Not yet" },
];

function AdminFrame() {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <span className="text-sm text-muted-foreground tabular-nums">4 accounts</span>
      </div>
      {/* Phone */}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
        {ACCOUNTS.map((a) => (
          <li key={a.name} className="flex min-h-16 items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-medium">{a.name}</div>
              <div className="truncate text-xs text-muted-foreground">{a.handle}</div>
              <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
                <span>Active</span> · <PlanBadge plan={a.plan} /> · Joined {a.joined}
              </div>
            </div>
            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </li>
        ))}
      </ul>
      {/* md+ */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              {["Account", "Status", "Plan", "Joined", "Last seen", "Tour"].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ACCOUNTS.map((a) => (
              <tr key={a.name} className="border-b border-border last:border-0">
                <td className="px-3 py-2.5"><div className="font-medium text-primary">{a.name}</div><div className="text-xs text-muted-foreground">{a.handle}</div></td>
                <td className="px-3 py-2.5 text-muted-foreground">Active</td>
                <td className="px-3 py-2.5"><PlanBadge plan={a.plan} /></td>
                <td className="px-3 py-2.5">{a.joined}</td>
                <td className="px-3 py-2.5">{a.seen}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{a.tour}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ───────────────────────── Screen 5: public trial copy ─────────────────── */

const TRIAL = "Try Pro free for 14 days. No credit card needed. After that, keep using Overload on the free plan or upgrade for $4.99 a month.";

function PublicFrame() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">You logged the reps. Know what to do next.</h1>
        <div className="flex justify-center gap-2"><Button>Create account</Button><Button variant="outline">Sign in</Button></div>
        <p className="text-sm text-muted-foreground">{TRIAL}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="font-medium">Pricing</p>
        <p className="mt-6 text-sm text-muted-foreground">{TRIAL}</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        How it fits the trial: try Pro free for 14 days, no credit card needed. Use the code whenever you subscribe, during the trial or after it.
      </div>
    </div>
  );
}

/* ───────────────────────── Preview chrome ──────────────────────────────── */

const SCREENS = {
  "Plan dialog": { states: ["default"], render: () => <PlannedExerciseDialogFrame /> },
  "Logging card": { states: ["reassess", "fixed", "bodyweight", "in-range miss"], render: (s: string) => <CardFrame state={s} /> },
  "Swap picker": { states: ["default", "empty", "locked"], render: (s: string) => <SwapFrame key={s} state={s} /> },
  "Admin accounts": { states: ["default"], render: () => <AdminFrame /> },
  "Public trial copy": { states: ["default"], render: () => <PublicFrame /> },
} as const;

export default function Preview() {
  const [screen, setScreen] = React.useState<keyof typeof SCREENS>("Logging card");
  const [state, setState] = React.useState("reassess");
  const [dark, setDark] = React.useState(false);
  const def = SCREENS[screen];
  return (
    <div className={dark ? "dark" : ""}>
      <div className="flex flex-wrap gap-2 border-b border-border bg-muted p-3 text-xs">
        {Object.keys(SCREENS).map((k) => (
          <Button key={k} size="sm" variant={k === screen ? "default" : "outline"} onClick={() => { setScreen(k as keyof typeof SCREENS); setState(SCREENS[k as keyof typeof SCREENS].states[0]); }}>{k}</Button>
        ))}
        <span className="mx-2 self-center text-muted-foreground">State:</span>
        {def.states.map((s) => (
          <Button key={s} size="sm" variant={s === state ? "secondary" : "ghost"} onClick={() => setState(s)}>{s}</Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setDark((d) => !d)}>{dark ? "Light" : "Dark"}</Button>
      </div>
      <div className="min-h-screen bg-background p-4 text-foreground md:p-8">{def.render(state)}</div>
    </div>
  );
}
