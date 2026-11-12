import { difficultyOf, hashSeed, isClassic, type DoneState } from "./filters";
import type { ProviderId } from "./provider";
import type { GradeEvidence } from "./outside";
import { parseStamp as at } from "./days";
import type { Climb, LogEntry, StatsAt } from "./types";

/** One board's climbs, with what is known about them at the angle the user views that board. */
export interface BoardCandidates {
  /** The board's id, unique across providers. */
  key: string;
  name: string;
  provider: ProviderId;
  climbs: Climb[];
  /** Community stats at the viewed angle. Climbs without a stat are projects and are never suggested. */
  stats: StatsAt;
  done: (uuid: string) => DoneState;
  blocked: (uuid: string) => boolean;
  liked: (uuid: string) => boolean;
  /** This board's difficulty number to the shared grade scale (V plus a fraction). */
  gradeOf: (difficulty: number) => number;
  /** The angle these stats and `done` are for, when the board was loaded at a particular one. */
  angle?: number;
  /**
   * False for a board with no server (a MoonBoard): its climbs have no community send counts or ratings, only a grade, so they are
   * ranked on benchmark status and likes and are not held to the send and rating minimums. Default true.
   */
  community?: boolean;
}

/** Which set of boards a suggestion came from: as the user views them, or at the angle of their main or opposite style. */
export type SuggestSet = "base" | "foryou" | "anti";

/** Boards loaded at the angle of one wall category, for the "For you" and "Antistyle" groups. */
export interface StyleSet {
  /** The category, lower case, for the blurb: "slab". */
  label: string;
  boards: BoardCandidates[];
  /** The grade to aim at in this category on the shared scale, or null to use the working grade. */
  aim: number | null;
}

export interface Suggestion {
  climb: Climb;
  boardKey: string;
  boardName: string;
  provider: ProviderId;
  /** The provider's own difficulty number, for showing the grade in its notation. */
  difficulty: number;
  /** Shared-scale grade. */
  grade: number;
  /** Why it is suggested, one short line. */
  reason: string;
  set: SuggestSet;
  /** The angle it is suggested at, when known. */
  angle: number | null;
}

export interface SuggestGroup {
  key: "unfinished" | "warmup" | "range" | "foryou" | "push" | "anti" | "start";
  title: string;
  blurb: string;
  items: Suggestion[];
}

export interface SuggestInput {
  boards: BoardCandidates[];
  /** Everything the user has logged, on any provider. */
  logbook: LogEntry[];
  /** A logged entry's grade on the shared scale. */
  logGrade: (e: LogEntry) => number;
  now: Date;
  /** Changes the day's shuffle between otherwise equal climbs. */
  seed?: number;
  /** Sends logged off the boards, already offset (see `outsideEvidence`), counted with the logbook when working out your level. */
  extraGrades?: GradeEvidence[];
  /** Climbs in the wall category you climb most, and in the one at the opposite end. Left out when your style isn't known yet. */
  forYou?: StyleSet | null;
  anti?: StyleSet | null;
}

/** Sends from the last 90 days are what "your grade" is measured from. */
const RECENT_DAYS = 90;
const MIN_SENDS_KNOWN = 5;
export const MIN_SENDS_FOR_GRADE = 3;
const PER_GROUP = { unfinished: 5, warmup: 5, range: 8, foryou: 6, push: 5, anti: 6, start: 8 } as const;
/** "A bit ahead": up to one V grade past the hardest recent send. */
export const PUSH_REACH = 1;

/**
 * The V grade you are climbing at: the average of your three hardest graded sends in the last 90 days, falling back to all
 * time, measured on the shared scale across every provider. null with too few graded sends.
 */
export function workingGrade(logbook: LogEntry[], now: Date, logGrade: (e: LogEntry) => number, extra: GradeEvidence[] = []): number | null {
  const use = gradePool(logbook, now, logGrade, extra);
  if (!use) return null;
  const top = use.map((g) => g.grade).sort((a, b) => b - a).slice(0, 3);
  return top.reduce((a, b) => a + b, 0) / top.length;
}

