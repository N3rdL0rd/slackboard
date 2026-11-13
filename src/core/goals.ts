/**
 * Goals: a target the user chooses, with a window, measured from the same entries as everything else. Pure. A goal counts only what is
 * logged from the day it was made (or the start of its week or month), so a new goal is never already done by old history. Progress is
 * recomputed from the entries each time, but a goal that has been reached stays reached: the status is saved, so editing or deleting
 * the entry that completed it changes nothing. A goal whose window passes without it is "ended", said quietly; nothing here ever tells
 * the user they are behind.
 */
import { ACTIVITY_KINDS, type Activity } from "./activity";
import { addDays, dayOf, isDay, monthStartDay, stampOf, weekStartDay, type Day } from "./days";
import { sendsIn } from "./logTimeline";
import { CLOSE_LEFT, CLOSE_SHARE, vOf, type Milestone } from "./milestones";
import { streakInfo } from "./streak";

export type GoalType = "grade" | "volume" | "streak" | "training" | "custom";
/** What a goal looks at. `board` is a board only; `boulder` is boards and off-board boulders; `any` is every kind. */
export type GoalScope = "board" | "boulder" | "roped" | "any";
export type GoalStatus = "active" | "achieved" | "missed" | "paused";
export type VolumeMetric = "sends" | "days";

export type GoalSpec =
  /** The best send in scope reaches `grade`: a V number for boards and boulders, an IRCRA number for roped. */
  | { type: "grade"; scope: "board" | "boulder" | "roped"; grade: number }
  | { type: "volume"; scope: GoalScope; metric: VolumeMetric; count: number }
  /** A chain of climbing days (at most one rest day between) of this many days. */
  | { type: "streak"; days: number }
  /** Days with training logged, or with finger-intense training only. */
  | { type: "training"; days: number; fingers: boolean }
  | { type: "custom" };

export type WindowKind = "week" | "month" | "until" | "none";

export interface GoalWindow {
  kind: WindowKind;
  /** First day counted. */
  start: Day;
  /** Last day counted, or null for no end. */
  end: Day | null;
}

export interface Goal {
  id: string;
  title: string;
  spec: GoalSpec;
  window: GoalWindow;
  status: GoalStatus;
  /** Local `yyyy-MM-dd HH:mm:ss`. */
  createdAt: string;
  achievedAt: string | null;
}

export const MAX_TITLE = 100;
export const MAX_COUNT = 10_000;
export const MAX_DAYS = 365;
export const MAX_GRADE = 60;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "31 Dec". */
export const shortDate = (day: Day): string => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

const lastDayOfMonth = (day: Day): Day => {
  const [y, m] = day.split("-").map(Number);
  return dayOf(new Date(y, m, 0, 12));
};

/** The window for a kind, counted from `today`: this calendar week or month, until a date, or with no end. */
export function makeWindow(kind: WindowKind, today: Day, until?: Day): GoalWindow {
  if (kind === "week") { const start = weekStartDay(today); return { kind, start, end: addDays(start, 6) }; }
  if (kind === "month") { const start = monthStartDay(today); return { kind, start, end: lastDayOfMonth(start) }; }
  if (kind === "until") return { kind, start: today, end: until && until >= today ? until : today };
  return { kind: "none", start: today, end: null };
}

/** The same kind of window, one period on: next week, next month, or no end for the others. */
export function nextWindow(w: GoalWindow): GoalWindow {
  if (w.kind === "week") return makeWindow("week", addDays(w.start, 7));
  if (w.kind === "month") return makeWindow("month", addDays(lastDayOfMonth(w.start), 1));
  return makeWindow("none", w.end ?? w.start);
}

export const windowText = (w: GoalWindow): string =>
  w.kind === "week" ? "this week" : w.kind === "month" ? "this month" : w.kind === "until" && w.end ? `by ${shortDate(w.end)}` : "";

/** How the user's notation writes a grade, so titles read in their own system. */
export interface GoalLabels {
  boulder: (v: number) => string;
  roped: (ircra: number) => string;
}

const sendsNoun = (scope: GoalScope, n: number): string =>
  scope === "roped" ? plural(n, "route") : scope === "board" ? plural(n, "board send") : scope === "boulder" ? plural(n, "boulder send") : plural(n, "send");

