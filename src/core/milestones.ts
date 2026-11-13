/**
 * The default motivation line: the app keeps a list of next milestones it can compute from the log alone, and shows the closest one
 * worth mentioning, at most one a day. A milestone is only offered when it is close (at most `CLOSE_LEFT` to go, or at least
 * `CLOSE_SHARE` of the way there), so far-off targets stay quiet. It never compares the user with anyone and never says they are behind.
 * Everything here is pure and computed from the entries, so an edited or deleted entry corrects it.
 */
import { ropedLogOf, type Activity } from "./activity";
import { daysBetween, monthStartDay, weekStartDay, type Day } from "./days";
import { hashSeed } from "./filters";
import type { RopedLog } from "./roped";
import type { StreakInfo } from "./streak";

export type MilestoneKind = "goal" | "countAtGrade" | "newGrade" | "sendCount" | "streak" | "week" | "month" | "ropedFirst";

export interface Milestone {
  /** Stable for the same milestone, so a hidden one stays hidden and a repeat can be told apart. */
  id: string;
  kind: MilestoneKind;
  /** One sentence for the Climb tab and the toast after logging. */
  text: string;
  current: number;
  target: number;
  /** How far there, 0 to 1, for the small progress bar. */
  progress: number;
  /** The V grade it is about, for milestones about one grade. */
  grade?: number;
  /** The rule, for "Why am I seeing this?". */
  why: string;
}

/** At most this many to go, or at least this share of the way, for a milestone to be worth mentioning. */
export const CLOSE_LEFT = 5;
export const CLOSE_SHARE = 0.7;
/** Nothing is said until the user has logged this many entries, so the line is always true and never premature. */
export const MIN_ENTRIES = 5;

const COUNT_TARGETS = [5, 10, 25, 50, 100, 250, 500, 1000];
const SEND_TARGETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
/** A grade needs this many sends before "N more until ..." is about something the user is working on. */
const MIN_AT_GRADE = 3;
/** A new best week or month needs a real best to match. */
const MIN_BEST_WEEK_DAYS = 3;
const MIN_BEST_MONTH_SENDS = 10;
const MIN_LONGEST_STREAK = 3;
const MIN_ROPED_ENTRIES = 3;

const nextTarget = (n: number, targets: number[]): number | null => targets.find((t) => t > n) ?? null;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const isClose = (current: number, target: number): boolean => target - current <= CLOSE_LEFT || current / target >= CLOSE_SHARE;
const make = (m: Omit<Milestone, "progress">): Milestone => ({ ...m, progress: Math.max(0, Math.min(1, m.current / m.target)) });

/** The board send's V grade (a whole number), from its shared-scale grade. */
export const vOf = (grade: number): number => Math.floor(grade + 1e-9);

/** Everything the milestones are computed from: every entry of every kind, the day, and the streak as of that day. */
export interface MilestoneInput {
  activities: Activity[];
  today: Day;
  streak: StreakInfo;
}

const boardSends = (list: Activity[]) => list.filter((a) => a.kind === "board" && a.facts.send && a.facts.grade !== null);

