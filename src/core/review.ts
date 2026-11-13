/**
 * Weekly and yearly reviews, computed from the entries when they are opened, with the same helpers the stats, the streak and the rest
 * nudge use, so they always agree with them. Pure. A review is a plain account of what was logged: an empty week says so and nothing
 * else, and nothing here compares the user with anyone or says they are behind.
 */
import { ACTIVITY_KINDS, ropedLogOf, type Activity } from "./activity";
import { AREAS, AREA_LABEL, type DayNote } from "./body";
import { addDays, dayOf, weekStartDay, type Day } from "./days";
import { measure, type Goal, type GoalContext } from "./goals";
import { baselineLoad, loadByDay, weekLoad, type WorkingGrades } from "./load";
import { sendsIn } from "./logTimeline";
import { vOf } from "./milestones";
import { streakInfo, type StreakInfo } from "./streak";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How the user's notation writes a boulder grade (a V number) and a roped grade (an IRCRA number). */
export interface ReviewLabels {
  boulder: (v: number) => string;
  roped: (ircra: number) => string;
}

const isBoulder = (a: Activity) => a.kind === "board" || a.kind === "offBoard";
const boulderV = (a: Activity): number | null => (isBoulder(a) && a.facts.send && a.facts.grade !== null ? vOf(a.facts.grade) : null);
const ropedGrade = (a: Activity): number | null => (a.kind === "roped" && a.facts.send && a.facts.grade !== null ? a.facts.grade : null);
const best = (xs: (number | null)[]): number | null => { const n = xs.filter((x): x is number => x !== null); return n.length ? Math.max(...n) : null; };
const inRange = (a: Activity, from: Day, to: Day) => a.day >= from && a.day <= to;

// ---- Weekly -------------------------------------------------------------------------------------------------------------------

export interface ReviewGoalLine { title: string; summary: string; reached: boolean }

export interface WeeklyReview {
  weekStart: Day;
  weekEnd: Day;
  /** Nothing logged in the week. */
  empty: boolean;
  /** Climbing days: any day with a climb or training. */
  days: number;
  sends: number;
  /** Tries on climbs (a flash is one try). */
  attempts: number;
  hardestBoulder: number | null;
  hardestRoped: number | null;
  /** Set only when the week's hardest is above everything sent before it. */
  newHardestBoulder: number | null;
  newHardestRoped: number | null;
  trainingEntries: number;
  trainingDays: number;
  streak: StreakInfo;
  /** The week's load against the average of the four weeks before, in plain words, or null when there is nothing to compare with. */
  compare: string | null;
  highlight: string | null;
  body: string | null;
  goals: ReviewGoalLine[];
}

/** "A bit more than usual": the week's load against the usual week. */
export function compareText(load: number, baseline: number): string {
  const ratio = load / baseline;
  if (ratio < 0.6) return "A lot lighter than usual.";
  if (ratio < 0.9) return "A bit lighter than usual.";
  if (ratio <= 1.1) return "About your usual.";
  if (ratio <= 1.4) return "A bit more than usual.";
  return "A lot more than usual.";
}

/** Body check-ins in the week as a sentence per area: "Fingers sore on 2 days. Elbows hurt on 1 day." Null when nothing was off. */
export function bodySummary(notes: DayNote[], from: Day, to: Day): string | null {
  const mine = notes.filter((n) => n.day >= from && n.day <= to);
  const parts: string[] = [];
  for (const area of AREAS) {
    const hurts = mine.filter((n) => n[area] === "hurts").length;
    const sore = mine.filter((n) => n[area] === "sore").length;
    if (hurts) parts.push(`${AREA_LABEL[area]} hurt on ${plural(hurts, "day")}.`);
    if (sore) parts.push(`${AREA_LABEL[area]} sore on ${plural(sore, "day")}.`);
  }
  return parts.length ? parts.join(" ") : null;
}

export interface WeeklyInput {
  activities: Activity[];
  notes: DayNote[];
  goals: Goal[];
  today: Day;
  /** Any day in the week to review; it is rounded back to the Monday. */
  day: Day;
  labels: ReviewLabels;
  working?: WorkingGrades;
}