/** The goal in a phrase: "Send a V5 on my board", "20 sends this month", "A 10-day streak". */
export function goalTitle(spec: GoalSpec, window: GoalWindow, labels: GoalLabels): string {
  const w = windowText(window);
  const tail = w ? ` ${w}` : "";
  switch (spec.type) {
    case "grade": {
      const g = spec.scope === "roped" ? labels.roped(spec.grade) : labels.boulder(spec.grade);
      return `${spec.scope === "roped" ? `Send a ${g} route` : spec.scope === "board" ? `Send a ${g} on my board` : `Send a ${g} boulder`}${tail}`;
    }
    case "volume":
      return spec.metric === "sends" ? `${spec.count} ${sendsNoun(spec.scope, spec.count)}${tail}` : `Climb ${spec.count} ${plural(spec.count, "day")}${tail}`;
    case "streak":
      return `A ${spec.days}-day streak${tail}`;
    case "training":
      return `Train${spec.fingers ? " fingers" : ""} on ${spec.days} ${plural(spec.days, "day")}${tail}`;
    case "custom":
      return "";
  }
}

export interface GoalProgress {
  current: number;
  target: number;
  /** 0 to 1. */
  progress: number;
  /** Reached on the entries as they stand now. */
  done: boolean;
  /** What is left, in a phrase ("3 more sends"), or null when it makes no sense to say (a grade not yet near, a custom goal). */
  remaining: string | null;
  /** The sentence for the goal's card: "7 of 10 sends, this month". */
  summary: string;
}

export interface GoalContext {
  activities: Activity[];
  today: Day;
  labels: GoalLabels;
}

const kindsFor = (scope: GoalScope): Set<string> =>
  new Set(scope === "board" ? ["board"] : scope === "boulder" ? ["board", "offBoard"] : scope === "roped" ? ["roped"] : ["board", "offBoard", "roped"]);

const inWindow = (a: Activity, w: GoalWindow): boolean => a.day >= w.start && (w.end === null || a.day <= w.end);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function counted(current: number, target: number, noun: string, w: GoalWindow, remainingNoun: string): GoalProgress {
  const left = Math.max(0, target - current);
  const tail = windowText(w);
  return {
    current, target, progress: clamp01(current / target), done: current >= target,
    remaining: left > 0 ? `${left} more ${remainingNoun}` : null,
    summary: `${current} of ${target} ${noun}${tail ? `, ${tail}` : ""}`,
  };
}

/** How far a goal is on the entries as they stand. A custom goal has no measure; it is done when the user says so. */
export function measure(goal: Goal, ctx: GoalContext): GoalProgress {
  const { spec, window: w } = goal;
  const inside = ctx.activities.filter((a) => inWindow(a, w));
  switch (spec.type) {
    case "grade": {
      const kinds = kindsFor(spec.scope);
      const grades = inside.filter((a) => kinds.has(a.kind) && a.facts.send && a.facts.grade !== null).map((a) => (spec.scope === "roped" ? a.facts.grade! : vOf(a.facts.grade!)));
      const best = grades.length ? Math.max(...grades) : null;
      const label = (g: number) => (spec.scope === "roped" ? ctx.labels.roped(g) : ctx.labels.boulder(g));
      const done = best !== null && best >= spec.grade;
      const tail = windowText(w);
      return {
        current: best ?? 0, target: spec.grade, progress: done ? 1 : best === null ? 0 : clamp01(best / spec.grade), done,
        remaining: best !== null && !done && spec.grade - best <= 1 ? `Your best is ${label(best)}` : null,
        summary: `${best === null ? "No send yet" : `Best so far: ${label(best)}`}${tail ? `, ${tail}` : ""}`,
      };
    }
    case "volume": {
      if (spec.metric === "sends") {
        const kinds = kindsFor(spec.scope);
        const n = inside.filter((a) => kinds.has(a.kind)).reduce((sum, a) => sum + sendsIn(a), 0);
        return counted(n, spec.count, sendsNoun(spec.scope, spec.count), w, sendsNoun(spec.scope, Math.max(1, spec.count - n)));
      }
      // Climbing days follow the streak rule: any kind counts, training included, when the scope is "any".
      const kinds = spec.scope === "any" ? null : kindsFor(spec.scope);
      const days = new Set(inside.filter((a) => (kinds ? kinds.has(a.kind) : ACTIVITY_KINDS[a.kind].countsTowardStreak)).map((a) => a.day));
      return counted(days.size, spec.count, plural(spec.count, "day"), w, plural(Math.max(1, spec.count - days.size), "day"));
    }
    case "streak": {
      const days = inside.filter((a) => ACTIVITY_KINDS[a.kind].countsTowardStreak).map((a) => a.day);
      const longest = streakInfo(days, w.end && w.end < ctx.today ? w.end : ctx.today).longest;
      const p = counted(longest, spec.days, "days in a row", { ...w, kind: "none" }, plural(Math.max(1, spec.days - longest), "day") + " in a row");
      return { ...p, summary: `${longest} of ${spec.days} ${plural(spec.days, "day")} in a row${windowText(w) ? `, ${windowText(w)}` : ""}` };
    }
    case "training": {
      const days = new Set(inside.filter((a) => a.kind === "training" && (!spec.fingers || a.facts.fingerIntense)).map((a) => a.day));
      return counted(days.size, spec.days, plural(spec.days, "training day"), w, plural(Math.max(1, spec.days - days.size), "training day"));
    }
    case "custom":
      return { current: goal.status === "achieved" ? 1 : 0, target: 1, progress: goal.status === "achieved" ? 1 : 0, done: false, remaining: null, summary: goal.status === "achieved" ? "Done" : "Tick it off when you have done it" };
  }
}

