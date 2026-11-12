import { compareText } from "./collate";
import type { GradeScale } from "./grades";
import { isRoute, type AngleStat, type Climb, type StatsAt } from "./types";

export type Sort = "best" | "newest" | "oldest" | "hardest" | "easiest" | "most_repeats" | "least_repeats" | "random";

export interface ClimbFilter {
  search: string;
  /** V grade bounds, inclusive. null = open on that side; both null = any grade. */
  gradeMin: number | null;
  gradeMax: number | null;
  /** Logbook: which climbs to show, by what you have done with them at the viewed angle. All on = everything. */
  showSent: boolean;
  showTried: boolean;
  showUntried: boolean;
  /** Climbs the community has graded at the viewed angle (the opposite of an open project). */
  established: boolean;
  /** Your own unpublished drafts for this layout. */
  drafts: boolean;
  classic: boolean;
  liked: boolean;
  projects: boolean;
  blocked: boolean;
  /** Show boulders / routes. Both on = everything. */
  boulders: boolean;
  routes: boolean;
  /** Climbs that cover most of the board's height. */
  tall: boolean;
  /** Climbs that stay on one half of the board. */
  side: boolean;
  /** Only climbs with a beta video. */
  beta: boolean;
  /** Exact setter username, or null for anyone. */
  setter: string | null;
  /** Circuit uuids: in any of these / in all of these / in none of these. */
  circuitsAny: string[];
  circuitsAll: string[];
  circuitsNone: string[];
  sort: Sort;
}

export const DEFAULT_FILTER: ClimbFilter = {
  search: "",
  gradeMin: null,
  gradeMax: null,
  showSent: true,
  showTried: true,
  showUntried: true,
  established: true,
  drafts: true,
  classic: false,
  liked: false,
  projects: true,
  blocked: false,
  boulders: true,
  routes: true,
  tall: false,
  side: false,
  beta: false,
  setter: null,
  circuitsAny: [],
  circuitsAll: [],
  circuitsNone: [],
  sort: "best",
};

/** On a local provider the numbers behind the sorts are the user's own (their ratings and sends), so the labels say so. */
export const sortLabel = (s: Sort, local: boolean): string =>
  local ? ({ best: "Your best", most_repeats: "Most sent" } as Partial<Record<Sort, string>>)[s] ?? SORT_LABELS[s] : SORT_LABELS[s];

export const SORT_LABELS: Record<Sort, string> = {
  best: "Best",
  newest: "Newest",
  oldest: "Oldest",
  hardest: "Hardest",
  easiest: "Easiest",
  most_repeats: "Most repeats",
  least_repeats: "Least repeats",
  random: "Random",
};

/** What the user has done with a climb at the viewed angle. */
export type DoneState = "sent" | "tried" | undefined;

export interface FilterContext {
  /** Stats at the viewed angle; climbs without an entry are projects. */
  stats: StatsAt;
  grades: GradeScale;
  /** What the user has done with this climb at the viewed angle. */
  done: (uuid: string) => DoneState;
  liked: (uuid: string) => boolean;
  blocked: (uuid: string) => boolean;
  /** Your own unpublished climbs. They have no community stats, so grade and status rules do not apply to them. */
  isDraft: (uuid: string) => boolean;
  hasBeta: (uuid: string) => boolean;
  /** Climb uuids in each circuit, keyed by circuit uuid. */
  circuits: Map<string, Set<string>>;
  /** The board's size, to judge tall and side climbs. */
  board: { left: number; right: number; bottom: number; top: number };
  /** Stable seed for Random sort so the list doesn't reshuffle on each render. */
  seed: number;
}

/** Classic climbs show their benchmark grade; everything else the community average. */
export const difficultyOf = (s: AngleStat | undefined): number | null => (s ? (s[1] ?? s[0]) : null);
export const isClassic = (s: AngleStat | undefined) => s?.[1] != null;

/** Tall: the holes span at least 70% of the board's height. */
export const TALL_SHARE = 0.7;
export function isTall(c: Climb, b: FilterContext["board"]): boolean {
  return (c.top - c.bottom) >= TALL_SHARE * (b.top - b.bottom);
}
/** Side: every hole is on one half of the board. */
export function isSide(c: Climb, b: FilterContext["board"]): boolean {
  const mid = (b.left + b.right) / 2;
  return c.right <= mid || c.left >= mid;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: number, s: string): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return mulberry32(h)();
}

