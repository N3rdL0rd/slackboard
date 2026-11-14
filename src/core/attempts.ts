/**
 * Working out when attempts happened, from what you already log, with nothing to press.
 *
 * Only logged attempts and sends make a window. Lighting a climb never does: you swipe through climbs lighting them without trying
 * them, and sometimes light one for someone else. A lighting only matters for a climb you then log, and then only as the earliest the
 * attempt could have started, because you cannot climb it before it is lit. The time you log it is the latest it could have ended.
 *
 * So a window is a pair of bounds, not a measurement. It is `bounded` when the climb was lit shortly before the log with nothing else
 * lit in between, and `estimated` otherwise (a typical length, ending when it was logged). The wording on screen must reflect that.
 * Everything is derived from the existing records, so editing or deleting a log corrects it. Pure, no storage.
 */
import { parseStamp } from "./days";

export const ATTEMPT = {
  /** A lighting older than this before the log says nothing useful about when the attempt began. */
  boundMaxSeconds: 20 * 60,
  /** What a try is assumed to take when there is nothing better, and the limits on any single window. */
  defaultPerTrySeconds: 120,
  minWindowSeconds: 30,
  maxWindowSeconds: 20 * 60,
  /** An estimate counts at most this many tries, so a long run of tries is not stretched without limit. */
  estimateTriesCap: 5,
  /** Entries further apart than this are different sessions. */
  sessionGapSeconds: 90 * 60,
  /** Bounded windows needed before their per-try times set what an estimated one assumes. */
  minBoundedForTypical: 3,
} as const;

/** The part of a logged entry that matters here. */
export interface AttemptInput { id: string; provider: string; climbUuid: string; climbedAt: string; bidCount: number; isSend: boolean }
/** A climb lit on the board. */
export interface LitPoint { provider: string; climbUuid: string; litAt: string }

export type WindowQuality = "bounded" | "estimated";
export interface AttemptWindow {
  id: string;
  provider: string;
  climbUuid: string;
  /** Milliseconds, local clock. For a bounded window `start` is the earliest the attempt could have begun. */
  start: number;
  end: number;
  tries: number;
  isSend: boolean;
  quality: WindowQuality;
}

const ms = (stamp: string) => parseStamp(stamp).getTime();
const seconds = (w: { start: number; end: number }) => Math.max(0, (w.end - w.start) / 1000);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The p-th share (0 to 1) of a list of numbers, by nearest rank. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** A window per logged entry, oldest first. */
export function attemptWindows(entries: AttemptInput[], lit: LitPoint[]): AttemptWindow[] {
  const sortedEntries = entries.map((e) => ({ e, t: ms(e.climbedAt) })).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t || a.e.id.localeCompare(b.e.id));
  const points = lit.map((p) => ({ p, t: ms(p.litAt) })).filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
  const minMs = ATTEMPT.minWindowSeconds * 1000;
  const boundMs = ATTEMPT.boundMaxSeconds * 1000;

  // First pass: bounded windows where the lighting allows, the rest left to estimate.
  type Pending = { e: AttemptInput; t: number; start: number | null; tries: number };
  const pending: Pending[] = [];
  let litIndex = -1; // the last lighting at or before the entry, advanced as entries move forward in time
  let prevEnd: number | null = null;
  for (const { e, t } of sortedEntries) {
    while (litIndex + 1 < points.length && points[litIndex + 1].t <= t) litIndex++;
    // The latest lighting of this climb counts only if nothing else was lit after it: otherwise the board was showing another climb.
    let start: number | null = null;
    let otherLitAfter = false;
    for (let j = litIndex; j >= 0 && points[j].t >= t - boundMs; j--) {
      const p = points[j].p;
      if (p.provider === e.provider && p.climbUuid === e.climbUuid) { start = otherLitAfter ? null : points[j].t; break; }
      otherLitAfter = true;
    }
    const tries = Math.max(1, e.bidCount);
    // A climb lit before the previous entry was logged cannot have been started before that entry ended.
    if (start !== null && prevEnd !== null) start = Math.max(start, prevEnd);
    pending.push({ e, t, start: start !== null && t - start >= minMs && t - start <= boundMs ? start : null, tries });
    prevEnd = t;
  }

  const boundedPerTry = pending.filter((x) => x.start !== null).map((x) => (x.t - (x.start as number)) / 1000 / x.tries);
  const perTry = boundedPerTry.length >= ATTEMPT.minBoundedForTypical
    ? clamp(percentile(boundedPerTry, 0.25), ATTEMPT.minWindowSeconds, ATTEMPT.maxWindowSeconds)
    : ATTEMPT.defaultPerTrySeconds;

  const windows: AttemptWindow[] = [];
  let before: number | null = null;
  for (const x of pending) {
    let start = x.start;
    let quality: WindowQuality = "bounded";
    if (start === null) {
      quality = "estimated";
      const length = clamp(Math.min(x.tries, ATTEMPT.estimateTriesCap) * perTry, ATTEMPT.minWindowSeconds, ATTEMPT.maxWindowSeconds) * 1000;
      start = x.t - length;
      // Not before the previous entry was logged, unless that leaves less than the shortest window.
      if (before !== null && start < before) start = Math.min(x.t - minMs, Math.max(start, before));
    }
    windows.push({ id: x.e.id, provider: x.e.provider, climbUuid: x.e.climbUuid, start, end: x.t, tries: x.tries, isSend: x.e.isSend, quality });
    before = x.t;
  }
  return windows;
}

