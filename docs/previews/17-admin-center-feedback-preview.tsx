/* eslint-disable */
// @ts-nocheck
/**
 * Admin Center & Feedback — UI Design Preview (implementation contract)
 * =====================================================================
 * Pitch 17 · generated from docs/design/17-admin-center-feedback-design-doc.md v1.0
 *
 * THIS IS A RENDERING OF THE DESIGN, NOT PRODUCT CODE. A self-contained,
 * mock-data-only preview used as the visual contract the spec and the
 * implementation tickets are held to. It never touches Prisma, Supabase, a
 * server action, or the network. It is excluded from typecheck, lint, format,
 * and the build (tsconfig.json / eslint.config.mjs / .prettierignore) and is
 * never imported by the app. The real UI is built with shadcn/ui against
 * src/app/globals.css; where this preview and the theme disagree, the theme
 * wins.
 *
 * The chrome above the frame (screen, state, width, appearance) is preview
 * chrome only — not product UI.
 *
 * Commitments every frame is built to respect:
 *   • Metadata, never training: no plan, session, exercise, set, weight, gym,
 *     goal, cardio, record, or per-account training count on any admin frame.
 *     "Created a plan" / "Logged a workout" exist only as totals.
 *   • Absence is the boundary: lifters never see an Admin item; a non-admin
 *     on any /admin URL gets the ordinary not-found page.
 *   • Suspend / Reactivate always go through an alertdialog naming the
 *     account; every change shows its audit line at once.
 *   • Counts say what they mean (definitions + "date only, since this view
 *     shipped").
 *   • progress / deload colors appear nowhere. Destructive red marks only
 *     Suspended + the suspend action.
 *   • No plan/entitlement column (Plans & Billing adds it). No delete control
 *     (halted — see the "Deferred" frame).
 *   • Feedback is Free, attaches nothing, and promises no reply.
 */
import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  Shield,
  TriangleAlert,
  X,
  Menu,
  EllipsisVertical,
  CircleCheck,
} from "lucide-react";

/* ───────────────────────────── mock data ───────────────────────────── */

const ADMIN = { name: "William Rhodes", tz: "America/Chicago" };

const ACCOUNTS = [
  { id: "a1", name: "William Rhodes", username: "wrhodes", email: "william@example.com", status: "active", admin: true, joined: "Oct 19", joinedFull: "Oct 19, 2026", seen: "Today", seenFull: "Oct 22, 2026", tour: "Finished", tz: "America/Chicago", feedback: 0 },
  { id: "a2", name: "Maya Chen", username: "mayac", email: "maya@example.com", status: "suspended", admin: false, joined: "Sep 3", joinedFull: "Sep 3, 2026", seen: "Oct 14", seenFull: "Oct 14, 2026", tour: "Skipped", tz: "America/New_York", feedback: 2, suspendedSince: "Oct 21" },
  { id: "a3", name: "Jordan Lee", username: "jlee", email: "jordan@example.com", status: "active", admin: false, joined: "Sep 12", joinedFull: "Sep 12, 2026", seen: "Oct 21", seenFull: "Oct 21, 2026", tour: "Finished", tz: "America/Chicago", feedback: 1 },
  { id: "a4", name: "", username: "", email: "sam@example.com", status: "active", admin: false, joined: "Oct 20", joinedFull: "Oct 20, 2026", seen: "Not seen", seenFull: "Not seen", tour: "Not yet", tz: "UTC", feedback: 1 },
  { id: "a5", name: "Priya Nair", username: "priyan", email: "priya@example.com", status: "active", admin: false, joined: "Aug 28", joinedFull: "Aug 28, 2026", seen: "Oct 18", seenFull: "Oct 18, 2026", tour: "Finished", tz: "America/Denver", feedback: 0 },
];

const METRICS = [
  { label: "Registered accounts", value: "24", caption: "1 suspended" },
  { label: "Active, last 7 days", value: "11", caption: "46% of registered" },
  { label: "Active, last 30 days", value: "17", caption: "71% of registered" },
  { label: "New this month", value: "3", caption: "since Oct 1" },
  { label: "Created a plan", value: "19", caption: "79% of registered" },
  { label: "Logged a workout", value: "16", caption: "67% of registered" },
];

const COHORTS = [
  { month: "Oct 2026", signed: 3, back: [1, "33%"], recent: [3, "100%"] },
  { month: "Sep 2026", signed: 8, back: [6, "75%"], recent: [6, "75%"] },
  { month: "Aug 2026", signed: 5, back: [4, "80%"], recent: [3, "60%"] },
  { month: "Jul 2026", signed: 0 },
  { month: "Jun 2026", signed: 2, back: [2, "100%"], recent: [1, "50%"] },
  { month: "May 2026", signed: 6, back: [5, "83%"], recent: [4, "67%"] },
];