/** Close enough to be worth saying: a grade goal one step away, or a count within `CLOSE_LEFT` or most of the way there. */
export function isGoalClose(goal: Goal, p: GoalProgress): boolean {
  if (goal.status !== "active" || p.done || goal.spec.type === "custom" || p.remaining === null) return false;
  if (goal.spec.type === "grade") return true;
  return p.target - p.current <= CLOSE_LEFT || p.current / p.target >= CLOSE_SHARE;
}

/** A goal as a milestone, so the one line on the Climb tab can say it. A close goal takes priority over a default milestone. */
export function goalMilestone(goal: Goal, p: GoalProgress): Milestone {
  return {
    id: `goal:${goal.id}`, kind: "goal", current: p.current, target: p.target, progress: p.progress,
    text: goal.spec.type === "grade" ? `${p.remaining}. Goal: ${goal.title}.` : `${p.remaining} to go. Goal: ${goal.title}.`,
    why: `It is one of your goals: ${goal.title}. A goal that is close takes the place of the usual line.`,
  };
}

/** The closest goal worth saying today (the furthest along), or null. */
export function closestGoal(goals: Goal[], ctx: GoalContext): { goal: Goal; progress: GoalProgress } | null {
  let best: { goal: Goal; progress: GoalProgress } | null = null;
  for (const goal of goals) {
    const progress = measure(goal, ctx);
    if (!isGoalClose(goal, progress)) continue;
    if (!best || progress.progress > best.progress.progress || (progress.progress === best.progress.progress && goal.id < best.goal.id)) best = { goal, progress };
  }
  return best;
}

export interface Resolution {
  goals: Goal[];
  /** Goals that became achieved on this pass, for the celebration. */
  achieved: Goal[];
  /** Every goal whose saved status or date has to be updated. */
  changed: Goal[];
}

/**
 * Applies the rules to the saved goals: an active goal that is now reached becomes achieved (and stays so), and an active goal whose
 * window has passed without it becomes ended. Paused, achieved and ended goals are left exactly as they are.
 */
export function resolveGoals(goals: Goal[], ctx: GoalContext, now: Date): Resolution {
  const achieved: Goal[] = [];
  const changed: Goal[] = [];
  const out = goals.map((g) => {
    if (g.status !== "active") return g;
    if (g.spec.type !== "custom" && measure(g, ctx).done) {
      const next = { ...g, status: "achieved" as const, achievedAt: stampOf(now) };
      achieved.push(next); changed.push(next);
      return next;
    }
    if (g.window.end !== null && ctx.today > g.window.end) {
      const next = { ...g, status: "missed" as const };
      changed.push(next);
      return next;
    }
    return g;
  });
  return { goals: out, achieved, changed };
}

export interface GoalDraft { spec: GoalSpec; windowKind: WindowKind; window: GoalWindow }

