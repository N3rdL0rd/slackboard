/**
 * Days, the way the whole app counts them. A **day** is a local calendar date, written `yyyy-MM-dd`; a **stamp** is `yyyy-MM-dd HH:mm:ss`
 * (the server also sends microseconds after it) in the phone's local time at the moment something was logged. Every streak, review, goal
 * and plan is built on these, so there is exactly one copy of the rules:
 *
 * - A day comes from the entry's own date and time, in local time, never from elapsed milliseconds.
 * - Calendar arithmetic uses the parts of a date (year, month, day), never "add 24 hours", so a daylight-saving change cannot move a day.
 * - Weeks start on Monday.
 */

export type Day = string;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A stamp as a local Date. Server times are local, so they must not be read as UTC. */
export const parseStamp = (stamp: string): Date => new Date(stamp.replace(" ", "T"));

/** The local day of a stamp or a Date. */
export function dayOf(value: string | Date): Day {
  if (typeof value === "string") {
    // A stamp already starts with its day, and reading it directly avoids any time zone conversion.
    const m = /^(\d{4}-\d{2}-\d{2})[ T]/.exec(value);
    if (m) return m[1];
    value = parseStamp(value);
  }
  return `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** `yyyy-MM-dd HH:mm:ss` in local time. */
export const stampOf = (d: Date): string => `${dayOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** True for a real calendar date written `yyyy-MM-dd`. */
export function isDay(value: string): boolean {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function parts(day: Day): [number, number, number] {
  const m = DAY_RE.exec(day);
  if (!m) throw new Error(`Not a day: ${day}`);
  return [+m[1], +m[2], +m[3]];
}

/** Local midnight at the start of a day. */
export function dayStart(day: Day): Date {
  const [y, m, d] = parts(day);
  return new Date(y, m - 1, d);
}

/** The day `n` days after (or before, when negative) `day`. Always a calendar step, whatever the clocks did in between. */
export function addDays(day: Day, n: number): Day {
  const [y, m, d] = parts(day);
  // UTC has no daylight saving, so the calendar arithmetic is exact.
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: Day, b: Day): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayOf(day: Day): number {
  const [y, m, d] = parts(day);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week that holds `day`. */
export const weekStartDay = (day: Day): Day => addDays(day, -weekdayOf(day));

/** The first day of the month that holds `day`. */
export const monthStartDay = (day: Day): Day => `${day.slice(0, 7)}-01`;

/** Midnight at the start of the local week (Monday) that holds `d`. */
export const weekStart = (d: Date): Date => dayStart(weekStartDay(dayOf(d)));

/** The seven days of the week that starts on `start`. */
export const weekDays = (start: Day): Day[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** Every day from `from` to `to`, inclusive. Empty when `to` is before `from`. */
export function eachDay(from: Day, to: Day): Day[] {
  const n = daysBetween(from, to);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/** Distinct days, ascending. */
export const uniqueDays = (days: Iterable<Day>): Day[] => [...new Set(days)].sort();