export interface TimedSession {
  start: number;
  end: number;
  windows: AttemptWindow[];
  /** First bound to last, in seconds. */
  spanSeconds: number;
  climbs: number;
  tries: number;
  /** Time inside windows, overlaps counted once. An upper bound where windows are bounded, so say "about". */
  activeSeconds: number;
  /** The usual gap between one window's end and the next one's start, or null with fewer than two. */
  restSeconds: number | null;
  /** Attempts (tries) per hour of the session, or null for a session shorter than ten minutes. */
  triesPerHour: number | null;
  /** The climb that took the most time in the session, when more than one entry was on it. */
  project: { climbUuid: string; seconds: number; tries: number } | null;
  boundedShare: number;
}

function unionSeconds(ws: { start: number; end: number }[]): number {
  const sorted = [...ws].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const w of sorted) {
    if (w.start > curEnd) { if (curEnd > -Infinity) total += curEnd - curStart; curStart = w.start; curEnd = w.end; }
    else curEnd = Math.max(curEnd, w.end);
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return total / 1000;
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Windows grouped into sessions: entries separated by more than the session gap are different sessions. Oldest first. */
export function timedSessions(windows: AttemptWindow[]): TimedSession[] {
  const sorted = [...windows].sort((a, b) => a.end - b.end || a.id.localeCompare(b.id));
  const groups: AttemptWindow[][] = [];
  for (const w of sorted) {
    const g = groups[groups.length - 1];
    if (g && w.end - g[g.length - 1].end <= ATTEMPT.sessionGapSeconds * 1000) g.push(w);
    else groups.push([w]);
  }
  return groups.map((ws) => {
    const start = Math.min(...ws.map((w) => w.start));
    const end = Math.max(...ws.map((w) => w.end));
    const spanSeconds = (end - start) / 1000;
    const tries = ws.reduce((n, w) => n + w.tries, 0);
    const gaps: number[] = [];
    for (let i = 1; i < ws.length; i++) gaps.push(Math.max(0, (ws[i].start - ws[i - 1].end) / 1000));
    const perClimb = new Map<string, { seconds: number; tries: number; entries: number }>();
    for (const w of ws) {
      const row = perClimb.get(`${w.provider}:${w.climbUuid}`) ?? { seconds: 0, tries: 0, entries: 0 };
      row.seconds += seconds(w); row.tries += w.tries; row.entries++;
      perClimb.set(`${w.provider}:${w.climbUuid}`, row);
    }
    let project: TimedSession["project"] = null;
    for (const [key, row] of perClimb) if (row.entries > 1 && (!project || row.seconds > project.seconds)) project = { climbUuid: key.slice(key.indexOf(":") + 1), seconds: row.seconds, tries: row.tries };
    return {
      start, end, windows: ws, spanSeconds,
      climbs: new Set(ws.map((w) => `${w.provider}:${w.climbUuid}`)).size,
      tries,
      activeSeconds: unionSeconds(ws),
      restSeconds: gaps.length ? median(gaps) : null,
      triesPerHour: spanSeconds >= 600 ? tries / (spanSeconds / 3600) : null,
      project,
      boundedShare: ws.filter((w) => w.quality === "bounded").length / ws.length,
    };
  });
}

/** "45 s", "12 min", "1 h 05 min". Rounds to what is worth saying. */
export function durationText(secondsTotal: number): string {
  const s = Math.max(0, Math.round(secondsTotal));
  if (s < 90) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export interface SessionLines {
  /** One line for a day card's header. */
  headline: string;
  /** Everything else, for the open card. */
  details: string[];
  /** Said when most of the times are estimated from when entries were logged, so they are not read as measurements. */
  note: string | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The words for a session. Always "about": the times are bounds and estimates, never measurements. */
export function sessionLines(s: TimedSession, nameOf: (climbUuid: string) => string | null): SessionLines {
  const headline = `About ${durationText(s.spanSeconds)} on the board \u00B7 ${plural(s.climbs, "climb", "climbs")}`;
  const details: string[] = [];
  details.push(`${plural(s.tries, "try", "tries")} on ${plural(s.climbs, "climb", "climbs")}`);
  const climbing = Math.min(s.activeSeconds, s.spanSeconds);
  if (s.spanSeconds >= 300 && s.windows.length >= 2) details.push(`About ${durationText(climbing)} of it climbing`);
  if (s.restSeconds !== null && s.restSeconds >= 30) details.push(`Rests of about ${durationText(s.restSeconds)} between climbs`);
  if (s.triesPerHour !== null) details.push(`About ${Math.round(s.triesPerHour)} ${Math.round(s.triesPerHour) === 1 ? "try" : "tries"} an hour`);
  if (s.project) {
    const name = nameOf(s.project.climbUuid);
    if (name) details.push(`Most time on ${name}: about ${durationText(s.project.seconds)}, ${plural(s.project.tries, "try", "tries")}`);
  }
  return { headline, details, note: s.boundedShare < 0.5 ? "Estimated from when you logged." : null };
}