/** The hardest graded send from the last 90 days (all time when there are too few), on the shared scale; null with too few graded sends. */
export function hardestGrade(logbook: LogEntry[], now: Date, logGrade: (e: LogEntry) => number, extra: GradeEvidence[] = []): number | null {
  const use = gradePool(logbook, now, logGrade, extra);
  return use ? Math.max(...use.map((g) => g.grade)) : null;
}

/** The graded sends your level is measured from: recent ones when there are enough, else all; null with too few. */
function gradePool(logbook: LogEntry[], now: Date, logGrade: (e: LogEntry) => number, extra: GradeEvidence[]): GradeEvidence[] | null {
  const graded: GradeEvidence[] = [...logbook.filter((e) => e.isSend && e.difficulty > 0).map((e) => ({ grade: logGrade(e), climbedAt: e.climbedAt })), ...extra];
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const pool = graded.filter((e) => at(e.climbedAt).getTime() >= since);
  const use = pool.length >= MIN_SENDS_FOR_GRADE ? pool : graded;
  return use.length < MIN_SENDS_FOR_GRADE ? null : use;
}

/**
 * Picks climbs for today from your own history, across all your boards: unfinished business, a warm-up, climbs at your grade,
 * climbs in the wall angle you climb most ("For you"), a push a little past your hardest send, and the opposite angle
 * ("Antistyle"), aimed a notch lower since it is the one you do least. Your grade comes from every send on every provider and
 * from sends logged off the boards; each candidate is graded through its own provider. Only climbs with enough community sends
 * and a good rating are offered, and what you have sent at that board's angle is left out. A climb appears in one group only.
 * No single board fills a group when you have several. With too few graded sends to know your grade it offers well-loved easier
 * climbs instead.
 */
