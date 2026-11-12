import { dayOf, parseStamp, weekStart } from "./days";
import type { LogEntry } from "./types";

const DAY = 86_400_000;

export interface WeekPoint {
  /** Monday of the week, local. */
  start: Date;
  sends: number;
  attempts: number;
  /** Hardest send that week, on the shared grade scale, or null. */
  best: number | null;
  /** Working grade: the average of the three hardest sends in the trailing window ending this week, or null. */
  working: number | null;
}

export interface Overview {
  sends: number;
  /** Total tries: the attempts on sends plus attempts-only records. */
  attempts: number;
  uniqueClimbs: number;
  /** Distinct days with something logged. */
  sessions: number;
  /** Share of sends that took one try, 0..1; null with no sends. */
  flashRate: number | null;
  hardest: { name: string; grade: number; provider: string; climbedAt: string; angle: number } | null;
  last30: { sends: number; sessions: number };
  /** Consecutive weeks, ending this one (or last), with something logged. */
  streakWeeks: number;
  /** Sends by whole V grade on the shared scale, ascending. */
  byGrade: { v: number; sends: number }[];
  weeks: WeekPoint[];
  /** Working grade now (shared scale), or null. */
  working: number | null;
  /** Change in working grade over the last `WORKING_WINDOW` weeks, in V grades; null without enough data. */
  trend: number | null;
}

export const WORKING_WINDOW = 8;
export const WEEKS_SHOWN = 26;

/**
 * Summarise a logbook, which may mix providers. `gradeOf` maps an entry to the shared grade scale (V plus a fraction) using its
 * own provider's table, so grades from different boards compare. Entries with no logged grade count as sessions and attempts
 * but cannot place on the grade charts.
 */
export function overview(entries: LogEntry[], now: Date, gradeOf: (e: LogEntry) => number, weeksShown = WEEKS_SHOWN): Overview {
  const sends = entries.filter((e) => e.isSend);
  // Each graded send with its grade on the shared scale.
  const graded = sends.filter((e) => e.difficulty > 0).map((e) => ({ e, g: gradeOf(e) }));
  const attempts = entries.reduce((n, e) => n + Math.max(0, e.bidCount), 0);
  const uniqueClimbs = new Set(sends.map((e) => e.climbUuid)).size;
  const days = new Set(entries.map((e) => dayOf(e.climbedAt)));

  let hardest: Overview["hardest"] = null;
  for (const { e, g } of graded) if (!hardest || g > hardest.grade) hardest = { name: e.climbName, grade: g, provider: e.provider, climbedAt: e.climbedAt, angle: e.angle };

  const since = now.getTime() - 30 * DAY;
  const recent = entries.filter((e) => parseStamp(e.climbedAt).getTime() >= since);

  const byV = new Map<number, number>();
  for (const { g } of graded) { const v = Math.floor(g); byV.set(v, (byV.get(v) ?? 0) + 1); }

  // Weekly buckets from the first logged week to this one, so gaps show as empty weeks.
  const thisWeek = weekStart(now).getTime();
  const weekMs = new Map<number, LogEntry[]>();
  for (const e of entries) {
    const k = weekStart(parseStamp(e.climbedAt)).getTime();
    (weekMs.get(k) ?? weekMs.set(k, []).get(k)!).push(e);
  }
  const first = entries.length ? Math.min(...weekMs.keys()) : thisWeek;
  const weeks: WeekPoint[] = [];
  for (let t = first; t <= thisWeek; ) {
    const d = new Date(t);
    const rows = weekMs.get(t) ?? [];
    const ws = rows.filter((e) => e.isSend);
    const gs = ws.filter((e) => e.difficulty > 0).map(gradeOf);
    weeks.push({ start: d, sends: ws.length, attempts: rows.reduce((n, e) => n + Math.max(0, e.bidCount), 0), best: gs.length ? Math.max(...gs) : null, working: null });
    const next = new Date(d); next.setDate(next.getDate() + 7); t = next.getTime();
  }
  // Working grade: mean of the three hardest graded sends in the trailing window.
  const windowStart = (w: WeekPoint) => { const d = new Date(w.start); d.setDate(d.getDate() - 7 * (WORKING_WINDOW - 1)); return d.getTime(); };
  for (const w of weeks) {
    const lo = windowStart(w);
    const hi = w.start.getTime() + 7 * DAY;
    const top = graded.filter(({ e }) => { const t = parseStamp(e.climbedAt).getTime(); return t >= lo && t < hi; }).map(({ g }) => g).sort((a, b) => b - a).slice(0, 3);
    w.working = top.length ? top.reduce((a, b) => a + b, 0) / top.length : null;
  }
  const trailing = weeks.slice(-weeksShown);
  const last = trailing[trailing.length - 1]?.working ?? null;
  const prior = trailing.length > WORKING_WINDOW ? trailing[trailing.length - 1 - WORKING_WINDOW]?.working ?? null : null;

  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    const active = w.sends > 0 || w.attempts > 0;
    if (active) streak++;
    else if (i === weeks.length - 1) continue; // the current week may simply not have started yet
    else break;
  }

  return {
    sends: sends.length,
    attempts,
    uniqueClimbs,
    sessions: days.size,
    flashRate: sends.length ? sends.filter((e) => e.bidCount <= 1).length / sends.length : null,
    hardest,
    last30: { sends: recent.filter((e) => e.isSend).length, sessions: new Set(recent.map((e) => dayOf(e.climbedAt))).size },
    streakWeeks: streak,
    byGrade: [...byV.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => ({ v, sends: n })),
    weeks: trailing,
    working: last,
    trend: last != null && prior != null ? last - prior : null,
  };
}