/** Every milestone that can be said about the log, close or not. */
export function milestoneCandidates({ activities, today, streak }: MilestoneInput): Milestone[] {
  const out: Milestone[] = [];

  // Sends at one grade on a board: "3 more V4s until you have 10".
  const byV = new Map<number, number>();
  for (const a of boardSends(activities)) byV.set(vOf(a.facts.grade!), (byV.get(vOf(a.facts.grade!)) ?? 0) + 1);
  for (const [v, n] of byV) {
    const target = nextTarget(n, COUNT_TARGETS);
    if (n < MIN_AT_GRADE || target === null) continue;
    const left = target - n;
    out.push(make({
      id: `grade:${v}:${target}`, kind: "countAtGrade", grade: v, current: n, target,
      text: `${left} more V${v}${left === 1 ? "" : "s"} until you have ${target}`,
      why: `You have ${n} V${v} sends on boards, and the next milestone is ${target}.`,
    }));
  }

  // A new hardest grade: offered once the current hardest is well worked.
  if (byV.size) {
    const hardest = Math.max(...byV.keys());
    const n = byV.get(hardest)!;
    if (n >= MIN_AT_GRADE) {
      out.push(make({
        id: `newgrade:${hardest + 1}`, kind: "newGrade", grade: hardest + 1, current: Math.min(n, 5), target: 5,
        text: `A first V${hardest + 1} would be a new hardest for you`,
        why: `Your hardest board grade is V${hardest}, with ${n} sends. The next grade up is V${hardest + 1}.`,
      }));
    }
  }

  // Total boulder sends: "12 sends to reach 100".
  const sends = activities.filter((a) => (a.kind === "board" || a.kind === "offBoard") && a.facts.send).length;
  const sendTarget = nextTarget(sends, SEND_TARGETS);
  if (sendTarget !== null) {
    const left = sendTarget - sends;
    out.push(make({
      id: `sends:${sendTarget}`, kind: "sendCount", current: sends, target: sendTarget,
      text: `${left} ${plural(left, "send")} to reach ${sendTarget}`,
      why: `You have logged ${sends} boulder sends on boards, gyms and outdoors, and the next milestone is ${sendTarget}.`,
    }));
  }

  // Consistency: closing in on the longest streak.
  if (streak.current > 0 && streak.longest >= MIN_LONGEST_STREAK && streak.current <= streak.longest) {
    const left = streak.longest + 1 - streak.current;
    out.push(make({
      id: `streak:${streak.longest}`, kind: "streak", current: streak.current, target: streak.longest + 1,
      text: `${left} more climbing ${plural(left, "day")} to beat your longest streak`,
      why: `Your streak is ${streak.current} ${plural(streak.current, "day")} and your longest is ${streak.longest}.`,
    }));
  }

  // This week against the best week, in climbing days.
  const days = [...new Set(activities.map((a) => a.day))].filter((d) => d <= today);
  const weekDays = new Map<Day, number>();
  const monthSends = new Map<string, number>();
  for (const d of days) weekDays.set(weekStartDay(d), (weekDays.get(weekStartDay(d)) ?? 0) + 1);
  for (const a of activities) if (a.facts.send && a.day <= today) monthSends.set(monthStartDay(a.day), (monthSends.get(monthStartDay(a.day)) ?? 0) + 1);
  const thisWeek = weekStartDay(today);
  const bestWeek = Math.max(0, ...[...weekDays].filter(([w]) => w < thisWeek).map(([, n]) => n));
  const nowWeek = weekDays.get(thisWeek) ?? 0;
  if (bestWeek >= MIN_BEST_WEEK_DAYS && nowWeek < bestWeek) {
    const left = bestWeek - nowWeek;
    out.push(make({
      id: `week:${bestWeek}`, kind: "week", current: nowWeek, target: bestWeek,
      text: `${left} more ${plural(left, "day")} this week to match your best week`,
      why: `You have climbed on ${nowWeek} ${plural(nowWeek, "day")} this week. Your best week so far had ${bestWeek}.`,
    }));
  }

  // This month's sends against the best month.
  const thisMonth = monthStartDay(today);
  const bestMonth = Math.max(0, ...[...monthSends].filter(([m]) => m < thisMonth).map(([, n]) => n));
  const nowMonth = monthSends.get(thisMonth) ?? 0;
  if (bestMonth >= MIN_BEST_MONTH_SENDS && nowMonth < bestMonth) {
    const left = bestMonth - nowMonth;
    out.push(make({
      id: `month:${bestMonth}`, kind: "month", current: nowMonth, target: bestMonth,
      text: `You're ${left} ${plural(left, "send")} from your best month`,
      why: `You have ${nowMonth} ${plural(nowMonth, "send")} this month. Your best month so far had ${bestMonth}.`,
    }));
  }

  // A first roped redpoint, only for someone who already logs roped climbs.
  const roped = activities.map(ropedLogOf).filter((l): l is RopedLog => l !== null);
  if (roped.length >= MIN_ROPED_ENTRIES && !roped.some((l) => l.result === "redpoint")) {
    out.push(make({
      id: "roped:redpoint", kind: "ropedFirst", current: 0, target: 1, text: "Log a first roped redpoint",
      why: `You have logged ${roped.length} roped climbs and none is a redpoint yet.`,
    }));
  }
  return out;
}

/** Whether a milestone is close enough to mention. */
export const isMilestoneClose = (m: Milestone): boolean => m.current < m.target && isClose(m.current, m.target);

/**
 * The one to show today. A milestone about the grade the user just logged comes first; otherwise the closest few take turns by day, so
 * the same line does not sit there for a week. The same day always gives the same answer.
 */
export function pickMilestone(candidates: Milestone[], today: Day, justLoggedV: number | null = null): Milestone | null {
  const close = candidates.filter(isMilestoneClose).sort((a, b) => b.progress - a.progress || (a.target - a.current) - (b.target - b.current) || a.id.localeCompare(b.id));
  if (!close.length) return null;
  const recent = justLoggedV === null ? undefined : close.find((m) => m.grade === justLoggedV && m.kind === "countAtGrade");
  if (recent) return recent;
  const top = close.slice(0, 3);
  // hashSeed gives a fraction in [0, 1), so scale it to an index.
  return top[Math.floor(hashSeed(daysBetween("2020-01-06", today), "milestone") * top.length)];
}

/** The line for the Climb tab, or null when there is nothing true and close to say (or too little logged to say anything). */
export function motivationLine(input: MilestoneInput): Milestone | null {
  if (input.activities.length < MIN_ENTRIES) return null;
  return pickMilestone(milestoneCandidates(input), input.today);
}

/** After logging a board send at V grade `v`: the milestone about that grade, if it has just come close. Null when it hasn't moved. */
export function toastMilestone(input: MilestoneInput, v: number): Milestone | null {
  if (input.activities.length < MIN_ENTRIES) return null;
  const m = milestoneCandidates(input).find((c) => c.kind === "countAtGrade" && c.grade === v);
  return m && isMilestoneClose(m) ? m : null;
}