export function weeklyReview(input: WeeklyInput): WeeklyReview {
  const { activities, today, labels } = input;
  const weekStart = weekStartDay(input.day);
  const weekEnd = addDays(weekStart, 6);
  const week = activities.filter((a) => inRange(a, weekStart, weekEnd));
  const before = activities.filter((a) => a.day < weekStart);
  const climbing = week.filter((a) => ACTIVITY_KINDS[a.kind].countsTowardStreak);
  const nonTraining = week.filter((a) => a.kind !== "training");

  const hardestBoulder = best(week.map(boulderV));
  const hardestRoped = best(week.map(ropedGrade));
  const boulderBefore = best(before.map(boulderV));
  const ropedBefore = best(before.map(ropedGrade));
  const newHardestBoulder = hardestBoulder !== null && boulderBefore !== null && hardestBoulder > boulderBefore ? hardestBoulder : null;
  const newHardestRoped = hardestRoped !== null && ropedBefore !== null && hardestRoped > ropedBefore ? hardestRoped : null;

  const byDay = loadByDay(activities, input.working ?? {});
  const baseline = baselineLoad(byDay, weekStart);
  const priorTotal = [1, 2, 3, 4].reduce((n, w) => n + weekLoad(byDay, addDays(weekStart, -7 * w)), 0);
  const compare = week.length > 0 && priorTotal > 0 ? compareText(weekLoad(byDay, weekStart), baseline) : null;

  // The climb done most often this week, when it was done more than once.
  const counts = new Map<string, number>();
  for (const a of nonTraining) counts.set(a.title, (counts.get(a.title) ?? 0) + 1);
  const repeated = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const highlight = newHardestBoulder !== null ? `A new hardest boulder: ${labels.boulder(newHardestBoulder)}.`
    : newHardestRoped !== null ? `A new hardest route: ${labels.roped(newHardestRoped)}.`
    : repeated && repeated[1] >= 2 ? `Most repeated: ${repeated[0]}, ${plural(repeated[1], "time")}.` : null;

  const through = today < weekEnd ? today : weekEnd;
  const streak = streakInfo(activities.filter((a) => ACTIVITY_KINDS[a.kind].countsTowardStreak && a.day <= through).map((a) => a.day), through);

  const goalCtx: GoalContext = { activities, today, labels: { boulder: labels.boulder, roped: labels.roped } };
  const goals: ReviewGoalLine[] = [];
  for (const g of input.goals) {
    if (g.status === "achieved" && g.achievedAt && dayOf(g.achievedAt) >= weekStart && dayOf(g.achievedAt) <= weekEnd) goals.push({ title: g.title, summary: "Reached this week", reached: true });
    else if (g.status === "active" && today >= weekStart && today <= weekEnd) goals.push({ title: g.title, summary: measure(g, goalCtx).summary, reached: false });
  }

  return {
    weekStart, weekEnd, empty: week.length === 0,
    days: new Set(climbing.map((a) => a.day)).size,
    sends: nonTraining.reduce((n, a) => n + sendsIn(a), 0),
    attempts: nonTraining.reduce((n, a) => n + a.facts.tries, 0),
    hardestBoulder, hardestRoped, newHardestBoulder, newHardestRoped,
    trainingEntries: week.filter((a) => a.kind === "training").length,
    trainingDays: new Set(week.filter((a) => a.kind === "training").map((a) => a.day)).size,
    streak, compare, highlight, body: bodySummary(input.notes, weekStart, weekEnd), goals,
  };
}

/** The Monday notification: "Your week is ready: 4 days, 11 sends, a new V4." Null for a week with nothing in it. */
export function reviewNotificationText(r: WeeklyReview, labels: ReviewLabels): string | null {
  if (r.empty) return null;
  const parts = [plural(r.days, "day")];
  if (r.sends > 0) parts.push(plural(r.sends, "send"));
  if (r.newHardestBoulder !== null) parts.push(`a new ${labels.boulder(r.newHardestBoulder)}`);
  else if (r.newHardestRoped !== null) parts.push(`a new ${labels.roped(r.newHardestRoped)}`);
  else if (r.trainingEntries > 0) parts.push(plural(r.trainingEntries, "training entry", "training entries"));
  return `Your week is ready: ${parts.join(", ")}.`;
}

// ---- Yearly -------------------------------------------------------------------------------------------------------------------

export interface YearlyReview {
  year: number;
  empty: boolean;
  days: number;
  sends: number;
  attempts: number;
  /** Entries by kind. */
  byKind: { board: number; offBoard: number; roped: number; training: number };
  /** Boulder sends by V grade and roped sends by IRCRA number, hardest first. */
  pyramid: { boulder: { grade: number; count: number }[]; roped: { grade: number; count: number }[] };
  /** For each month, the climbing days in it (as days of the month). */
  months: { month: number; days: number[] }[];
  /** The hardest boulder send (a V number) of each month, null for a month without one. */
  progression: (number | null)[];
  longestStreak: number;
  bestWeek: { weekStart: Day; days: number; sends: number } | null;
  topClimbs: { title: string; count: number }[];
  topPlace: { name: string; count: number } | null;
  hardestBoulder: { grade: number; day: Day } | null;
  hardestRoped: { grade: number; day: Day } | null;
  /** The first send of each grade that happened this year, hardest first. */
  firsts: { text: string; day: Day }[];
  /** Total-send landmarks crossed this year (100th send, and so on). */
  sendMilestones: { count: number; day: Day }[];
  goalsReached: { title: string; day: Day }[];
}