/**
 * A sensible follow-up for a goal that was reached: the next grade, a longer streak, or a bit more of the same in the next period. It
 * is an offer, never applied without a tap. Null for a custom goal, which has nothing to build on.
 */
export function suggestNext(goal: Goal, today: Day): GoalDraft | null {
  const { spec } = goal;
  const window = goal.window.kind === "week" || goal.window.kind === "month" ? nextWindow(goal.window) : makeWindow("none", today);
  const keep = (s: GoalSpec): GoalDraft => ({ spec: s, windowKind: window.kind, window });
  switch (spec.type) {
    case "grade": return keep({ ...spec, grade: Math.min(MAX_GRADE, spec.grade + 1) });
    case "streak": return keep({ type: "streak", days: Math.min(MAX_DAYS, spec.days * 2) });
    case "volume": return keep({ ...spec, count: spec.metric === "days" ? Math.min(7, spec.count + 1) : Math.min(MAX_COUNT, Math.ceil(spec.count * 1.25)) });
    case "training": return keep({ ...spec, days: Math.min(7, spec.days + 1) });
    case "custom": return null;
  }
}

/** An ended goal offered again from today: the same target in this week or month, or with no end when it had a date. */
export function retryDraft(goal: Goal, today: Day): GoalDraft {
  const kind: WindowKind = goal.window.kind === "week" || goal.window.kind === "month" ? goal.window.kind : "none";
  return { spec: goal.spec, windowKind: kind, window: makeWindow(kind, today) };
}

/** The hardest boulder send on the shared scale as a V number (boards and off-board), or null when there is none. */
export function bestBoulderV(activities: Activity[]): number | null {
  const vs = activities.filter((a) => (a.kind === "board" || a.kind === "offBoard") && a.facts.send && a.facts.grade !== null).map((a) => vOf(a.facts.grade!));
  return vs.length ? Math.max(...vs) : null;
}

export interface GoalTemplate {
  id: string;
  label: string;
  hint: string;
  /** The goal as a draft, given the user's current best on the V scale (null when there is none yet). */
  draft: (today: Day, bestV: number | null) => GoalDraft | null;
}

const draftOf = (spec: GoalSpec, kind: WindowKind, today: Day): GoalDraft => ({ spec, windowKind: kind, window: makeWindow(kind, today) });

export const GOAL_TEMPLATES: GoalTemplate[] = [
  { id: "grade", label: "Reach a higher grade", hint: "Starts one grade above your best", draft: (t, best) => draftOf({ type: "grade", scope: "boulder", grade: Math.max(1, (best ?? 0) + 1) }, "none", t) },
  { id: "days", label: "Climb 3 days a week", hint: "Days with a climb or training", draft: (t) => draftOf({ type: "volume", scope: "any", metric: "days", count: 3 }, "week", t) },
  { id: "streak", label: "A 10-day streak", hint: "Climbing days, one rest day allowed between", draft: (t) => draftOf({ type: "streak", days: 10 }, "none", t) },
  { id: "fingers", label: "Train fingers twice a week", hint: "Hangboard and other finger work", draft: (t) => draftOf({ type: "training", days: 2, fingers: true }, "week", t) },
  { id: "custom", label: "Custom", hint: "Your own words, with a tick box", draft: (t) => draftOf({ type: "custom" }, "none", t) },
];

/** A new active goal from a draft. The title is written from the draft unless it is a custom goal, which uses the user's words. */
export function newGoal(id: string, draft: GoalDraft, title: string, labels: GoalLabels, now: Date): Goal {
  const written = draft.spec.type === "custom" ? title.trim().slice(0, MAX_TITLE) : goalTitle(draft.spec, draft.window, labels);
  return { id, title: written, spec: draft.spec, window: draft.window, status: "active", createdAt: stampOf(now), achievedAt: null };
}

/** Whether a draft can be saved: a custom goal needs words, a window must end after it starts. */
export function draftProblem(d: GoalDraft, title: string): string | null {
  if (d.spec.type === "custom" && !title.trim()) return "Write what you want to do.";
  if (d.window.end !== null && d.window.end < d.window.start) return "The end date is before the start.";
  if (d.spec.type === "volume" && d.spec.metric === "days" && d.window.kind === "week" && d.spec.count > 7) return "A week has seven days.";
  return null;
}