const FEEDBACK = [
  { id: "f1", category: "Bug", date: "Oct 21", full: "Oct 21, 2026 · 8:40 AM", from: "a2", message: "The set entry jumps when I tap reps on the second set. Happens on my phone, not on the laptop.", handled: null },
  { id: "f2", category: "Idea", date: "Oct 20", full: "Oct 20, 2026 · 6:12 PM", from: "a3", message: "Would love to see last week's weights on the session summary.", handled: null },
  { id: "f3", category: "Question", date: "Oct 18", full: "Oct 18, 2026 · 7:05 AM", from: "a4", message: "How does Overload decide when a lift is ready to go up?", handled: null },
  { id: "f4", category: "Other", date: "Oct 9", full: "Oct 9, 2026 · 9:30 PM", from: "a2", message: "Thanks for building this, it replaced my notes app.", handled: "Oct 10" },
];

const AUDIT = [
  { when: "Oct 22, 2026 · 9:15 AM", short: "Oct 22 · 9:15 AM", action: "marked feedback handled", account: "a2", feedback: "f4" },
  { when: "Oct 21, 2026 · 3:02 PM", short: "Oct 21 · 3:02 PM", action: "changed a feedback category from Idea to Bug", account: "a2", feedback: "f1" },
  { when: "Oct 21, 2026 · 2:14 PM", short: "Oct 21 · 2:14 PM", action: "suspended the account", account: "a2" },
  { when: "Sep 30, 2026 · 9:02 AM", short: "Sep 30 · 9:02 AM", action: "reactivated the account", account: "a2" },
  { when: "Sep 29, 2026 · 8:47 PM", short: "Sep 29 · 8:47 PM", action: "suspended the account", account: "a2" },
];

const acct = (id) => ACCOUNTS.find((a) => a.id === id);
const display = (a) => a.name || a.email;

/* ─────────────────────── shadcn-shaped primitives ─────────────────────── */

const cx = (...c) => c.filter(Boolean).join(" ");

function Button({ variant = "default", size = "default", className, children, disabled, ...p }) {
  const v = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-border bg-background hover:bg-accent",
    ghost: "hover:bg-accent",
    destructive: "bg-destructive text-white hover:bg-destructive/90",
    destructiveOutline: "border border-destructive/40 bg-background text-destructive hover:bg-destructive/5",
    link: "text-primary underline-offset-4 hover:underline px-0",
  }[variant];
  const s = { default: "h-10 px-4", lg: "h-11 px-5", sm: "h-9 px-3", icon: "size-10" }[size];
  return (
    <button disabled={disabled} className={cx("inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50", v, s, className)} {...p}>
      {children}
    </button>
  );
}

function Badge({ variant = "secondary", className, children }) {
  const v = {
    secondary: "bg-secondary text-secondary-foreground",
    outline: "border border-border text-foreground",
    suspended: "border border-destructive/40 text-destructive",
  }[variant];
  return <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", v, className)}>{children}</span>;
}

function Alert({ children, action }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

const Sk = ({ className }) => <div className={cx("animate-pulse rounded-md bg-muted", className)} />;

function StatusBadge({ a }) {
  return a.status === "suspended" ? <Badge variant="suspended">Suspended</Badge> : <span className="text-sm text-muted-foreground">Active</span>;
}

/* ─────────────────────────── shells ─────────────────────────── */

const ADMIN_NAV = [
  { key: "overview", label: "Overview" },
  { key: "accounts", label: "Accounts" },
  { key: "feedback", label: "Feedback" },
  { key: "audit", label: "Audit log", phone: "Audit" },
];

function AdminShell({ desktop, active, children }) {
  const links = (
    <nav aria-label="Admin" className={cx("flex gap-1", !desktop && "overflow-x-auto")}>
      {ADMIN_NAV.map((n) => (
        <a key={n.key} aria-current={n.key === active ? "page" : undefined} className={cx("whitespace-nowrap rounded-md px-3 py-2 text-sm", n.key === active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
          {desktop ? n.label : n.phone ?? n.label}
        </a>
      ))}
    </nav>
  );
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="border-b border-border px-4 py-3">
        <div className={cx("mx-auto flex items-center gap-3", desktop && "max-w-4xl")}>
          <span className="font-semibold">Overload</span>
          <span className="text-sm font-medium text-muted-foreground">Admin</span>
          {desktop && <div className="ml-6">{links}</div>}
          <Button variant="ghost" size="icon" aria-label="Account menu" className="ml-auto">
            <EllipsisVertical className="size-5" />
          </Button>
        </div>
      </header>
      <div className={cx("mx-auto px-4 pt-3", desktop && "max-w-4xl")}>
        <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft aria-hidden className="size-4" /> Back to Overload
        </a>
        {!desktop && <div className="mt-2 border-b border-border pb-2">{links}</div>}
      </div>
      <main className={cx("mx-auto px-4 py-6", desktop && "max-w-4xl")}>{children}</main>
    </div>
  );
}

function LifterShell({ children, desktop }) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="flex h-14 items-center gap-1 border-b border-border px-2">
        {!desktop && (
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
        )}
        <span className="px-2 font-semibold">Overload</span>
        <Button variant="ghost" size="icon" aria-label="Account menu" className="ml-auto">
          <EllipsisVertical className="size-5" />
        </Button>
      </header>
      <main className="mx-auto w-full max-w-screen-sm px-4 py-6">{children}</main>
    </div>
  );
}