export function applyFilter(all: Climb[], f: ClimbFilter, ctx: FilterContext): Climb[] {
  const q = f.search.trim().toLowerCase();
  const ranged = f.gradeMin != null || f.gradeMax != null;
  const lo = f.gradeMin ?? -Infinity;
  const hi = f.gradeMax ?? Infinity;

  const out = all.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q) && !c.setter.toLowerCase().includes(q)) return false;
    const stat = ctx.stats.get(c.uuid);
    const draft = ctx.isDraft(c.uuid);
    if (draft ? !f.drafts || ranged || f.classic : stat ? !f.established : !f.projects || ranged || f.classic) return false;
    if (ranged) {
      const v = ctx.grades.vNumber(difficultyOf(stat)!);
      if (v < lo || v > hi) return false;
    }
    if (f.classic && !isClassic(stat)) return false;
    if (!f.boulders && !isRoute(c)) return false;
    if (!f.routes && isRoute(c)) return false;
    if (f.setter && c.setter !== f.setter) return false;
    if (f.tall && !isTall(c, ctx.board)) return false;
    if (f.side && !isSide(c, ctx.board)) return false;
    if (f.beta && !ctx.hasBeta(c.uuid)) return false;
    if (f.circuitsAny.length && !f.circuitsAny.some((id) => ctx.circuits.get(id)?.has(c.uuid))) return false;
    if (f.circuitsAll.length && !f.circuitsAll.every((id) => ctx.circuits.get(id)?.has(c.uuid))) return false;
    if (f.circuitsNone.some((id) => ctx.circuits.get(id)?.has(c.uuid))) return false;
    if (f.liked && !ctx.liked(c.uuid)) return false;
    if (!f.blocked && ctx.blocked(c.uuid)) return false;
    const d = ctx.done(c.uuid);
    if (d === "sent" ? !f.showSent : d === "tried" ? !f.showTried : !f.showUntried) return false;
    return true;
  });

  // Sort keys are computed once per climb (not per comparison): 4000+ climbs sorted on every
  // filter tap must stay cheap. Ascending key order; projects (no stat) always sink to the bottom.
  const keyOf: Record<Sort, (c: Climb) => number> = {
    best: (c) => -(stat(c, 3) * Math.log2(stat(c, 2) + 2)),
    newest: (c) => -Date.parse(c.createdAt.replace(" ", "T") + "Z"),
    oldest: (c) => Date.parse(c.createdAt.replace(" ", "T") + "Z"),
    hardest: (c) => -(difficultyOf(ctx.stats.get(c.uuid)) ?? 0),
    easiest: (c) => difficultyOf(ctx.stats.get(c.uuid)) ?? 0,
    most_repeats: (c) => -stat(c, 2),
    least_repeats: (c) => stat(c, 2),
    random: (c) => hashSeed(ctx.seed, c.uuid),
  };
  function stat(c: Climb, i: 2 | 3): number {
    return ctx.stats.get(c.uuid)?.[i] ?? 0;
  }
  const key = keyOf[f.sort];
  const rows = out.map((c) => ({ c, project: !ctx.stats.has(c.uuid), k: key(c) }));
  rows.sort((a, b) =>
    a.project !== b.project ? (a.project ? 1 : -1) : a.project ? compareText(a.c.name, b.c.name) : a.k - b.k,
  );
  return rows.map((r) => r.c);
}

export interface FilterChip {
  key: keyof ClimbFilter | "grade";
  label: string;
}

/** "V3", "V2 to V4", "V5 and up", "V2 and easier". */
export function describeRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return min === max ? `V${min}` : `V${min} to V${max}`;
  if (min != null) return `V${min} and up`;
  if (max != null) return `V${max} and easier`;
  return "Any grade";
}

/** One removable chip per active filter. Sort and search are not filters. */
export function activeChips(f: ClimbFilter): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.gradeMin != null || f.gradeMax != null) chips.push({ key: "grade", label: describeRange(f.gradeMin, f.gradeMax) });
  if (!f.showSent) chips.push({ key: "showSent", label: "Hiding sent" });
  if (!f.showTried) chips.push({ key: "showTried", label: "Hiding attempted" });
  if (!f.showUntried) chips.push({ key: "showUntried", label: "Hiding not tried" });
  if (!f.established) chips.push({ key: "established", label: "No established" });
  if (!f.drafts) chips.push({ key: "drafts", label: "No drafts" });
  if (f.classic) chips.push({ key: "classic", label: "Classic only" });
  if (!f.boulders) chips.push({ key: "boulders", label: "Routes only" });
  if (!f.routes) chips.push({ key: "routes", label: "Boulders only" });
  if (f.tall) chips.push({ key: "tall", label: "Tall" });
  if (f.side) chips.push({ key: "side", label: "Side" });
  if (f.beta) chips.push({ key: "beta", label: "Has beta" });
  if (f.setter) chips.push({ key: "setter", label: `Set by ${f.setter}` });
  const circuitCount = f.circuitsAny.length + f.circuitsAll.length + f.circuitsNone.length;
  if (circuitCount) chips.push({ key: "circuitsAny", label: circuitCount === 1 ? "1 circuit rule" : `${circuitCount} circuit rules` });
  if (f.liked) chips.push({ key: "liked", label: "Liked" });
  if (!f.projects) chips.push({ key: "projects", label: "No projects" });
  if (f.blocked) chips.push({ key: "blocked", label: "Showing blocked" });
  return chips;
}

export function clearChip(f: ClimbFilter, key: FilterChip["key"]): ClimbFilter {
  if (key === "grade") return { ...f, gradeMin: null, gradeMax: null };
  if (key === "circuitsAny") return { ...f, circuitsAny: [], circuitsAll: [], circuitsNone: [] };
  return { ...f, [key]: DEFAULT_FILTER[key as keyof ClimbFilter] };
}
