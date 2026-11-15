/**
 * What the watch recorded, as the phone keeps it, and the arithmetic on it: how healthy each stream was, heart rate over a stretch of
 * time, and the formats a session can be exported in. Pure; storage is watchLocal.ts. This is developer data for now and nothing in the
 * app's normal screens reads it.
 */
import type { AttemptWindow } from "./attempts";
import type { ElevationSample, HrSample, MotionRow, WorkoutStats } from "./wear";

export type StreamKind = "hr" | "elevation" | "motion";
export const STREAM_KINDS: StreamKind[] = ["hr", "elevation", "motion"];

export interface WatchSession {
  id: string;
  /** Epoch milliseconds: when the watch says it started, or failing that the first sample. */
  startedAt: number;
  endedAt: number | null;
  mode: "workout" | "heart-rate" | null;
  stats: WorkoutStats;
}

/** One message that arrived: what it held and when it got here. Kept so the health of the link can be studied afterwards. */
export interface BatchRecord {
  session: string;
  kind: StreamKind;
  receivedAt: number;
  firstAt: number;
  lastAt: number;
  count: number;
  dropped: number;
}

export type LabelKind = "attempt-start" | "attempt-end" | "fall" | "rest";
export const LABEL_KINDS: LabelKind[] = ["attempt-start", "attempt-end", "fall", "rest"];
export const LABEL_WORDS: Record<LabelKind, string> = { "attempt-start": "Attempt starts", "attempt-end": "Attempt ends", fall: "Fell", rest: "Resting" };

/** A moment the person marked by hand, as ground truth for judging what the app detects. */
export interface SessionLabel { id: string; session: string; at: number; kind: LabelKind; note: string }

export interface SessionData {
  session: WatchSession;
  hr: HrSample[];
  elevation: ElevationSample[];
  motion: MotionRow[];
  labels: SessionLabel[];
  batches: BatchRecord[];
}

export const isLabelKind = (x: unknown): x is LabelKind => typeof x === "string" && (LABEL_KINDS as string[]).includes(x);

// ---- Stream health ---------------------------------------------------------------------------------------------------------------

export interface Gap { from: number; to: number; ms: number }

export interface StreamHealth {
  count: number;
  firstAt: number | null;
  lastAt: number | null;
  /** Typical time between samples, and the shortest and longest. Null with fewer than two samples. */
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  /** Stretches with no samples that are far longer than usual. */
  gaps: Gap[];
  /** Values the phone refused as impossible. */
  dropped: number;
}

/** A gap is longer than three typical intervals, and never shorter than this. */
export const MIN_GAP_MS = 5000;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** How a stream went, from the times of its samples (any order). */
export function streamHealth(times: number[], dropped = 0): StreamHealth {
  const t = [...times].sort((a, b) => a - b);
  if (t.length === 0) return { count: 0, firstAt: null, lastAt: null, medianMs: null, minMs: null, maxMs: null, gaps: [], dropped };
  const diffs: number[] = [];
  for (let i = 1; i < t.length; i++) diffs.push(t[i] - t[i - 1]);
  if (diffs.length === 0) return { count: 1, firstAt: t[0], lastAt: t[0], medianMs: null, minMs: null, maxMs: null, gaps: [], dropped };
  const med = median(diffs);
  const limit = Math.max(3 * med, MIN_GAP_MS);
  const gaps: Gap[] = [];
  for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > limit) gaps.push({ from: t[i - 1], to: t[i], ms: t[i] - t[i - 1] });
  return { count: t.length, firstAt: t[0], lastAt: t[t.length - 1], medianMs: med, minMs: Math.min(...diffs), maxMs: Math.max(...diffs), gaps, dropped };
}

export interface DeliveryHealth {
  batches: number;
  /** Time from the last sample in a batch to its arrival on the phone. Negative means the clocks disagree. */
  medianDelayMs: number | null;
  maxDelayMs: number | null;
  /** Batches that arrived after a batch of the same stream that was recorded later. */
  outOfOrder: number;
  /** Batches that arrived more than `LATE_MS` after their last sample: the watch was out of reach, or the link was slow. */
  late: number;
  dropped: number;
}

export const LATE_MS = 30_000;

export function deliveryHealth(batches: BatchRecord[]): DeliveryHealth {
  if (batches.length === 0) return { batches: 0, medianDelayMs: null, maxDelayMs: null, outOfOrder: 0, late: 0, dropped: 0 };
  const byArrival = [...batches].sort((a, b) => a.receivedAt - b.receivedAt);
  const delays = byArrival.map((b) => b.receivedAt - b.lastAt);
  let outOfOrder = 0;
  const newest = new Map<string, number>();
  for (const b of byArrival) {
    const prev = newest.get(b.kind);
    if (prev !== undefined && b.lastAt < prev) outOfOrder++;
    newest.set(b.kind, Math.max(prev ?? -Infinity, b.lastAt));
  }
  return {
    batches: batches.length,
    medianDelayMs: median(delays),
    maxDelayMs: Math.max(...delays),
    outOfOrder,
    late: delays.filter((d) => d > LATE_MS).length,
    dropped: batches.reduce((n, b) => n + b.dropped, 0),
  };
}

