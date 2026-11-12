/**
 * Boulders climbed off the boards: gym-set problems and outdoor boulders. They are logged on the phone only, and exist to
 * tell the app how you climb at different wall angles, so adjustable boards can be suggested at an angle worth training.
 * Everything here is pure; storage is in outsideLocal.ts.
 */
import { hashSeed } from "./filters";
import type { GradeScale } from "./grades";
import { at } from "./stats";
import type { LogEntry } from "./types";

export type OutsideSetting = "gym" | "outdoor";
/** Flash is a send on the first try. An attempt is a try without a send. */
export type OutsideResult = "flash" | "send" | "attempt";
export type OutsideGradeSystem = "v" | "font";

export const SETTING_LABEL: Record<OutsideSetting, string> = { gym: "Gym", outdoor: "Outdoor" };
export const RESULT_LABEL: Record<OutsideResult, string> = { flash: "Flash", send: "Sent", attempt: "Attempts only" };

// ---------------------------------------------------------------------------------------------------------------------
// Wall angle categories

export type WallStyleId = "slab" | "vertical" | "slight" | "overhang" | "steep";

export interface WallStyle {
  id: WallStyleId;
  label: string;
  hint: string;
  /** A representative board angle in degrees past vertical (a slab is below 0). */
  angle: number;
}

export const WALL_STYLES: WallStyle[] = [
  { id: "slab", label: "Slab", hint: "Leans back, less than vertical", angle: -5 },
  { id: "vertical", label: "Vertical", hint: "Straight up, to about 5\u00B0", angle: 0 },
  { id: "slight", label: "Slight overhang", hint: "About 10 to 20\u00B0", angle: 15 },
  { id: "overhang", label: "Overhang", hint: "About 25 to 35\u00B0", angle: 30 },
  { id: "steep", label: "Steep or roof", hint: "40\u00B0 and over", angle: 45 },
];

export const wallStyle = (id: WallStyleId): WallStyle => WALL_STYLES.find((w) => w.id === id) ?? WALL_STYLES[1];

/** Which category a board angle (degrees past vertical) falls in. */
export function styleOfAngle(angle: number): WallStyleId {
  if (angle < 0) return "slab";
  if (angle <= 7) return "vertical";
  if (angle <= 22) return "slight";
  if (angle <= 37) return "overhang";
  return "steep";
}

/** Climb character, optional and any number of them. */
export const STYLE_TAGS = ["Crimpy", "Slopey", "Pinchy", "Juggy", "Pockets", "Compression", "Technical", "Powerful", "Dyno", "Mantle"] as const;

// ---------------------------------------------------------------------------------------------------------------------
// The log

export interface OutsideLog {
  id: string;
  setting: OutsideSetting;
  /** What the problem is called, or its colour or tag in a gym. Optional. */
  name: string;
  /** The gym, or the crag and area outdoors. */
  venue: string;
  /** A listing for the climb, such as a Mountain Project or theCrag page. Empty or an http(s) address. */
  link: string;
  wall: WallStyleId;
  gradeSystem: OutsideGradeSystem | null;
  /** The grade as the user picked it ("V4", "6b+"), or null when ungraded. */
  gradeLabel: string | null;
  /** The grade on the app's shared scale (V plus a fraction), or null. */
  grade: number | null;
  result: OutsideResult;
  attempts: number;
  tags: string[];
  note: string;
  /** `yyyy-MM-dd HH:mm:ss` in the device's local time. */
  climbedAt: string;
}

export interface OutsideDraft {
  setting: OutsideSetting;
  name: string;
  venue: string;
  link: string;
  wall: WallStyleId | null;
  gradeSystem: OutsideGradeSystem;
  gradeLabel: string | null;
  result: OutsideResult;
  attempts: number;
  tags: string[];
  note: string;
}

export const MAX_ATTEMPTS = 99;

/** The attempt count that goes with a result: a flash is one try, a send that took one try is a flash, nothing is below one. */
export function normaliseResult(result: OutsideResult, attempts: number): { result: OutsideResult; attempts: number } {
  const n = Math.max(1, Math.min(MAX_ATTEMPTS, Math.round(Number.isFinite(attempts) ? attempts : 1)));
  if (result === "flash") return { result, attempts: 1 };
  if (result === "send" && n === 1) return { result: "flash", attempts: 1 };
  return { result, attempts: n };
}