export function suggest(inp: SuggestInput): SuggestGroup[] {
  const day = Math.floor(inp.now.getTime() / 86_400_000);
  const seed = (inp.seed ?? 0) + day;
  const extra = inp.extraGrades ?? [];
  const w = workingGrade(inp.logbook, inp.now, inp.logGrade, extra);
  const hi = hardestGrade(inp.logbook, inp.now, inp.logGrade, extra);
  const v = w == null ? null : Math.floor(w);
  const multi = inp.boards.length > 1;

  interface Cand { b: BoardCandidates; climb: Climb; difficulty: number; grade: number; v: number; score: number; done: DoneState; set: SuggestSet }
  const candidatesOf = (boards: BoardCandidates[], set: SuggestSet): Cand[] => {
    const out: Cand[] = [];
    for (const b of boards) {
      for (const climb of b.climbs) {
        const s = b.stats.get(climb.uuid);
        if (!s || b.blocked(climb.uuid)) continue;
        const known = b.community !== false;
        if (known && (s[2] < MIN_SENDS_KNOWN || s[3] < 2.5)) continue;
        const difficulty = difficultyOf(s)!;
        const grade = b.gradeOf(difficulty);
        // Quality and popularity first, a nudge for classics and likes, a daily shuffle between near-equals. Without community data
        // a benchmark problem and a liked one lead, and the shuffle does the rest.
        const score = (known ? s[3] * Math.log2(s[2] + 2) : 0) + (isClassic(s) ? (known ? 1.5 : 2.5) : 0) + (b.liked(climb.uuid) ? 1 : 0) + hashSeed(seed, b.key + climb.uuid) * (known ? 0.8 : 1.5);
        out.push({ b, climb, difficulty, grade, v: Math.floor(grade), score, done: b.done(climb.uuid), set });
      }
    }
    return out;
  };
  const cands = candidatesOf(inp.boards, "base");

  const used = new Set<string>();
  const pick = (rows: Cand[], n: number, reason: (c: Cand) => string): Suggestion[] => {
    const cap = multi ? Math.ceil(n * 0.6) : n;
    const taken = new Map<string, number>();
    const out: Suggestion[] = [];
    for (const c of rows.sort((a, b) => b.score - a.score)) {
      if (out.length >= n) break;
      const id = `${c.b.key}:${c.climb.uuid}`;
      if (used.has(id)) continue;
      if ((taken.get(c.b.key) ?? 0) >= cap) continue;
      used.add(id);
      taken.set(c.b.key, (taken.get(c.b.key) ?? 0) + 1);
      out.push({ climb: c.climb, boardKey: c.b.key, boardName: c.b.name, provider: c.b.provider, difficulty: c.difficulty, grade: c.grade, reason: reason(c), set: c.set, angle: c.b.angle ?? null });
    }
    return out;
  };
  const stars = (c: Cand) => {
    const s = c.b.stats.get(c.climb.uuid)!;
    return c.b.community === false ? (isClassic(s) ? "Benchmark problem" : "Problem") : `${s[3].toFixed(1)} stars, ${s[2]} sends`;
  };
  const withAngle = (c: Cand) => (c.b.angle != null && c.set !== "base" ? `${c.b.angle}\u00B0. ${stars(c)}` : stars(c));

  const groups: SuggestGroup[] = [];
  const push = (g: SuggestGroup) => { if (g.items.length) groups.push(g); };
  const fresh = cands.filter((c) => c.done !== "sent");

  if (v == null || hi == null) {
    push({ key: "start", title: "Good places to start", blurb: "Log a few graded sends and these will follow your grade.", items: pick(fresh.filter((c) => c.v >= 1 && c.v <= 3), PER_GROUP.start, stars) });
    return groups;
  }

  const unfinished = cands.filter((c) => c.done === "tried" && c.v <= v + 1);
  push({ key: "unfinished", title: "Finish these", blurb: "You tried them at this angle and have not sent them.", items: pick(unfinished, PER_GROUP.unfinished, (c) => `Tried, not sent. ${stars(c)}`) });
  const tried = new Set(unfinished.map((c) => `${c.b.key}:${c.climb.uuid}`));
  const rest = fresh.filter((c) => !tried.has(`${c.b.key}:${c.climb.uuid}`));
  push({ key: "warmup", title: "Warm up", blurb: `A grade or two under your V${v}.`, items: pick(rest.filter((c) => c.v >= v - 2 && c.v < v), PER_GROUP.warmup, stars) });
  push({ key: "range", title: `In your range, V${v}`, blurb: "Well rated climbs at your working grade.", items: pick(rest.filter((c) => c.v === v), PER_GROUP.range, stars) });

  // The two style groups look at the same boards at another angle, so their candidates come from their own sets.
  const styled = (set: StyleSet, which: SuggestSet, aim: number) => {
    const target = Math.max(0, Math.floor(aim));
    return candidatesOf(set.boards, which).filter((c) => c.done !== "sent" && (c.v === target || c.v === target - 1));
  };
  if (inp.forYou && inp.forYou.boards.length) {
    push({
      key: "foryou", title: "For you", blurb: `${inp.forYou.label[0].toUpperCase()}${inp.forYou.label.slice(1)} climbs around your level: the angle you send most.`,
      items: pick(styled(inp.forYou, "foryou", inp.forYou.aim ?? w!), PER_GROUP.foryou, withAngle),
    });
  }
  push({
    key: "push", title: "Push", blurb: `A little past your hardest send, V${Math.floor(hi)}.`,
    items: pick(rest.filter((c) => c.grade > hi && c.grade <= hi + PUSH_REACH), PER_GROUP.push, (c) => `V${c.v}, past your best. ${stars(c)}`),
  });
  if (inp.anti && inp.anti.boards.length) {
    push({
      key: "anti", title: "Antistyle", blurb: `${inp.anti.label[0].toUpperCase()}${inp.anti.label.slice(1)}, the opposite of how you usually climb, a notch easier.`,
      items: pick(styled(inp.anti, "anti", inp.anti.aim ?? w! - 1), PER_GROUP.anti, withAngle),
    });
  }
  return groups;
}