// ---- Heart rate over a stretch of time -------------------------------------------------------------------------------------------

export interface HrWindow {
  count: number;
  avg: number;
  min: number;
  peak: number;
  /** The first and the last reading in the stretch. */
  first: number;
  last: number;
  /** Peak minus the average of the first five seconds: how far it climbed. */
  rise: number;
}

/** Heart rate between two times (inclusive). Null when there is no reading in it. */
export function hrIn(hr: HrSample[], start: number, end: number): HrWindow | null {
  const inside = hr.filter((s) => s.at >= start && s.at <= end).sort((a, b) => a.at - b.at);
  if (inside.length === 0) return null;
  const bpms = inside.map((s) => s.bpm);
  const head = inside.filter((s) => s.at <= inside[0].at + 5000).map((s) => s.bpm);
  const peak = Math.max(...bpms);
  return {
    count: inside.length,
    avg: bpms.reduce((a, b) => a + b, 0) / bpms.length,
    min: Math.min(...bpms),
    peak,
    first: bpms[0],
    last: bpms[bpms.length - 1],
    rise: peak - head.reduce((a, b) => a + b, 0) / head.length,
  };
}

/** A logged attempt that fell inside a session, with the heart rate during it. */
export interface LinkedAttempt { window: AttemptWindow; hr: HrWindow | null }

/**
 * The logged attempt windows that overlap a session, with the heart rate in each. A window is a pair of bounds, not a measurement (see
 * attempts.ts), so this is the heart rate between the bounds, which can include rest around the real attempt.
 */
export function linkAttempts(windows: AttemptWindow[], session: { startedAt: number; endedAt: number | null }, hr: HrSample[]): LinkedAttempt[] {
  const end = session.endedAt ?? (hr.length ? Math.max(...hr.map((s) => s.at)) : session.startedAt);
  return windows
    .filter((w) => w.end >= session.startedAt && w.start <= end)
    .map((w) => ({ window: w, hr: hrIn(hr, w.start, w.end) }));
}

/** What a session came to, from its samples; the watch's own totals are kept apart in `WatchSession.stats`. */
export interface SessionOverview {
  durationMs: number;
  hr: HrWindow | null;
  /** Metres between the first and the last elevation sample, and between the lowest and the highest. */
  elevationNet: number | null;
  elevationRange: number | null;
}

export function sessionOverview(data: Pick<SessionData, "session" | "hr" | "elevation">): SessionOverview {
  const { session, hr, elevation } = data;
  const lastSample = Math.max(session.startedAt, ...hr.map((s) => s.at), ...elevation.map((s) => s.at));
  const end = session.endedAt ?? lastSample;
  const e = [...elevation].sort((a, b) => a.at - b.at);
  return {
    durationMs: Math.max(0, end - session.startedAt),
    hr: hr.length ? hrIn(hr, -Infinity, Infinity) : null,
    elevationNet: e.length ? e[e.length - 1].metres - e[0].metres : null,
    elevationRange: e.length ? Math.max(...e.map((x) => x.metres)) - Math.min(...e.map((x) => x.metres)) : null,
  };
}

// ---- Export ----------------------------------------------------------------------------------------------------------------------

const num = (v: number | null): string => (v === null ? "" : String(v));

/**
 * A session as CSV: one row per second, with every stream joined on the second it falls in. Heart rate and elevation can have several
 * samples in a second; the last is kept. Labels and notes go in their own columns.
 */
export function sessionCsv(d: SessionData): string {
  const sec = (t: number) => Math.floor(t / 1000);
  const rows = new Map<number, string[]>();
  const row = (t: number) => {
    const k = sec(t);
    let r = rows.get(k);
    if (!r) { r = new Array(12).fill(""); r[0] = String(k * 1000); rows.set(k, r); }
    return r;
  };
  for (const s of d.hr) row(s.at)[1] = String(s.bpm);
  for (const s of d.elevation) row(s.at)[2] = String(s.metres);
  for (const m of d.motion) {
    const r = row(m.at);
    [m.accRms, m.accMax, m.gyroRms, m.gyroMax, m.pressure, m.gx, m.gy, m.gz].forEach((v, i) => { r[3 + i] = num(v); });
  }
  for (const l of d.labels) {
    const r = row(l.at);
    r[11] = r[11] ? `${r[11]}; ${l.kind}${l.note ? ` (${l.note})` : ""}` : `${l.kind}${l.note ? ` (${l.note})` : ""}`;
  }
  const header = ["time_ms", "heart_rate", "elevation_m", "acc_rms", "acc_max", "gyro_rms", "gyro_max", "pressure_hpa", "gravity_x", "gravity_y", "gravity_z", "label"];
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...[...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

/** A session as JSON, with every sample and label. */
export function sessionJson(d: SessionData): string {
  return JSON.stringify({
    app: "slackboard-watch-session",
    version: 1,
    session: d.session,
    heartRate: d.hr,
    elevation: d.elevation,
    motion: d.motion,
    labels: d.labels,
    batches: d.batches,
  }, null, 2);
}
