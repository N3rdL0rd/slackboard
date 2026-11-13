/**
 * Local notifications, decided in one pure place. Given the logs, the settings and the time, `plan` returns the notifications that
 * should be scheduled for the next 14 days; `diff` compares that with what the phone already has and says what to cancel and what to
 * schedule. Nothing here touches the phone, so every rule is tested.
 *
 * The rules: every type is off until the user turns it on; one notification a day at most (the most time-sensitive wins); quiet hours;
 * a streak reminder only on the last day that keeps a streak alive and only if nothing is logged yet; a rest reminder only after a hard
 * day, that evening; a milestone at most weekly; a review only for a week that had something in it. There is never one for a missed
 * day, a broken streak or an inactive user. Identifiers are deterministic (`kind:day`), so scheduling twice changes nothing.
 */
import { ACTIVITY_KINDS, type Activity } from "./activity";
import type { DayNote } from "./body";
import { addDays, dayOf, dayStart, weekdayOf, weekStartDay, type Day } from "./days";
import { isHardDay, typicalDayEntries, type WorkingGrades } from "./load";
import type { Milestone } from "./milestones";
import { reviewNotificationText, weeklyReview, type ReviewLabels } from "./review";
import type { NotificationPrefs } from "./settings";
import { STREAK_MAX_GAP, type StreakInfo } from "./streak";

export type NotificationKind = "review" | "streak" | "rest" | "milestone";

export interface PlannedNotification {
  /** `kind:day`, so the same notification always has the same id. */
  id: string;
  kind: NotificationKind;
  /** The local day it fires on. */
  day: Day;
  fireAt: Date;
  title: string;
  body: string;
  /** Where tapping it goes. */
  route: string;
}

/** How far ahead notifications are scheduled. iOS keeps about 64 pending, so this stays small and is topped up whenever the app opens. */
export const HORIZON_DAYS = 14;
export const STREAK_TIME = "16:30";
export const REST_TIME = "19:30";
export const MILESTONE_TIME = "12:00";
/** A streak shorter than this isn't worth a reminder. */
export const MIN_STREAK_FOR_REMINDER = 3;
/** Wednesday, counting Monday as 0. */
export const MILESTONE_WEEKDAY = 2;

/** When two would fall on one day, the first in this list is kept: the streak reminder cannot wait, the milestone can. */
const PRIORITY: NotificationKind[] = ["streak", "rest", "review", "milestone"];

export const OUR_PREFIXES = PRIORITY.map((k) => `${k}:`);
export const isOurs = (id: string): boolean => OUR_PREFIXES.some((p) => id.startsWith(p));

/** A local time on a day. `time` is 24-hour "HH:mm". */
export function atTime(day: Day, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = dayStart(day);
  d.setHours(h, m, 0, 0);
  return d;
}

const minutes = (time: string): number => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

