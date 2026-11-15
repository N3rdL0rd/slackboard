/**
 * An experimental detector for when an attempt starts and ends, from the watch's motion alone. It is a lab, not a feature: the
 * parameters are knobs to turn against what you labelled by hand, and nothing in the app's normal screens uses it. A one-second activity
 * score is smoothed; stretches above a threshold that last long enough are attempts, and attempts close together are merged (a short
 * rest inside a climb is not the end of it). Pure.
 */
import type { MotionRow } from "./wear";
import type { SessionLabel } from "./watchData";

export interface DetectorParams {
  /** Smoothed score above which the arm counts as climbing. */
  threshold: number;
  /** Seconds the score is averaged over. */
  smoothSec: number;
  /** Shortest stretch that counts as an attempt, in seconds. */
  minSec: number;
  /** Stretches closer than this are one attempt, in seconds. */
  mergeGapSec: number;
  /** How much rotation (rad/s) adds to the score next to acceleration (m/s2). */
  gyroWeight: number;
}

export const DEFAULT_DETECTOR: DetectorParams = { threshold: 1.5, smoothSec: 5, minSec: 6, mergeGapSec: 15, gyroWeight: 1 };

/** Ranges the lab's controls allow. */
export const DETECTOR_LIMITS: Record<keyof DetectorParams, { min: number; max: number; step: number }> = {
  threshold: { min: 0.2, max: 8, step: 0.1 },
  smoothSec: { min: 1, max: 30, step: 1 },
  minSec: { min: 1, max: 120, step: 1 },
  mergeGapSec: { min: 0, max: 180, step: 1 },
  gyroWeight: { min: 0, max: 5, step: 0.5 },
};

export interface ScorePoint { at: number; score: number }

/** The activity of each second: acceleration plus weighted rotation. A second with neither reading is left out. */
export function activityScores(rows: MotionRow[], gyroWeight: number): ScorePoint[] {
  const out: ScorePoint[] = [];
  for (const r of [...rows].sort((a, b) => a.at - b.at)) {
    if (r.accRms === null && r.gyroRms === null) continue;
    out.push({ at: r.at, score: (r.accRms ?? 0) + gyroWeight * (r.gyroRms ?? 0) });
  }
  return out;
}

/** Each point replaced by the mean of the points within `windowSec` seconds before and after it. */
export function smoothScores(points: ScorePoint[], windowSec: number): ScorePoint[] {
  const half = (windowSec * 1000) / 2;
  const out: ScorePoint[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    while (hi < points.length && points[hi].at <= points[i].at + half) sum += points[hi++].score;
    while (points[lo].at < points[i].at - half) sum -= points[lo++].score;
    out.push({ at: points[i].at, score: sum / (hi - lo) });
  }
  return out;
}

export interface Detected {
  start: number;
  end: number;
  seconds: number;
  /** Highest and mean smoothed score inside. */
  peak: number;
  mean: number;
}

export function detectAttempts(rows: MotionRow[], p: DetectorParams): Detected[] {
  const sm = smoothScores(activityScores(rows, p.gyroWeight), p.smoothSec);
  // Runs of points above the threshold; a hole of more than two seconds in the data ends a run.
  type Run = { start: number; end: number; scores: number[] };
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let i = 0; i < sm.length; i++) {
    const above = sm[i].score >= p.threshold;
    const hole = cur !== null && sm[i].at - cur.end > 2500;
    if (cur && (!above || hole)) { runs.push(cur); cur = null; }
    if (above) {
      if (!cur) cur = { start: sm[i].at, end: sm[i].at, scores: [] };
      cur.end = sm[i].at;
      cur.scores.push(sm[i].score);
    }
  }
  if (cur) runs.push(cur);
  const merged: Run[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= p.mergeGapSec * 1000) { last.end = r.end; last.scores.push(...r.scores); } else merged.push({ ...r, scores: [...r.scores] });
  }
  return merged
    .filter((r) => (r.end - r.start) / 1000 + 1 >= p.minSec)
    .map((r) => ({ start: r.start, end: r.end, seconds: (r.end - r.start) / 1000 + 1, peak: Math.max(...r.scores), mean: r.scores.reduce((a, b) => a + b, 0) / r.scores.length }));
}

export interface Interval { start: number; end: number }

/** Attempts the person labelled: each start is paired with the next end after it. A start with no end, or an end with no start, is ignored. */
export function labelledAttempts(labels: SessionLabel[]): Interval[] {
  const sorted = [...labels].filter((l) => l.kind === "attempt-start" || l.kind === "attempt-end").sort((a, b) => a.at - b.at);
  const out: Interval[] = [];
  let open: number | null = null;
  for (const l of sorted) {
    if (l.kind === "attempt-start") open = l.at;
    else if (open !== null && l.at > open) { out.push({ start: open, end: l.at }); open = null; }
  }
  return out;
}

export interface Comparison {
  /** Detected attempts that overlap a labelled one by at least the minimum share. */
  matched: number;
  /** Labelled attempts the detector did not find. */
  missed: number;
  /** Detected attempts with no labelled one. */
  extra: number;
  /** Of the labelled attempts, the share found; of the detected ones, the share that were real. Null when there is nothing to divide. */
  recall: number | null;
  precision: number | null;
}

const overlap = (a: Interval, b: Interval): number => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/** Scores detected attempts against labelled ones. Two match when they overlap by at least `minShare` of the shorter one. */
export function compareToLabels(detected: Interval[], truth: Interval[], minShare = 0.3): Comparison {
  const used = new Set<number>();
  let matched = 0;
  for (const d of detected) {
    const i = truth.findIndex((t, k) => !used.has(k) && overlap(d, t) >= minShare * Math.min(d.end - d.start, t.end - t.start));
    if (i >= 0) { used.add(i); matched++; }
  }
  return {
    matched,
    missed: truth.length - used.size,
    extra: detected.length - matched,
    recall: truth.length ? used.size / truth.length : null,
    precision: detected.length ? matched / detected.length : null,
  };
}
