/**
 * A deliberately simple, explainable idea of how much the user has done: one number per day and per week, plus "was that a hard day".
 * The rest nudges, the weekly review and the training planner all read it, so they agree. It is rough on purpose; it exists to give
 * gentle advice, never to measure anyone. Every constant is named here so the rules can be read and tuned in one place.
 */
import type { Activity, Discipline } from "./activity";
import { addDays, type Day } from "./days";

export const LOAD = {
  /** Points for one send, and for one attempts-only entry. */
  sendPoints: 1,
  attemptPoints: 0.5,
  /** Each extra try on an entry adds this share of its points, up to `maxTries` tries. */
  extraTryShare: 0.25,
  maxTries: 5,
  /** Extra points for a send at or above the user's working grade in that discipline. */
  hardSendBonus: 1,
  /** A training entry is worth this per set (up to `maxTries` sets), doubled for finger-intense work. */
  trainingSetPoints: 0.5,
  fingerMultiplier: 2,
  /** A day's load is scaled by the highest effort rating (1 to 10) logged that day: 5 leaves it unchanged. */
  effortBase: 0.6,
  effortStep: 0.08,
  /** The recent baseline is the average of this many weeks, never below the floor, so a quiet month does not make a normal week look huge. */
  baselineWeeks: 4,
  baselineFloor: 6,
  /** A week is a spike when its load is more than this many times the baseline. */
  spikeRatio: 1.5,
  /** A day is hard when the user rated it at least this high. */
  hardEffort: 7,
  /** A day is long when it holds at least this many entries and this many times the user's typical day. */
  longDayMinEntries: 8,
  longDayFactor: 2,
} as const;

/** The user's current working grade in each discipline, on that discipline's own scale. Null or missing means not known. */
export type WorkingGrades = Partial<Record<Discipline, number | null>>;

const entryPoints = (a: Activity, working: WorkingGrades): number => {
  const f = a.facts;
  const tries = Math.min(Math.max(1, f.tries), LOAD.maxTries);
  if (f.discipline === "training") return LOAD.trainingSetPoints * tries * (f.fingerIntense ? LOAD.fingerMultiplier : 1);
  const base = f.send ? LOAD.sendPoints : LOAD.attemptPoints;
  const w = working[f.discipline];
  const hard = f.send && f.grade !== null && w != null && f.grade >= w ? LOAD.hardSendBonus : 0;
  return base * (1 + LOAD.extraTryShare * (tries - 1)) + hard;
};

/** The multiplier for a day's highest effort rating, or 1 when none was given. */
export const effortMultiplier = (effort: number | null): number => (effort === null ? 1 : LOAD.effortBase + LOAD.effortStep * effort);

/** The load of one day's entries. */
export function dayLoad(entries: Activity[], working: WorkingGrades = {}): number {
  const efforts = entries.map((a) => a.facts.effort).filter((e): e is number => e !== null);
  const raw = entries.reduce((n, a) => n + entryPoints(a, working), 0);
  return raw * effortMultiplier(efforts.length ? Math.max(...efforts) : null);
}

/** The load of every day that has entries. */
export function loadByDay(list: Activity[], working: WorkingGrades = {}): Map<Day, number> {
  const days = new Map<Day, Activity[]>();
  for (const a of list) (days.get(a.day) ?? days.set(a.day, []).get(a.day)!).push(a);
  return new Map([...days].map(([day, entries]) => [day, dayLoad(entries, working)]));
}

/** The load of the seven days starting on `weekStart` (a Monday). */
export function weekLoad(byDay: Map<Day, number>, weekStart: Day): number {
  let n = 0;
  for (let i = 0; i < 7; i++) n += byDay.get(addDays(weekStart, i)) ?? 0;
  return n;
}

/** The usual week: the average of the `baselineWeeks` weeks before `weekStart`, and never less than the floor. */
export function baselineLoad(byDay: Map<Day, number>, weekStart: Day): number {
  let total = 0;
  for (let w = 1; w <= LOAD.baselineWeeks; w++) total += weekLoad(byDay, addDays(weekStart, -7 * w));
  return Math.max(LOAD.baselineFloor, total / LOAD.baselineWeeks);
}

/** True when the week is a lot bigger than the user's usual. A week below the floor is never a spike. */
export function isSpike(byDay: Map<Day, number>, weekStart: Day): boolean {
  const load = weekLoad(byDay, weekStart);
  return load > LOAD.baselineFloor && load > LOAD.spikeRatio * baselineLoad(byDay, weekStart);
}

/** How many entries the user logs on a usual climbing day: the median over the days that have any. */
export function typicalDayEntries(list: Activity[]): number {
  const counts = new Map<Day, number>();
  for (const a of list) counts.set(a.day, (counts.get(a.day) ?? 0) + 1);
  const sorted = [...counts.values()].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * A hard day: a send at or above the user's working grade, a high effort rating, finger-intensive training, or an unusually long day.
 * Attempts-only entries have no grade to compare, so on their own they do not make a day hard.
 */
export function isHardDay(entries: Activity[], working: WorkingGrades = {}, typicalEntries = 0): boolean {
  if (!entries.length) return false;
  if (entries.some((a) => a.facts.fingerIntense)) return true;
  if (entries.some((a) => (a.facts.effort ?? 0) >= LOAD.hardEffort)) return true;
  if (entries.some((a) => {
    const w = working[a.facts.discipline];
    return a.facts.send && a.facts.grade !== null && w != null && a.facts.grade >= w;
  })) return true;
  return entries.length >= LOAD.longDayMinEntries && entries.length >= LOAD.longDayFactor * typicalEntries;
}