/** Whether a clock time is inside the quiet hours (which may run past midnight, like 21:00 to 08:00). */
export function isQuiet(date: Date, start: string, end: string): boolean {
  const t = date.getHours() * 60 + date.getMinutes();
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

/** The time a quiet-hours notification can move to: the end of the quiet hours, today if that is still ahead, else the next morning. */
export function afterQuiet(date: Date, start: string, end: string): Date {
  const day = dayOf(date);
  const sameDay = atTime(day, end);
  return sameDay > date ? sameDay : atTime(addDays(day, 1), end);
}

export interface PlanInput {
  now: Date;
  prefs: NotificationPrefs;
  activities: Activity[];
  notes: DayNote[];
  streak: StreakInfo;
  labels: ReviewLabels;
  working: WorkingGrades;
  /** The one milestone (or close goal) worth saying, or null. */
  milestone: Milestone | null;
}

/** What should be scheduled, soonest first. Only times still ahead of `now`, one per day. */
export function plan(input: PlanInput): PlannedNotification[] {
  const { now, prefs } = input;
  const today = dayOf(now);
  const horizonEnd = addDays(today, HORIZON_DAYS - 1);
  const out: PlannedNotification[] = [];
  const quiet = (d: Date) => isQuiet(d, prefs.quietStart, prefs.quietEnd);
  const add = (n: Omit<PlannedNotification, "id" | "day">, key: Day) => {
    if (n.fireAt <= now || dayOf(n.fireAt) > horizonEnd) return;
    out.push({ ...n, id: `${n.kind}:${key}`, day: dayOf(n.fireAt) });
  };

  // Streak: the last day that keeps it alive, if nothing is logged on that day yet.
  if (prefs.streak && input.streak.current >= MIN_STREAK_FOR_REMINDER && input.streak.lastDay) {
    const deadline = addDays(input.streak.lastDay, STREAK_MAX_GAP);
    const nothingYet = !input.activities.some((a) => a.day === deadline && ACTIVITY_KINDS[a.kind].countsTowardStreak);
    const fireAt = atTime(deadline, STREAK_TIME);
    if (deadline >= today && nothingYet && !quiet(fireAt)) {
      add({ kind: "streak", fireAt, title: "Keep your streak going", body: `Today keeps your ${input.streak.current}-day streak going.`, route: "/stats" }, deadline);
    }
  }

  // Rest: only that evening, only after a hard day. A rest day is advice, so it is never sent the next morning.
  if (prefs.rest) {
    const mine = input.activities.filter((a) => a.day === today);
    const fireAt = atTime(today, REST_TIME);
    if (isHardDay(mine, input.working, typicalDayEntries(input.activities)) && !quiet(fireAt)) {
      add({ kind: "rest", fireAt, title: "Nice session", body: "A rest day tomorrow helps you recover.", route: "/" }, today);
    }
  }

  // Review: Monday morning, for the week that just ended, and only if it had something in it.
  if (prefs.review) {
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const monday = addDays(today, i);
      if (weekdayOf(monday) !== 0) continue;
      const reviewed = addDays(weekStartDay(monday), -7);
      const text = reviewNotificationText(weeklyReview({ activities: input.activities, notes: input.notes, goals: [], today, day: reviewed, labels: input.labels, working: input.working }), input.labels);
      if (!text) continue;
      let fireAt = atTime(monday, prefs.reviewTime);
      if (quiet(fireAt)) fireAt = afterQuiet(fireAt, prefs.quietStart, prefs.quietEnd);
      add({ kind: "review", fireAt, title: "Your week", body: text, route: `/review?day=${reviewed}` }, monday);
    }
  }

  // Milestone: the single closest one, on the next Wednesday, so at most one a week.
  if (prefs.milestone && input.milestone) {
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const d = addDays(today, i);
      if (weekdayOf(d) !== MILESTONE_WEEKDAY) continue;
      const fireAt = atTime(d, MILESTONE_TIME);
      if (fireAt > now && !quiet(fireAt)) { add({ kind: "milestone", fireAt, title: "Almost there", body: input.milestone.text, route: "/" }, weekStartDay(d)); break; }
    }
  }

  // One a day: the most time-sensitive kind stays.
  const byDay = new Map<Day, PlannedNotification>();
  for (const n of out) {
    const have = byDay.get(n.day);
    if (!have || PRIORITY.indexOf(n.kind) < PRIORITY.indexOf(have.kind)) byDay.set(n.day, n);
  }
  return [...byDay.values()].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id));
}

/** A notification the phone already has scheduled, as far as the diff needs to know it. */
export interface ScheduledNotification { id: string; title: string; body: string; route: string; fireAtMs: number }

export interface NotificationDiff {
  /** Identifiers to cancel: ours that are no longer wanted, or whose content or time changed. */
  cancel: string[];
  /** To schedule: new ones, and the changed ones (after their old version is cancelled). */
  schedule: PlannedNotification[];
}

/** Compares what should be scheduled with what is. Anything that is not ours is left alone. Running it again after applying it gives nothing to do. */
export function diff(desired: PlannedNotification[], existing: ScheduledNotification[]): NotificationDiff {
  const have = new Map(existing.filter((e) => isOurs(e.id)).map((e) => [e.id, e]));
  const cancel: string[] = [];
  const schedule: PlannedNotification[] = [];
  const want = new Set(desired.map((d) => d.id));
  for (const id of have.keys()) if (!want.has(id)) cancel.push(id);
  for (const d of desired) {
    const e = have.get(d.id);
    if (!e) { schedule.push(d); continue; }
    if (e.title !== d.title || e.body !== d.body || e.route !== d.route || e.fireAtMs !== d.fireAt.getTime()) { cancel.push(d.id); schedule.push(d); }
  }
  return { cancel, schedule };
}

/** Identifier of the one alert for the end of a rest in a session, which has no `kind:day` form because it is not part of the plan. */
export const REST_END_ID = "session-rest";

/** The alert for when a rest ends while the app is in the background, or null when there is nothing worth alerting about. */
export function restEndAlert(now: Date, remainingMs: number, next: string): { fireAt: Date; title: string; body: string } | null {
  if (remainingMs < 5_000) return null;
  return { fireAt: new Date(now.getTime() + remainingMs), title: "Rest is over", body: next };
}

/** Routes a tap may open. Anything else is ignored, so a notification can only ever lead somewhere the app chose. */
export const SAFE_ROUTE = /^\/(review(\?day=\d{4}-\d{2}-\d{2})?|stats|year-review)?$/;

/** The route in a notification's data, when it is one the app made. */
export function routeOf(data: unknown): string | null {
  const route = (data as { route?: unknown } | null)?.route;
  return typeof route === "string" && SAFE_ROUTE.test(route) ? route : null;
}