// ---- Storage and untrusted input ------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
const SCOPES: GoalScope[] = ["board", "boulder", "roped", "any"];
const STATUSES: GoalStatus[] = ["active", "achieved", "missed", "paused"];
const WINDOWS: WindowKind[] = ["week", "month", "until", "none"];

function parseSpec(v: unknown): GoalSpec | null {
  if (!isObj(v)) return null;
  switch (v.type) {
    case "grade": {
      const grade = int(v.grade, 0, MAX_GRADE);
      return grade !== null && (v.scope === "board" || v.scope === "boulder" || v.scope === "roped") ? { type: "grade", scope: v.scope, grade } : null;
    }
    case "volume": {
      const count = int(v.count, 1, MAX_COUNT);
      return count !== null && SCOPES.includes(v.scope as GoalScope) && (v.metric === "sends" || v.metric === "days") ? { type: "volume", scope: v.scope as GoalScope, metric: v.metric, count } : null;
    }
    case "streak": { const days = int(v.days, 1, MAX_DAYS); return days !== null ? { type: "streak", days } : null; }
    case "training": { const days = int(v.days, 1, MAX_DAYS); return days !== null && typeof v.fingers === "boolean" ? { type: "training", days, fingers: v.fingers } : null; }
    case "custom": return { type: "custom" };
    default: return null;
  }
}

function parseWindow(v: unknown): GoalWindow | null {
  if (!isObj(v) || !WINDOWS.includes(v.kind as WindowKind) || typeof v.start !== "string" || !isDay(v.start)) return null;
  const end = v.end === null || v.end === undefined ? null : typeof v.end === "string" && isDay(v.end) ? v.end : undefined;
  if (end === undefined || (end !== null && end < v.start) || (v.kind !== "none" && end === null)) return null;
  return { kind: v.kind as WindowKind, start: v.start, end: v.kind === "none" ? null : end };
}

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** Reads one goal from untrusted input (a backup file). Null for anything damaged. */
export function parseGoal(v: unknown): Goal | null {
  if (!isObj(v)) return null;
  const { id, title, createdAt, achievedAt } = v;
  const spec = parseSpec(v.spec);
  const window = parseWindow(v.window);
  if (typeof id !== "string" || !id || id.length > 100 || typeof title !== "string" || title.length > MAX_TITLE || !spec || !window) return null;
  if (!STATUSES.includes(v.status as GoalStatus) || typeof createdAt !== "string" || !STAMP.test(createdAt)) return null;
  const achieved = achievedAt === null || achievedAt === undefined ? null : typeof achievedAt === "string" && STAMP.test(achievedAt) ? achievedAt : undefined;
  if (achieved === undefined || (v.status === "achieved") !== (achieved !== null)) return null;
  if (spec.type === "custom" && !title.trim()) return null;
  return { id, title, spec, window, status: v.status as GoalStatus, createdAt, achievedAt: achieved };
}

/** The three structured columns of `l_goals`, as JSON text. */
export function encodeGoal(g: Goal): { type: GoalType; scope: string; window: string; target: string } {
  const { spec } = g;
  const scope = spec.type === "grade" || spec.type === "volume" ? { scope: spec.scope } : spec.type === "training" ? { fingers: spec.fingers } : {};
  const target = spec.type === "grade" ? { grade: spec.grade } : spec.type === "volume" ? { metric: spec.metric, count: spec.count } : spec.type === "streak" || spec.type === "training" ? { days: spec.days } : {};
  return { type: spec.type, scope: JSON.stringify(scope), window: JSON.stringify(g.window), target: JSON.stringify(target) };
}

/** The reverse of `encodeGoal`; null when the stored text no longer makes a goal (it is skipped, not half-read). */
export function decodeGoal(row: { id: string; title: string; type: string; scope: string; window: string; target: string; status: string; created_at: string; achieved_at: string | null }): Goal | null {
  try {
    return parseGoal({ id: row.id, title: row.title, spec: { type: row.type, ...JSON.parse(row.scope), ...JSON.parse(row.target) }, window: JSON.parse(row.window), status: row.status, createdAt: row.created_at, achievedAt: row.achieved_at });
  } catch {
    return null;
  }
}