/* ─────────────────────────── Screen 1: entry points ─────────────────────────── */

function MenuItem({ icon: I, children }) {
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent">
      <I aria-hidden className="size-4" />
      {children}
    </div>
  );
}

function EntryPoints() {
  return (
    <div className="grid gap-6 p-6 sm:grid-cols-3">
      <Labeled label="Account menu · lifter">
        <div className="w-52 rounded-md border border-border bg-popover p-1 shadow-md">
          <MenuItem icon={Settings}>Settings</MenuItem>
          <MenuItem icon={MessageSquare}>Send feedback</MenuItem>
          <MenuItem icon={LogOut}>Sign out</MenuItem>
        </div>
      </Labeled>
      <Labeled label="Account menu · owner (server says admin)">
        <div className="w-52 rounded-md border border-border bg-popover p-1 shadow-md">
          <MenuItem icon={Settings}>Settings</MenuItem>
          <MenuItem icon={MessageSquare}>Send feedback</MenuItem>
          <MenuItem icon={Shield}>Admin</MenuItem>
          <MenuItem icon={LogOut}>Sign out</MenuItem>
        </div>
      </Labeled>
      <Labeled label="Phone sheet · secondary group (everyone)">
        <div className="w-60 space-y-1 border-t border-border pt-2">
          {[
            [Settings, "Settings"],
            [MessageSquare, "Send feedback"],
          ].map(([I, l]) => (
            <div key={l} className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground">
              <I aria-hidden className="size-5" />
              {l}
            </div>
          ))}
        </div>
      </Labeled>
    </div>
  );
}