/** Trims a link and accepts only http(s) addresses; a bare `mountainproject.com/...` gets https. null when it isn't a usable address. */
export function cleanLink(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[a-z][a-z0-9+.-]*:/i.test(t) ? "" : `https://${t}`;
  if (!withScheme) return null;
  return /^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(withScheme) ? withScheme : null;
}

/** What is wrong with a draft, or null when it can be saved. A send needs a grade, since the grade is what the log is for. */
export function draftProblem(d: OutsideDraft): string | null {
  if (!d.wall) return "Pick the wall angle.";
  if (d.result !== "attempt" && !d.gradeLabel) return "Pick the grade so the send counts toward your levels.";
  if (cleanLink(d.link) === null) return "That link doesn't look like a web address.";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Grades

export interface GradeOption {
  label: string;
  /** A difficulty on the app's scale, whose shared-scale value stands for this grade. */
  difficulty: number;
}

/**
 * The grades a system offers, easiest first, taken from the app's grade table so V and Font stay in step with the boards. A grade
 * that covers several rows of the table (V0 spans three Font grades) is placed at the first of them.
 */
export function gradeOptions(scale: GradeScale, system: OutsideGradeSystem): GradeOption[] {
  const seen = new Set<string>();
  const out: GradeOption[] = [];
  for (const row of scale.rows) {
    const [font, v] = row.boulder_name.split("/");
    const label = system === "v" ? v : font;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, difficulty: row.difficulty });
  }
  return out;
}

/** A grade label to the shared scale (V plus a fraction), or null for one the system doesn't have. */
export function sharedGrade(scale: GradeScale, system: OutsideGradeSystem, label: string): number | null {
  const hit = gradeOptions(scale, system).find((g) => g.label === label);
  return hit ? scale.toCommon(hit.difficulty) : null;
}

