/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the deterministic library
 * matcher. It maps the raw exercise NAME the model observed to one of the
 * account's real library exercises, or reports that the name is ambiguous or
 * unknown. The model NEVER chooses an exercise id (blueprint §3.5 / spec RD-2):
 * it only reports a string, and this code decides, over the real library, which
 * row (if any) that string is.
 *
 * The matching core is PURE — it takes a list of candidate `{ id, name }` rows
 * and a raw string and is fully offline-testable. The DB loader that fetches the
 * candidate rows (shared library + the account's own customs, through
 * `account.db`) lives in `./library.ts` so this file carries no Prisma.
 *
 * Algorithm (bounded, deterministic):
 *  1. Normalize both sides (lowercase, collapse whitespace, drop punctuation,
 *     expand a small explicit alias/abbreviation table).
 *  2. Exact normalized equality → matched (one row). Several exact ties → ambiguous.
 *  3. Otherwise a bounded token-overlap score; the single best above a threshold
 *     → matched; a cluster of near-equal bests → ambiguous (candidates); nothing
 *     above the floor → unknown.
 *
 * No fuzzy match ever silently wins over a human: an ambiguous cluster is shown
 * for the lifter to pick, and an unknown name offers "create custom" only on
 * explicit consent.
 */

export type LibraryCandidate = { id: string; name: string };

export type MatchOutcome =
  | { kind: "matched"; exerciseId: string; name: string }
  | {
      kind: "ambiguous";
      raw: string;
      candidates: { exerciseId: string; name: string }[];
    }
  | { kind: "unknown"; raw: string };

/**
 * Explicit abbreviation / synonym expansions applied during normalization. Kept
 * SMALL and conservative — this is not a thesaurus; it only unifies the few
 * forms a lifter plainly writes ("bb" for barbell, "ohp" for overhead press).
 * Every entry maps a token to its canonical token(s).
 */
const ALIASES: Record<string, string> = {
  bb: "barbell",
  db: "dumbbell",
  kb: "kettlebell",
  ohp: "overhead press",
  bp: "bench press",
  rdl: "romanian deadlift",
  dl: "deadlift",
  sldl: "stiff leg deadlift",
  "pull-up": "pullup",
  "pull-ups": "pullup",
  pullups: "pullup",
  "chin-up": "chinup",
  "chin-ups": "chinup",
  chinups: "chinup",
  "push-up": "pushup",
  "push-ups": "pushup",
  pushups: "pushup",
  lat: "lateral",
  "lat-raise": "lateral raise",
  "tri ": "tricep ",
  ext: "extension",
  curls: "curl",
  rows: "row",
  presses: "press",
  raises: "raise",
  extensions: "extension",
  squats: "squat",
};

/** Lowercase, split punctuation (incl. hyphens) to spaces, collapse whitespace. */
function basicNormalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A light, deterministic stem: fold common inflections so "pressing"→"press". */
function stem(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ing")) return token.slice(0, -3);
  if (token.endsWith("es")) return token.slice(0, -2);
  if (token.endsWith("ed")) return token.slice(0, -2);
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Normalize then expand aliases token-by-token; returns the token set+string. */
export function normalizeName(raw: string): { text: string; tokens: string[] } {
  const base = basicNormalize(raw);
  const tokens = base.length === 0 ? [] : base.split(" ");
  const expanded: string[] = [];
  for (const tok of tokens) {
    const alias = ALIASES[tok];
    if (alias) expanded.push(...alias.split(" "));
    else expanded.push(tok);
  }
  // Drop noise, then stem for matching (the display `text` keeps the un-stemmed
  // form so exact equality still reads naturally).
  const cleaned = expanded.filter((t) => t.length > 0);
  return { text: cleaned.join(" "), tokens: cleaned.map(stem) };
}

/**
 * A bounded similarity in [0,1] combining Jaccard overlap with a CONTAINMENT
 * signal: when every target token appears in the candidate (the raw name is a
 * subset of the library name, e.g. "Row" ⊂ "Barbell Row"), that is a strong
 * partial match even though Jaccard is low. We take the max of Jaccard and the
 * containment ratio (shared / target-size), so a generic raw name surfaces its
 * several library homes as candidates (→ ambiguous) rather than unknown.
 */
function similarity(target: Set<string>, candidate: Set<string>): number {
  if (target.size === 0 || candidate.size === 0) return 0;
  let inter = 0;
  for (const t of target) if (candidate.has(t)) inter++;
  const union = target.size + candidate.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  const containment = inter / target.size;
  return Math.max(jaccard, containment);
}

/** Scores above this are match candidates; the single clear best wins. */
const MATCH_FLOOR = 0.5;
/** Two candidates within this of each other are a tie → ambiguous. */
const TIE_MARGIN = 0.12;
/** At most this many candidates are offered for an ambiguous match. */
const MAX_CANDIDATES = 4;

/**
 * Match a raw exercise name against the account's candidate library rows. Pure:
 * the caller supplies the candidates (loaded through `account.db` in library.ts).
 */
export function matchExercise(
  raw: string,
  candidates: LibraryCandidate[],
): MatchOutcome {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "unknown", raw };

  const target = normalizeName(trimmed);
  const targetSet = new Set(target.tokens);
  if (targetSet.size === 0) return { kind: "unknown", raw };

  // 1) Exact normalized equality.
  const exact = candidates.filter(
    (c) => normalizeName(c.name).text === target.text,
  );
  if (exact.length === 1) {
    return { kind: "matched", exerciseId: exact[0].id, name: exact[0].name };
  }
  if (exact.length > 1) {
    return {
      kind: "ambiguous",
      raw,
      candidates: exact
        .slice(0, MAX_CANDIDATES)
        .map((c) => ({ exerciseId: c.id, name: c.name })),
    };
  }

  // 2) Bounded token-overlap scoring.
  const scored = candidates
    .map((c) => ({
      c,
      score: similarity(targetSet, new Set(normalizeName(c.name).tokens)),
    }))
    .filter((s) => s.score >= MATCH_FLOOR)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { kind: "unknown", raw };

  const best = scored[0].score;
  const topCluster = scored.filter((s) => best - s.score <= TIE_MARGIN);

  if (topCluster.length === 1) {
    return {
      kind: "matched",
      exerciseId: topCluster[0].c.id,
      name: topCluster[0].c.name,
    };
  }

  return {
    kind: "ambiguous",
    raw,
    candidates: topCluster
      .slice(0, MAX_CANDIDATES)
      .map((s) => ({ exerciseId: s.c.id, name: s.c.name })),
  };
}
