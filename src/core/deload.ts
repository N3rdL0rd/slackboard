/**
 * Spotting that a lighter week might help. Built on the same load model as the rest nudges and the weekly review, so they agree. It only
 * suggests: the user decides, and a suggestion that is not wanted stays away for a week. Rules of thumb, not training science.
 *
 * A lighter week is suggested when any of these shows:
 * - the load has gone up three weeks running, and the last full week is well above the usual;
 * - the week just gone, or this one so far, is a spike against the usual;
 * - four or more hard days in the last seven;
 * - the last few training sessions were rated very hard.
 * Nothing is suggested without three weeks of history, in a week that is already light, or when the plan already has a light week now.
 */
import type { Activity } from "./activity";
import { addDays, dayOf, daysBetween, weekStartDay, type Day } from "./days";
import { baselineLoad, isHardDay, isSpike, loadByDay, LOAD, typicalDayEntries, weekLoad, type WorkingGrades } from "./load";
import type { Plan } from "./planner";
import type { TrainingEntry } from "./training";

export const DELOAD = {
  /** Weeks of rising load that count as a run. */
  risingWeeks: 3,
  /** The last full week must be this many times the usual for a rising run to count. */
  risingRatio: 1.25,
  /** Hard days in the last seven that count as too many. */
  hardDays: 4,
  /** Training sessions looked at, how recent, and the average effort that counts as very hard. */
  effortSessions: 3,
  effortDays: 14,
  veryHardEffort: 8.5,
  /** Weeks with any load, among the three before this one, needed before anything is suggested. */
  minWeeksWithLoad: 2,
  /** A week at or below this share of the usual already was a light one. */
  lightShare: 0.6,
  /** A dismissed suggestion stays away this many days. */
  snoozeDays: 7,
} as const;

export const DELOAD_KEY = "deload";

export interface DeloadAdvice { reasons: string[] }

export interface DeloadInput {
  activities: Activity[];
  training: TrainingEntry[];
  working: WorkingGrades;
  today: Day;
  /** The plan already has a light week now, so another is not offered. */
  inLightWeek: boolean;
}

/** The reasons a lighter week might help, or null when nothing calls for it. */
export function deloadAdvice(input: DeloadInput): DeloadAdvice | null {
  const { activities, training, working, today } = input;
  if (input.inLightWeek) return null;
  const byDay = loadByDay(activities, working);
  const thisWeek = weekStartDay(today);
  const last = addDays(thisWeek, -7);
  const loads = [1, 2, 3].map((i) => weekLoad(byDay, addDays(thisWeek, -7 * i)));
  if (loads.filter((n) => n > 0).length < DELOAD.minWeeksWithLoad) return null;

  const usual = baselineLoad(byDay, last);
  // A week that was already light needs no second one.
  if (loads[0] <= DELOAD.lightShare * usual) return null;

  const reasons: string[] = [];
  if (loads[2] < loads[1] && loads[1] < loads[0] && loads[0] > LOAD.baselineFloor && loads[0] >= DELOAD.risingRatio * usual) reasons.push("Your load has gone up three weeks in a row.");
  if (isSpike(byDay, last) || isSpike(byDay, thisWeek)) reasons.push("You are doing a lot more than your usual.");

  const from = addDays(today, -6);
  const days = new Map<Day, Activity[]>();
  for (const a of activities) if (a.day >= from && a.day <= today) (days.get(a.day) ?? days.set(a.day, []).get(a.day)!).push(a);
  const typical = typicalDayEntries(activities);
  const hard = [...days.values()].filter((entries) => isHardDay(entries, working, typical)).length;
  if (hard >= DELOAD.hardDays) reasons.push(`${hard} hard days in the last week.`);

  const rated = training
    .filter((e) => e.effort !== null && dayOf(e.performedAt) <= today && daysBetween(dayOf(e.performedAt), today) <= DELOAD.effortDays)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, DELOAD.effortSessions);
  if (rated.length >= DELOAD.effortSessions) {
    const avg = rated.reduce((n, e) => n + (e.effort ?? 0), 0) / rated.length;
    if (avg >= DELOAD.veryHardEffort) reasons.push(`Your last sessions felt very hard, about ${Math.round(avg * 10) / 10} out of 10.`);
  }
  return reasons.length ? { reasons } : null;
}

/** The day a dismissed suggestion may come back. */
export const snoozeUntil = (today: Day): Day => addDays(today, DELOAD.snoozeDays);

/** The plan already has a light week now: a scheduled deload week, or every session still to do this week is light. */
export function planIsLightNow(plan: Plan | null, today: Day): boolean {
  if (!plan || plan.status !== "active") return false;
  if (plan.block.deloadWeeks.includes(Math.floor(daysBetween(plan.startDay, today) / 7) + 1)) return true;
  const start = weekStartDay(today);
  const mine = plan.sessions.filter((s) => s.status === "planned" && s.day >= start && s.day <= addDays(start, 6));
  return mine.length > 0 && mine.every((s) => s.light);
}