function Labeled({ label, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/* ─────────────────────────── Screen 3: overview ─────────────────────────── */

function Overview({ desktop, state }) {
  return (
    <AdminShell desktop={desktop} active="overview">
      <section className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">Counts across every account. Nothing here shows anyone&apos;s training.</p>
        </header>
        {state === "error" ? (
          <Alert action={<Button variant="outline" size="sm">Try again</Button>}>Couldn&apos;t load the counts. Try again.</Alert>
        ) : (
          <>
            <dl className={cx("grid gap-3", desktop ? "grid-cols-3" : "grid-cols-2")}>
              {METRICS.map((m) => (
                <div key={m.label} className="rounded-lg border border-border bg-card p-4">
                  {state === "loading" ? (
                    <div className="space-y-2">
                      <Sk className="h-8 w-14" />
                      <Sk className="h-4 w-24" />
                      <Sk className="h-3 w-20" />
                    </div>
                  ) : (
                    <>
                      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{m.value}</dd>
                      <dt className="mt-1 text-sm font-medium">{m.label}</dt>
                      <p className="text-xs text-muted-foreground tabular-nums">{m.caption}</p>
                    </>
                  )}
                </div>
              ))}
            </dl>
            <section className="space-y-2">
              <h2 className="text-base font-semibold">Signup cohorts</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <table className="w-full text-sm tabular-nums">
                  <caption className="sr-only">Signup cohorts by month, last six months</caption>
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th scope="col" className="px-3 py-2 font-medium">Month</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Signed up</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Came back</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{desktop ? "Active, 30 days" : "30 d"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COHORTS.map((c) => (
                      <tr key={c.month} className="border-b border-border last:border-0">
                        <th scope="row" className="px-3 py-2 text-left font-normal">{c.month}</th>
                        {state === "loading" ? (
                          <td colSpan={3} className="px-3 py-2"><Sk className="h-4 w-full" /></td>
                        ) : c.signed === 0 ? (
                          <>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right">{c.signed}</td>
                            <td className="px-3 py-2 text-right">{c.back[0]} <span className="text-muted-foreground">{c.back[1]}</span></td>
                            <td className="px-3 py-2 text-right">{c.recent[0]} <span className="text-muted-foreground">{c.recent[1]}</span></td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Came back: active on a later day than the signup day. Active, 30 days: last active in the last 30 days. Last-active dates are kept as a date only, and only since this view shipped. Dates are in your time zone ({ADMIN.tz}).
              </p>
            </section>
          </>
        )}
      </section>
    </AdminShell>
  );
}

/* ─────────────────────────── Screen 4: accounts ─────────────────────────── */

function Accounts({ desktop, state }) {
  const filter = state === "suspended-filter" ? "Suspended" : "All";
  const rows = state === "no-match" ? [] : filter === "Suspended" ? ACCOUNTS.filter((a) => a.status === "suspended") : ACCOUNTS;
  const query = state === "no-match" ? "zz" : "";
  return (
    <AdminShell desktop={desktop} active="accounts">
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Accounts</h1>
          <span className="text-sm text-muted-foreground tabular-nums">24 accounts</span>
        </div>
        <div className={cx("flex gap-3", desktop ? "items-center" : "flex-col")}>
          <div className="relative flex-1">
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" aria-label="Search accounts" defaultValue={query} placeholder="Search name, username, email" className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
          </div>
          <div role="tablist" className="inline-flex rounded-md bg-muted p-1">
            {["All", "Active", "Suspended"].map((f) => (
              <a key={f} aria-current={f === filter ? "page" : undefined} className={cx("rounded-sm px-3 py-1.5 text-sm", f === filter ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{f}</a>
            ))}
          </div>
        </div>
        {state === "emails-unavailable" && <Alert>Emails couldn&apos;t be loaded right now. Search by name or username still works.</Alert>}
        {state === "error" ? (
          <Alert action={<Button variant="outline" size="sm">Try again</Button>}>Couldn&apos;t load accounts. Try again.</Alert>
        ) : state === "loading" ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 p-3"><Sk className="h-4 w-40" /><Sk className="h-3 w-56" /><Sk className="h-3 w-44" /></div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm">
            {state === "no-match" ? (
              <p>No accounts match &ldquo;zz&rdquo;. <Button variant="link" className="h-auto">Clear search</Button></p>
            ) : (
              <p>No suspended accounts.</p>
            )}
          </div>
        ) : desktop ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  {["Account", "Status", "Joined", "Last seen", "Tour"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                    <td className="px-3 py-2.5">
                      <a className="font-medium text-primary">{a.name || <span className="text-muted-foreground">No name</span>}</a>
                      {a.admin && <Badge variant="outline" className="ml-2">Admin</Badge>}
                      <div className="text-xs text-muted-foreground">{a.username ? `@${a.username}` : "no username"} · {state === "emails-unavailable" ? "—" : a.email}</div>
                    </td>
                    <td className="px-3 py-2.5"><StatusBadge a={a} /></td>
                    <td className="px-3 py-2.5">{a.joined}</td>
                    <td className="px-3 py-2.5">{a.seen}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{a.tour}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((a) => (
              <li key={a.id}>
                <a className="flex min-h-16 items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 font-medium">
                      {a.name || <span className="text-muted-foreground">No name</span>}
                      {a.admin && <Badge variant="outline">Admin</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{a.username ? `@${a.username}` : "no username"} · {state === "emails-unavailable" ? "—" : a.email}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums">
                      <StatusBadge a={a} /> · Joined {a.joined} · {a.seen === "Not seen" ? "Not seen" : `Seen ${a.seen.toLowerCase() === "today" ? "today" : a.seen}`}
                    </div>
                  </div>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && state !== "loading" && state !== "error" && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm">Next <ChevronRight aria-hidden className="size-4" /></Button>
          </div>
        )}
      </section>
    </AdminShell>
  );
}

/* ─────────────────────────── Screen 5 + 6: account page + dialogs ─────────────────────────── */

function AuditLines({ lines }) {
  if (!lines.length) return <p className="text-sm text-muted-foreground">No admin actions yet.</p>;
  return (
    <ul className="divide-y divide-border">
      {lines.map((l, i) => (
        <li key={i} className="grid grid-cols-[8.5rem_1fr] gap-2 py-2 text-sm">
          <span className="text-muted-foreground tabular-nums">{l.short}</span>
          <span>{l.action.charAt(0).toUpperCase() + l.action.slice(1)} · by {ADMIN.name}</span>
        </li>
      ))}
    </ul>
  );
}

function AccountPage({ desktop, state }) {
  const a = state === "active" || state === "dialog-suspend" || state === "dialog-pending" || state === "dialog-failed" ? acct("a3") : state === "admin-protected" ? acct("a1") : acct("a2");
  const lines = AUDIT.filter((l) => l.account === a.id && !l.feedback);
  const dialog = state.startsWith("dialog-") ? state : null;
  return (
    <div className="relative min-h-full">
      <AdminShell desktop={desktop} active="accounts">
        <section className={cx("space-y-6", desktop && "max-w-2xl")}>
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft aria-hidden className="size-4" /> Accounts</a>
          {state === "loading" ? (
            <div className="space-y-4"><Sk className="h-7 w-48" /><Sk className="h-4 w-64" />{Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-4 w-full" />)}<Sk className="h-24 w-full" /></div>
          ) : (
            <>
              <header className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold">{a.name || <span className="text-muted-foreground">No name</span>}</h1>
                  {a.status === "suspended" && <Badge variant="suspended">Suspended</Badge>}
                  {a.admin && <Badge variant="outline">Admin</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">@{a.username} · {a.email}</p>
              </header>
              <dl className="divide-y divide-border rounded-lg border border-border bg-card text-sm tabular-nums">
                {[
                  ["Status", a.status === "suspended" ? `Suspended since ${a.suspendedSince}` : "Active"],
                  ["Joined", a.joinedFull],
                  ["Last seen", a.seenFull],
                  ["Tour", a.tour],
                  ["Time zone", a.tz],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                <div className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2.5">
                  <dt className="text-muted-foreground">Feedback sent</dt>
                  <dd>{a.feedback ? <>{a.feedback} · <a className="text-primary">View in inbox</a></> : "None"}</dd>
                </div>
              </dl>
              <section className="space-y-2 rounded-lg border border-border p-4">
                <h2 className="text-base font-semibold">Access</h2>
                {a.admin ? (
                  <p className="text-sm text-muted-foreground">Admin accounts can&apos;t be suspended here.</p>
                ) : a.status === "suspended" ? (
                  <>
                    <p className="text-sm text-muted-foreground">Suspended accounts can&apos;t use Overload. Their training history is kept.</p>
                    <Button size={desktop ? "default" : "lg"}>Reactivate account…</Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">This account can use Overload.</p>
                    <Button variant="destructiveOutline" size={desktop ? "default" : "lg"}>Suspend account…</Button>
                  </>
                )}
              </section>
              <section className="space-y-2">
                <h2 className="text-base font-semibold">Admin actions</h2>
                <AuditLines lines={lines} />
                {lines.length > 0 && <a className="inline-flex items-center gap-1 text-sm text-primary">View full audit log <ChevronRight aria-hidden className="size-4" /></a>}
              </section>
            </>
          )}
        </section>
      </AdminShell>
      {dialog && <ChangeAccessDialog a={dialog === "dialog-reactivate" ? acct("a2") : a} kind={dialog === "dialog-reactivate" ? "reactivate" : "suspend"} pending={dialog === "dialog-pending"} failed={dialog === "dialog-failed"} />}
    </div>
  );
}

function ChangeAccessDialog({ a, kind, pending, failed }) {
  const suspend = kind === "suspend";
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4">
      <div role="alertdialog" aria-labelledby="dlg-t" className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 id="dlg-t" className="text-lg font-semibold">{suspend ? "Suspend" : "Reactivate"} {display(a)}?</h2>
        <p className="text-sm text-muted-foreground">
          {suspend
            ? `${a.email} won't be able to use Overload, starting with their next request, even if they're signed in now. Nothing in the account is deleted, and you can reactivate it any time.`
            : `${a.email} will be able to sign in and use Overload again, with everything as they left it.`}
        </p>
        <p className="text-sm text-muted-foreground">This is recorded in the audit log.</p>
        {failed && <Alert>Couldn&apos;t change the account. Nothing changed. Try again.</Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={pending}>Cancel</Button>
          <Button variant={suspend ? "destructive" : "default"} disabled={pending}>
            {pending ? (suspend ? "Suspending…" : "Reactivating…") : suspend ? "Suspend" : "Reactivate"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Toast({ children }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 w-[min(22rem,90%)] -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-sm shadow-lg">
      <div className="flex items-center gap-2"><CircleCheck aria-hidden className="size-4" />{children}</div>
    </div>
  );
}

/* ─────────────────────────── Screen 7 + 8: feedback ─────────────────────────── */

function Inbox({ desktop, state }) {
  const view = state === "handled" ? "Handled" : "Open";
  let rows = state === "handled" ? FEEDBACK.filter((f) => f.handled) : FEEDBACK.filter((f) => !f.handled);
  if (state === "empty" || state === "filtered-empty") rows = [];
  return (
    <AdminShell desktop={desktop} active="feedback">
      <section className={cx("space-y-4", desktop && "max-w-3xl")}>
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Feedback</h1>
          <span className="text-sm text-muted-foreground tabular-nums">{state === "empty" ? "0 open" : "3 open"}</span>
        </div>
        <div className={cx("flex gap-3", desktop ? "items-center justify-between" : "flex-col")}>
          <div className="inline-flex rounded-md bg-muted p-1">
            {["Open", "Handled", "All"].map((v) => (
              <a key={v} aria-current={v === view ? "page" : undefined} className={cx("rounded-sm px-3 py-1.5 text-sm", v === view ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{v}</a>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Category</span>
            <select defaultValue={state === "filtered-empty" ? "Other" : "All"} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {["All categories", "Bug", "Idea", "Question", "Other"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {state === "loading" ? (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="space-y-2 p-3"><Sk className="h-5 w-24" /><Sk className="h-4 w-full" /><Sk className="h-4 w-2/3" /><Sk className="h-3 w-28" /></div>)}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm">
            {state === "filtered-empty" ? <p>No feedback matches this filter. <Button variant="link" className="h-auto">Clear filters</Button></p> : <p>No feedback yet.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((f) => {
              const s = acct(f.from);
              return (
                <li key={f.id}>
                  <a className="flex min-h-16 gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                        <Badge>{f.category}</Badge>
                        <span>{f.date}</span>
                        {f.handled && <span className="inline-flex items-center gap-1"><Check aria-hidden className="size-3.5" />Handled · {f.handled}</span>}
                        {desktop && <span className="ml-auto">{s.name || `No name · ${s.email}`}</span>}
                      </div>
                      <p className={cx("line-clamp-2 text-sm", f.handled && "text-muted-foreground")}>{f.message}</p>
                      {!desktop && <p className="text-xs text-muted-foreground">{s.name || `No name · ${s.email}`}</p>}
                    </div>
                    <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}

function FeedbackItem({ desktop, state }) {
  const f = FEEDBACK[0];
  const s = acct(f.from);
  const handled = state === "handled";
  return (
    <AdminShell desktop={desktop} active="feedback">
      <section className={cx("space-y-5", desktop && "max-w-2xl")}>
        <a className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft aria-hidden className="size-4" /> Feedback</a>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Badge>{f.category}</Badge> Sent {f.full}
        </div>
        <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-4 text-sm">{f.message}</p>
        <dl className="space-y-3 text-sm">
          <div className="grid grid-cols-[5.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">From</dt>
            <dd className="space-y-0.5">
              <div>{s.name}</div>
              <div className="text-muted-foreground">@{s.username} · {s.email}</div>
              <a className="inline-flex items-center gap-1 text-primary">View account <ChevronRight aria-hidden className="size-4" /></a>
            </dd>
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] items-start gap-2">
            <dt className="pt-2 text-muted-foreground">Category</dt>
            <dd className="space-y-2">
              <div className="flex gap-2">
                <select defaultValue="Bug" aria-label="Category" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {["Bug", "Idea", "Question", "Other"].map((c) => <option key={c}>{c}</option>)}
                </select>
                <Button variant="outline" disabled={state !== "save-failed"}>Save</Button>
              </div>
              {state === "save-failed" && <Alert>Couldn&apos;t save. Nothing changed.</Alert>}
            </dd>
          </div>
        </dl>
        <section className="space-y-2 rounded-lg border border-border p-4">
          {handled ? (
            <>
              <p className="inline-flex items-center gap-1.5 text-sm"><Check aria-hidden className="size-4" />Handled Oct 22 by {ADMIN.name}</p>
              <div><Button variant="outline">Reopen</Button></div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Open</p>
              <Button size={desktop ? "default" : "lg"}>Mark handled</Button>
            </>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="text-base font-semibold">History</h2>
          <ul className="divide-y divide-border text-sm tabular-nums">
            <li className="grid grid-cols-[8.5rem_1fr] gap-2 py-2"><span className="text-muted-foreground">Oct 21 · 8:40 AM</span><span>Sent</span></li>
            <li className="grid grid-cols-[8.5rem_1fr] gap-2 py-2"><span className="text-muted-foreground">Oct 21 · 3:02 PM</span><span>Category Idea → Bug · by {ADMIN.name}</span></li>
            {handled && <li className="grid grid-cols-[8.5rem_1fr] gap-2 py-2"><span className="text-muted-foreground">Oct 22 · 9:15 AM</span><span>Marked handled · by {ADMIN.name}</span></li>}
          </ul>
        </section>
      </section>
    </AdminShell>
  );
}

/* ─────────────────────────── Screen 9: audit ─────────────────────────── */

function Audit({ desktop, state }) {
  const rows = state === "empty" ? [] : AUDIT;
  return (
    <AdminShell desktop={desktop} active="audit">
      <section className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Audit log</h1>
          <p className="text-sm text-muted-foreground">Every admin action, newest first. Nothing here can be edited.</p>
        </header>
        {state === "loading" ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Sk key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm">No admin actions yet.</p>
        ) : desktop ? (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">{["When", "Admin", "Action", "Account"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground tabular-nums">{l.when}</td>
                    <td className="px-3 py-2.5">{ADMIN.name}</td>
                    <td className="px-3 py-2.5">{l.action}{l.feedback && <> · <a className="text-primary">View feedback</a></>}</td>
                    <td className="px-3 py-2.5"><a className="text-primary">{display(acct(l.account))}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((l, i) => (
              <li key={i} className="space-y-1 px-3 py-3 text-sm">
                <div className="text-xs text-muted-foreground tabular-nums">{l.when}</div>
                <p>
                  {ADMIN.name} {l.action} · <a className="text-primary">{display(acct(l.account))}</a>
                  {l.feedback && <> · <a className="text-primary">View feedback</a></>}
                </p>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && state !== "loading" && <div className="flex justify-end"><Button variant="outline" size="sm">Older <ChevronRight aria-hidden className="size-4" /></Button></div>}
      </section>
    </AdminShell>
  );
}

/* ─────────────────────────── Screen 10: send feedback ─────────────────────────── */

function SendFeedback({ desktop, state }) {
  if (state === "success") {
    return (
      <LifterShell desktop={desktop}>
        <section className="space-y-4">
          <h1 tabIndex={-1} className="inline-flex items-center gap-2 text-xl font-semibold"><CircleCheck aria-hidden className="size-5" />Sent. Thanks for telling us.</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">Send something else</Button>
            <Button variant="ghost">Back to Today</Button>
          </div>
        </section>
      </LifterShell>
    );
  }
  const invalid = state === "validation";
  const draft = state === "error" || state === "limit" || state === "sending" ? "The set entry jumps when I tap reps on the second set." : "";
  const picked = draft ? "Bug" : null;
  return (
    <LifterShell desktop={desktop}>
      <section className="space-y-6 pb-24">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Send feedback</h1>
          <p className="text-sm text-muted-foreground">Goes straight to the person who runs Overload. Replies aren&apos;t sent in the app.</p>
        </header>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What is it?</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {["Bug", "Idea", "Question", "Other"].map((c) => (
              <label key={c} className={cx("flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm", c === picked ? "border-primary bg-primary/5" : "border-border")}>
                <span className={cx("grid size-4 place-items-center rounded-full border", c === picked ? "border-primary" : "border-input")}>{c === picked && <span className="size-2 rounded-full bg-primary" />}</span>
                {c}
              </label>
            ))}
          </div>
          {invalid && <p className="text-sm text-destructive">Choose what it&apos;s about.</p>}
        </fieldset>
        <div className="space-y-2">
          <label htmlFor="fb-msg" className="text-sm font-medium">Message</label>
          <textarea id="fb-msg" rows={6} defaultValue={draft} aria-invalid={invalid || undefined} className={cx("w-full rounded-md border bg-background px-3 py-2 text-sm", invalid ? "border-destructive" : "border-input")} />
          <div className="flex justify-between text-xs">
            <span className="text-destructive">{invalid ? "Write a message." : ""}</span>
            <span className="text-muted-foreground tabular-nums">{draft.length} / 2000</span>
          </div>
        </div>
        {state === "error" && <Alert>Couldn&apos;t send. Your message is still here. Try again.</Alert>}
        {state === "limit" && <Alert>You&apos;ve sent a lot of feedback today. Try again tomorrow.</Alert>}
      </section>
      <div className={cx(desktop ? "flex justify-end" : "absolute inset-x-0 bottom-0 border-t border-border bg-background/95 p-3")}>
        <Button size="lg" className={desktop ? "" : "w-full"} disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send"}</Button>
      </div>
    </LifterShell>
  );
}

/* ─────────────────────────── Screen 11, not-found, deferred ─────────────────────────── */

function Suspended() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4 text-foreground">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="text-center font-semibold">Overload</p>
        <h1 className="text-lg font-semibold">Your account is suspended</h1>
        <p className="text-sm text-muted-foreground">You can&apos;t use Overload while it&apos;s suspended. Nothing in your account has been deleted.</p>
        <p className="text-sm text-muted-foreground">If you think this is a mistake, contact the person who runs Overload.</p>
        <Button variant="outline" className="w-full">Sign out</Button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <p className="font-medium">We couldn&apos;t find that page.</p>
      <a className="text-sm text-primary">Back to Today</a>
      <p className="mt-6 max-w-xs text-xs text-muted-foreground">(Existing root not-found, unchanged. Every /admin URL renders exactly this for a non-admin — same text, status 404, no "Admin" in the title.)</p>
    </div>
  );
}

function DeferredDelete() {
  return (
    <div className="space-y-4 bg-background p-6 text-foreground">
      <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        DEFERRED — not built in this run. Admin deletion is halted pending the deletion-contract amendment (design doc Screen 12). Drawn only so the resumed work has a contract.
      </p>
      <section className="max-w-2xl space-y-2 border-t border-border pt-6">
        <h2 className="text-base font-semibold">Delete account</h2>
        <p className="text-sm text-muted-foreground">Permanently deletes this account and all of its training history.</p>
        <Button variant="destructiveOutline">Delete account…</Button>
      </section>
      <div role="alertdialog" className="max-w-md space-y-4 rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Delete Maya Chen&apos;s account?</h2>
        <p className="text-sm text-muted-foreground">This permanently deletes maya@example.com&apos;s account and all of its training history. It can&apos;t be undone.</p>
        <label className="block space-y-1 text-sm">
          <span>Type the email to confirm</span>
          <input className="h-11 w-full rounded-md border border-input bg-background px-3" />
        </label>
        <div className="flex justify-end gap-2"><Button variant="outline">Cancel</Button><Button variant="destructive" disabled>Delete account</Button></div>
      </div>
    </div>
  );
}

/* ─────────────────────────── preview chrome ─────────────────────────── */

const SCREENS = {
  entry: { label: "1 · Entry points", states: ["default"], render: () => <EntryPoints /> },
  overview: { label: "3 · Overview", states: ["populated", "loading", "error"], render: (p) => <Overview {...p} /> },
  accounts: { label: "4 · Accounts", states: ["populated", "suspended-filter", "no-match", "emails-unavailable", "loading", "error"], render: (p) => <Accounts {...p} /> },
  account: {
    label: "5–6 · Account page + dialogs",
    states: ["suspended", "active", "admin-protected", "loading", "dialog-suspend", "dialog-reactivate", "dialog-pending", "dialog-failed", "toast-suspended"],
    render: (p) =>
      p.state === "toast-suspended" ? (
        <div className="relative min-h-full"><AccountPage {...p} state="suspended" /><Toast>Jordan Lee is suspended.</Toast></div>
      ) : (
        <AccountPage {...p} />
      ),
  },
  inbox: { label: "7 · Feedback inbox", states: ["open", "handled", "empty", "filtered-empty", "loading"], render: (p) => <Inbox {...p} /> },
  item: { label: "8 · Feedback item", states: ["open", "handled", "save-failed"], render: (p) => <FeedbackItem {...p} /> },
  audit: { label: "9 · Audit log", states: ["populated", "empty", "loading"], render: (p) => <Audit {...p} /> },
  feedback: { label: "10 · Send feedback (lifter)", states: ["empty", "validation", "sending", "error", "limit", "success"], render: (p) => <SendFeedback {...p} /> },
  suspended: { label: "11 · Suspended (lifter)", states: ["default"], render: () => <Suspended /> },
  notfound: { label: "Non-admin on /admin", states: ["default"], render: () => <NotFound /> },
  deferred: { label: "12 · Deferred: admin delete", states: ["default"], render: () => <DeferredDelete /> },
};

export default function AdminCenterFeedbackPreview() {
  const [screen, setScreen] = React.useState("overview");
  const [state, setState] = React.useState("populated");
  const [desktop, setDesktop] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  const def = SCREENS[screen];
  const current = def.states.includes(state) ? state : def.states[0];
  return (
    <div className="min-h-screen bg-neutral-200 p-4 font-sans text-neutral-900">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <strong>Overload · Admin Center &amp; Feedback — preview</strong>
        <select value={screen} onChange={(e) => { setScreen(e.target.value); setState(SCREENS[e.target.value].states[0]); }} className="rounded border px-2 py-1">
          {Object.entries(SCREENS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={current} onChange={(e) => setState(e.target.value)} className="rounded border px-2 py-1">
          {def.states.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button onClick={() => setDesktop((d) => !d)} className="rounded border px-2 py-1">{desktop ? "Desktop 1280" : "Phone 375"}</button>
        <button onClick={() => setDark((d) => !d)} className="rounded border px-2 py-1">{dark ? "Dark" : "Light"}</button>
        <span className="text-neutral-500">Rendering of the design, not product code.</span>
      </div>
      <div className={cx(dark && "dark")}>
        <div className={cx("relative mx-auto overflow-hidden rounded-xl border border-neutral-300 bg-background text-foreground", desktop ? "h-[820px] w-[1280px]" : "h-[812px] w-[375px]")}>
          <div className="h-full overflow-y-auto">{def.render({ desktop, state: current })}</div>
        </div>
      </div>
    </div>
  );
}