/** Builds the stored log from a form draft. Throws when the draft has a problem, so callers check `draftProblem` first. */
export function makeOutsideLog(d: OutsideDraft, scale: GradeScale, id: string, climbedAt: string): OutsideLog {
  const problem = draftProblem(d);
  if (problem) throw new Error(problem);
  const { result, attempts } = normaliseResult(d.result, d.attempts);
  const graded = d.gradeLabel != null;
  return {
    id, setting: d.setting, name: d.name.trim(), venue: d.venue.trim(), link: cleanLink(d.link) ?? "", wall: d.wall!,
    gradeSystem: graded ? d.gradeSystem : null, gradeLabel: d.gradeLabel,
    grade: graded ? sharedGrade(scale, d.gradeSystem, d.gradeLabel!) : null,
    result, attempts, tags: d.tags, note: d.note.trim(), climbedAt,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the wall-angle log says about you

export interface AngleSample {
  angle: number;
  /** Shared-scale grade of a send. */
  grade: number;
  climbedAt: string;
}

/**
 * How an off-board grade counts against board grades, in V grades. Outdoor grades are harder than they look next to a board, and
 * gym grades are softer, so an outdoor V4 counts as a V5 and a gym V4 as V3.5. The stored grade and what the user sees stay as logged;
 * this applies only when sends are compared or averaged.
 */
export const OUTSIDE_OFFSET: Record<OutsideSetting, number> = { outdoor: 1, gym: -0.5 };

/** The grade an off-board log counts for on the shared scale, offset as above, or null for an ungraded one. */
export const adjustedGrade = (o: OutsideLog): number | null => (o.grade == null ? null : o.grade + OUTSIDE_OFFSET[o.setting]);

/** The provider id off-board entries carry when they are merged into a logbook for the stats. It has no server and no grade table. */
export const OUTSIDE_PROVIDER = "outside";

/**
 * Off-board logs as logbook entries, so the stats can count them with board sends. The entry's `difficulty` is already the grade
 * on the shared scale with the gym/outdoor offset applied (kept just above zero so it still reads as graded), and `angle` is the wall
 * category's angle. These entries are for summaries only: nothing is uploaded and no climb page exists for them.
 */
export function outsideAsEntries(outside: OutsideLog[]): LogEntry[] {
  return outside.map((o) => {
    const g = adjustedGrade(o);
    return {
      id: `o:${o.id}`, provider: OUTSIDE_PROVIDER, climbUuid: `o:${o.id}`, climbName: o.name || `${SETTING_LABEL[o.setting]} ${wallStyle(o.wall).label.toLowerCase()}`,
      angle: wallStyle(o.wall).angle, isMirror: false, bidCount: o.attempts, quality: 0, difficulty: g == null ? 0 : Math.max(0.01, g), comment: o.note,
      climbedAt: o.climbedAt, isSend: o.result !== "attempt",
    };
  });
}

export interface GradeEvidence {
  grade: number;
  climbedAt: string;
}

/** Off-board sends as grade evidence (offset applied), to be counted with board sends when working out your level. */
export function outsideEvidence(outside: OutsideLog[]): GradeEvidence[] {
  const out: GradeEvidence[] = [];
  for (const o of outside) {
    const g = adjustedGrade(o);
    if (o.result !== "attempt" && g != null) out.push({ grade: g, climbedAt: o.climbedAt });
  }
  return out;
}

/** Every graded send with a wall angle: board sends at the board's angle, and outside sends at their category's angle. */
export function angleSamples(boardLogs: LogEntry[], outside: OutsideLog[], logGrade: (e: LogEntry) => number): AngleSample[] {
  const out: AngleSample[] = [];
  for (const e of boardLogs) {
    if (e.isSend && e.difficulty > 0) out.push({ angle: e.angle, grade: logGrade(e), climbedAt: e.climbedAt });
  }
  for (const o of outside) {
    const g = adjustedGrade(o);
    if (o.result !== "attempt" && g != null) out.push({ angle: wallStyle(o.wall).angle, grade: g, climbedAt: o.climbedAt });
  }
  return out;
}

export interface BucketStat {
  style: WallStyleId;
  sends: number;
  /** Average of the three hardest sends in this category, on the shared scale. */
  working: number;
}

export interface AngleAdvice {
  buckets: BucketStat[];
  best: BucketStat;
  weak: BucketStat;
  /** How many V grades the weakest category is behind the strongest. */
  gap: number;
  /** True when the gap is big enough to be worth training. */
  worthTraining: boolean;
  /** A board angle in the weakest category's range. */
  targetAngle: number;
}

export const MIN_SENDS_PER_STYLE = 3;
export const WORTH_TRAINING_GAP = 1;
const RECENT_DAYS = 120;
const MIN_RECENT = 6;

/**
 * Compares your working grade across wall angles. A category counts only with at least three sends, and at least two categories
 * are needed to compare. Recent sends (120 days) are used when there are enough, otherwise all of them. Returns null when there is
 * not enough data; the caller says so rather than guessing.
 */
export function angleAdvice(samples: AngleSample[], now: Date): AngleAdvice | null {
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const recent = samples.filter((s) => at(s.climbedAt).getTime() >= since);
  const use = recent.length >= MIN_RECENT ? recent : samples;
  const byStyle = new Map<WallStyleId, number[]>();
  for (const s of use) {
    const k = styleOfAngle(s.angle);
    (byStyle.get(k) ?? byStyle.set(k, []).get(k)!).push(s.grade);
  }
  const buckets: BucketStat[] = [];
  for (const w of WALL_STYLES) {
    const g = byStyle.get(w.id);
    if (!g || g.length < MIN_SENDS_PER_STYLE) continue;
    const top = [...g].sort((a, b) => b - a).slice(0, 3);
    buckets.push({ style: w.id, sends: g.length, working: top.reduce((a, b) => a + b, 0) / top.length });
  }
  if (buckets.length < 2) return null;
  const best = buckets.reduce((m, b) => (b.working > m.working ? b : m));
  const weak = buckets.reduce((m, b) => (b.working < m.working ? b : m));
  const gap = best.working - weak.working;
  return { buckets, best, weak, gap, worthTraining: gap >= WORTH_TRAINING_GAP, targetAngle: wallStyle(weak.style).angle };
}

/** The angle a board offers that is closest to `target` (the lower one on a tie), or null for a board with no choice of angle. */
export function snapAngle(target: number, angles: number[]): number | null {
  if (angles.length < 2) return null;
  return [...angles].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
}

/** One plain sentence about the advice, with grades as the caller prints them. */
export function adviceText(a: AngleAdvice, vLabel: (shared: number) => string): string {
  const best = wallStyle(a.best.style).label.toLowerCase();
  const weak = wallStyle(a.weak.style).label.toLowerCase();
  if (!a.worthTraining) return "Your grades are even across wall angles, so any angle is a fair test.";
  return `You send ${vLabel(a.best.working)} on ${best} walls but ${vLabel(a.weak.working)} on ${weak} ones, so that is where there is most to gain.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Your main style, and its opposite

export interface StyleProfile {
  /** The wall angle you send most. */
  main: WallStyleId;
  /** The opposite end of the angle scale from `main`. */
  anti: WallStyleId;
  counts: Record<WallStyleId, number>;
  /** Working grade (three hardest, shared scale) per category that has any sends. */
  working: Partial<Record<WallStyleId, number>>;
}

/** The category at the other end of the scale: slab and steep swap, vertical and overhang swap; for the middle one, the end you climb less. */
export function oppositeStyle(main: WallStyleId, counts: Record<WallStyleId, number>): WallStyleId {
  const order = WALL_STYLES.map((w) => w.id);
  const i = order.indexOf(main);
  if (i !== 2) return order[order.length - 1 - i];
  return counts.slab < counts.steep ? "slab" : "steep";
}

export const MIN_SENDS_FOR_PROFILE = 5;

/**
 * Which wall angle you climb most, and its opposite. Needs at least five graded sends in total and three in the main category.
 * Counts are by number of sends (volume), over the same recent window as the angle advice. Hold type is not part of this: board
 * climbs carry no hold-style data, so only the angle can be known for them.
 */
export function styleProfile(samples: AngleSample[], now: Date): StyleProfile | null {
  const since = now.getTime() - RECENT_DAYS * 86_400_000;
  const recent = samples.filter((s) => at(s.climbedAt).getTime() >= since);
  const use = recent.length >= MIN_RECENT ? recent : samples;
  if (use.length < MIN_SENDS_FOR_PROFILE) return null;
  const counts: Record<WallStyleId, number> = { slab: 0, vertical: 0, slight: 0, overhang: 0, steep: 0 };
  const grades = new Map<WallStyleId, number[]>();
  for (const s of use) {
    const k = styleOfAngle(s.angle);
    counts[k]++;
    (grades.get(k) ?? grades.set(k, []).get(k)!).push(s.grade);
  }
  const working: Partial<Record<WallStyleId, number>> = {};
  for (const [k, g] of grades) {
    const top = [...g].sort((a, b) => b - a).slice(0, 3);
    working[k] = top.reduce((a, b) => a + b, 0) / top.length;
  }
  // Most sends wins; a tie goes to the style you are stronger at.
  const main = WALL_STYLES.map((w) => w.id).reduce((m, k) => (counts[k] > counts[m] || (counts[k] === counts[m] && (working[k] ?? 0) > (working[m] ?? 0)) ? k : m));
  if (counts[main] < MIN_SENDS_PER_STYLE) return null;
  return { main, anti: oppositeStyle(main, counts), counts, working };
}

/**
 * The angle at which a board shows a given wall category: the nearest angle an adjustable board offers (a slab has no board angle,
 * so it gets the closest to vertical), and for a board with one fixed angle that angle only when it is in the category.
 */
export function angleForStyle(style: WallStyleId, boardAngles: number[], fixedAngle: number): number | null {
  if (boardAngles.length >= 2) return snapAngle(wallStyle(style).angle, boardAngles);
  return styleOfAngle(fixedAngle) === style ? fixedAngle : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// What to try on the gym wall today

export interface GymTarget {
  wall: WallStyleId;
  tag: string;
  /** The gym V grade to aim at, such as "V4". */
  gradeLabel: string;
  /** True when it is a grade above your level rather than at it. */
  push: boolean;
  /** How many matching gym climbs you have logged lately (an attempts-only record counts half). */
  done: number;
}

const GYM_WINDOW_DAYS = 180;

/**
 * Picks a style of gym boulder you have done little of at your level: a wall angle, a style tag and a V grade. Only gym logs count,
 * and the grade is shown as a gym grade (your level on the shared scale, less the gym offset). A combination you have never done
 * scores best; the weakest and the opposite angles are favoured, and a daily shuffle (moved by `seed`) picks among near-equals.
 * Null when your level isn't known yet.
 */
export function gymTarget(opts: { logs: OutsideLog[]; working: number | null; favoured?: WallStyleId[]; now: Date; seed: number }): GymTarget | null {
  if (opts.working == null) return null;
  const since = opts.now.getTime() - GYM_WINDOW_DAYS * 86_400_000;
  const gym = opts.logs.filter((l) => l.setting === "gym");
  const recent = gym.filter((l) => at(l.climbedAt).getTime() >= since);
  const use = recent.length >= MIN_RECENT ? recent : gym;
  const weight = (l: OutsideLog) => (l.result === "attempt" ? 0.5 : 1);
  const vOf = (l: OutsideLog) => (l.grade == null ? null : Math.floor(l.grade));
  const base = Math.max(0, Math.round(opts.working - OUTSIDE_OFFSET.gym));
  const wallTotal = (w: WallStyleId) => use.filter((l) => l.wall === w).reduce((n, l) => n + weight(l), 0);
  const tagTotal = (t: string) => use.filter((l) => l.tags.includes(t)).reduce((n, l) => n + weight(l), 0);
  let best: { score: number; t: GymTarget } | null = null;
  for (const wall of WALL_STYLES.map((w) => w.id)) {
    for (const tag of STYLE_TAGS) {
      for (const [v, push] of [[base, false], [base + 1, true]] as const) {
        const done = use.filter((l) => l.wall === wall && l.tags.includes(tag) && vOf(l) === v).reduce((n, l) => n + weight(l), 0);
        const score = done * 3 + tagTotal(tag) * 0.5 + wallTotal(wall) * 0.3 + (push ? 0.4 : 0) - (opts.favoured?.includes(wall) ? 0.8 : 0) + hashSeed(opts.seed, `${wall}:${tag}:${v}`) * 0.9;
        if (!best || score < best.score) best = { score, t: { wall, tag, gradeLabel: `V${v}`, push, done } };
      }
    }
  }
  return best ? best.t : null;
}

/** "You haven't done much crimpy V4 overhang. Try that today!" */
export function gymTargetText(t: GymTarget): string {
  const what = `${t.tag.toLowerCase()} ${t.gradeLabel} ${wallStyle(t.wall).label.toLowerCase()}`;
  const done = Math.floor(t.done);
  if (done < 1) return `You haven't done much ${what}. Try that today!`;
  return `You've only done ${done} ${what}. Try one today!`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Quick logging at the gym

/** A way of logging a gym climb that the user has used lately, offered as a one-tap repeat. */
export interface QuickCombo {
  result: OutsideResult;
  attempts: number;
  wall: WallStyleId;
  gradeSystem: OutsideGradeSystem | null;
  gradeLabel: string | null;
}

/** The last `n` different gym climbs logged (same result, wall and grade count once), newest first. */
export function recentGymCombos(logs: OutsideLog[], n = 3): QuickCombo[] {
  const out: QuickCombo[] = [];
  const seen = new Set<string>();
  const newestFirst = [...logs].filter((l) => l.setting === "gym").sort((a, b) => (a.climbedAt < b.climbedAt ? 1 : a.climbedAt > b.climbedAt ? -1 : 0));
  for (const l of newestFirst) {
    const key = `${l.result}|${l.wall}|${l.gradeLabel ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ result: l.result, attempts: l.attempts, wall: l.wall, gradeSystem: l.gradeSystem, gradeLabel: l.gradeLabel });
    if (out.length >= n) break;
  }
  return out;
}

/** "Flash V3 \u00B7 Overhang", "Sent V4 \u00B7 Slab", "Tried V5 \u00B7 Steep or roof". */
export function quickLabel(c: QuickCombo): string {
  const verb = c.result === "flash" ? "Flash" : c.result === "send" ? "Sent" : "Tried";
  return `${verb}${c.gradeLabel ? ` ${c.gradeLabel}` : ""} \u00B7 ${wallStyle(c.wall).label}`;
}

/** The form draft for a combination, ready to save. */
export function draftFromCombo(c: QuickCombo, venue: string): OutsideDraft {
  return { setting: "gym", name: "", venue, link: "", wall: c.wall, gradeSystem: c.gradeSystem ?? "v", gradeLabel: c.gradeLabel, result: c.result, attempts: c.attempts, tags: [], note: "" };
}