const SEND_LANDMARKS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function tally<T>(items: T[], key: (t: T) => string | null): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) { const k = key(i); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function yearlyReview(input: { activities: Activity[]; goals: Goal[]; year: number; labels: ReviewLabels }): YearlyReview {
  const { activities, year, labels } = input;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const inYear = activities.filter((a) => inRange(a, from, to));
  const nonTraining = inYear.filter((a) => a.kind !== "training");
  const climbingDays = [...new Set(inYear.filter((a) => ACTIVITY_KINDS[a.kind].countsTowardStreak).map((a) => a.day))].sort();

  const pyr = (g: (a: Activity) => number | null) => tally(inYear, (a) => { const v = g(a); return v === null ? null : String(v); })
    .map((t) => ({ grade: Number(t.key), count: t.count })).sort((a, b) => b.grade - a.grade);

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, days: climbingDays.filter((d) => Number(d.slice(5, 7)) === i + 1).map((d) => Number(d.slice(8, 10))) }));
  const progression = months.map((m) => best(inYear.filter((a) => Number(a.day.slice(5, 7)) === m.month).map(boulderV)));

  // The week with the most climbing days (then sends).
  const weeks = new Map<Day, { days: Set<Day>; sends: number }>();
  for (const a of inYear) {
    const ws = weekStartDay(a.day);
    const w = weeks.get(ws) ?? weeks.set(ws, { days: new Set(), sends: 0 }).get(ws)!;
    if (ACTIVITY_KINDS[a.kind].countsTowardStreak) w.days.add(a.day);
    w.sends += a.kind === "training" ? 0 : sendsIn(a);
  }
  const bestWeek = [...weeks].map(([weekStart, w]) => ({ weekStart, days: w.days.size, sends: w.sends })).sort((a, b) => b.days - a.days || b.sends - a.sends || a.weekStart.localeCompare(b.weekStart))[0] ?? null;

  const places = tally(inYear, (a) => ropedLogOf(a)?.venue || (a.kind === "offBoard" ? ((a.ref as { venue?: string }).venue || null) : null));
  const tops = tally(nonTraining, (a) => a.title).filter((t) => t.count >= 2).slice(0, 5);

  const hardest = (g: (a: Activity) => number | null): { grade: number; day: Day } | null => {
    let out: { grade: number; day: Day } | null = null;
    for (const a of inYear) { const v = g(a); if (v !== null && (out === null || v > out.grade || (v === out.grade && a.day < out.day))) out = { grade: v, day: a.day }; }
    return out;
  };

  // First send of a grade ever, kept if it fell in this year.
  const firsts: YearlyReview["firsts"] = [];
  for (const [g, label, kind] of [[boulderV, labels.boulder, "boulder"], [ropedGrade, labels.roped, "route"]] as const) {
    const first = new Map<number, Day>();
    for (const a of [...activities].sort((x, y) => x.at.localeCompare(y.at))) { const v = g(a); if (v !== null && !first.has(v)) first.set(v, a.day); }
    for (const [v, day] of first) if (day >= from && day <= to) firsts.push({ text: `First ${label(v)} ${kind}`, day });
  }
  firsts.sort((a, b) => a.day.localeCompare(b.day));

  const sendMilestones: YearlyReview["sendMilestones"] = [];
  let total = 0;
  for (const a of [...activities].filter((x) => x.kind !== "training").sort((x, y) => x.at.localeCompare(y.at))) {
    const before = total;
    total += sendsIn(a);
    for (const m of SEND_LANDMARKS) if (before < m && total >= m && a.day >= from && a.day <= to) sendMilestones.push({ count: m, day: a.day });
  }

  const goalsReached = input.goals.filter((g) => g.status === "achieved" && g.achievedAt && dayOf(g.achievedAt) >= from && dayOf(g.achievedAt) <= to).map((g) => ({ title: g.title, day: dayOf(g.achievedAt!) }));

  const hb = hardest(boulderV);
  const hr = hardest(ropedGrade);
  return {
    year, empty: inYear.length === 0, days: climbingDays.length,
    sends: nonTraining.reduce((n, a) => n + sendsIn(a), 0), attempts: nonTraining.reduce((n, a) => n + a.facts.tries, 0),
    byKind: { board: inYear.filter((a) => a.kind === "board").length, offBoard: inYear.filter((a) => a.kind === "offBoard").length, roped: inYear.filter((a) => a.kind === "roped").length, training: inYear.filter((a) => a.kind === "training").length },
    pyramid: { boulder: pyr(boulderV), roped: pyr(ropedGrade) },
    months, progression,
    longestStreak: streakInfo(climbingDays, climbingDays.length ? climbingDays[climbingDays.length - 1] : to).longest,
    bestWeek, topClimbs: tops.map((t) => ({ title: t.key, count: t.count })), topPlace: places[0] ? { name: places[0].key, count: places[0].count } : null,
    hardestBoulder: hb, hardestRoped: hr, firsts, sendMilestones, goalsReached,
  };
}

/** The most recent year with an entry, or the current year when there is none. */
export function latestYear(activities: Activity[], today: Day): number {
  const years = activities.map((a) => Number(a.day.slice(0, 4)));
  return years.length ? Math.max(...years) : Number(today.slice(0, 4));
}

/** The years that have entries, newest first. */
export const yearsWithEntries = (activities: Activity[]): number[] => [...new Set(activities.map((a) => Number(a.day.slice(0, 4))))].sort((a, b) => b - a);
