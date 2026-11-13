/**
 * Streaks. A climbing day is a local day with at least one logged entry that counts (a board climb, a gym or outdoor boulder, a roped
 * climb, or training: see `climbingDays` in activity.ts). A streak is a chain of climbing days where consecutive ones are at most
 * `STREAK_MAX_GAP` calendar days apart, so one day on and one day off keeps it alive. Everything is computed from the log, so an old
 * entry added later can extend or repair a streak and deleting one can break it. Nothing is stored.
 */
import { addDays, daysBetween, weekStartDay, type Day } from "./days";

/** Consecutive climbing days may be this many days apart: exactly one rest day between climbs. */
export const STREAK_MAX_GAP = 2;

/**
 * Where today stands. `today`: climbed today. `rest`: climbed yesterday, so a rest day today is fine. `last`: climbed two days ago, so
 * today is the last day that keeps it going. `broken`: the chain ended, and `longest` is what remains to show. `none`: nothing logged.
 */
export type StreakState = "today" | "rest" | "last" | "broken" | "none";

export interface StreakInfo {
  /** Climbing days in the current chain, or 0 when it has ended. */
  current: number;
  /** First day to last day of the current chain, inclusive (rest days count), or 0. */
  span: number;
  /** The best chain ever, in climbing days. It is kept after a break. */
  longest: number;
  /** The span of that best chain. */
  longestSpan: number;
  state: StreakState;
  /** The most recent climbing day on or before today. */
  lastDay: Day | null;
}

interface Chain { start: Day; end: Day; count: number }

/** Splits climbing days (any order, duplicates allowed) into chains. */
function chainsOf(days: Iterable<Day>): Chain[] {
  const sorted = [...new Set(days)].sort();
  const out: Chain[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && daysBetween(last.end, d) <= STREAK_MAX_GAP) { last.end = d; last.count++; } else out.push({ start: d, end: d, count: 1 });
  }
  return out;
}

const span = (c: Chain): number => daysBetween(c.start, c.end) + 1;

/** The streak as of `today`. Days after today (a clock set back, an odd import) are ignored. */
export function streakInfo(climbingDays: Iterable<Day>, today: Day): StreakInfo {
  const chains = chainsOf([...climbingDays].filter((d) => d <= today));
  if (!chains.length) return { current: 0, span: 0, longest: 0, longestSpan: 0, state: "none", lastDay: null };
  // The best chain; on a tie the more recent one, which is the one the user will recognise.
  const best = chains.reduce((a, b) => (b.count >= a.count ? b : a));
  const last = chains[chains.length - 1];
  const gap = daysBetween(last.end, today);
  const alive = gap <= STREAK_MAX_GAP;
  return {
    current: alive ? last.count : 0, span: alive ? span(last) : 0, longest: best.count, longestSpan: span(best),
    state: !alive ? "broken" : gap === 0 ? "today" : gap === 1 ? "rest" : "last", lastDay: last.end,
  };
}

/** How a day shows in the week dots and the calendar. */
export type DayMark = "climbed" | "rest" | "empty" | "future";

/**
 * The mark for each day from `from` to `to`. A rest day is a day with nothing logged that sits inside a chain, or right after the
 * latest chain while it is still alive, so it is the "hollow dot" that tells the user the streak is being kept.
 */
export function dayMarks(climbingDays: Iterable<Day>, today: Day, from: Day, to: Day): Map<Day, DayMark> {
  const days = new Set([...climbingDays].filter((d) => d <= today));
  const chains = chainsOf(days);
  const lastChain = chains[chains.length - 1];
  const keepsAlive = lastChain && daysBetween(lastChain.end, today) <= STREAK_MAX_GAP ? lastChain : null;
  const out = new Map<Day, DayMark>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d > today) out.set(d, "future");
    else if (days.has(d)) out.set(d, "climbed");
    else if (chains.some((c) => d > c.start && d < c.end) || (keepsAlive !== null && d > keepsAlive.end)) out.set(d, "rest");
    else out.set(d, "empty");
  }
  return out;
}

export interface WeekDot { day: Day; mark: DayMark }

/** The seven days of the week that holds `today` (Monday first), for the dots on the Climb tab. */
export function weekDots(climbingDays: Iterable<Day>, today: Day): WeekDot[] {
  const start = weekStartDay(today);
  const marks = dayMarks(climbingDays, today, start, addDays(start, 6));
  return [...marks].map(([day, mark]) => ({ day, mark }));
}

/** The last `weeks` weeks, oldest first, ending with the week of `today`: one row of seven marks per week. */
export function calendarWeeks(climbingDays: Iterable<Day>, today: Day, weeks = 8): WeekDot[][] {
  const lastStart = weekStartDay(today);
  const from = addDays(lastStart, -7 * (weeks - 1));
  const marks = dayMarks(climbingDays, today, from, addDays(lastStart, 6));
  const all = [...marks].map(([day, mark]) => ({ day, mark }));
  return Array.from({ length: weeks }, (_, i) => all.slice(i * 7, i * 7 + 7));
}

/** The state in words, never negative: a break shows the best streak instead. */
export function streakStateText(s: StreakInfo): string {
  switch (s.state) {
    case "today": return "Climbed today";
    case "rest": return "A rest day is fine today";
    case "last": return "Today keeps your streak going";
    case "broken": return `Longest: ${s.longest} ${s.longest === 1 ? "day" : "days"}`;
    default: return "Log a climb to start a streak";
  }
}

/** "9 days" and, when rest days are in it, "over 12 days" beside it. */
export function streakLabel(s: StreakInfo): string {
  if (s.current === 0) return "";
  const days = `${s.current} ${s.current === 1 ? "day" : "days"}`;
  return s.span > s.current ? `${days} over ${s.span}` : days;
}
