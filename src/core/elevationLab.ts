/**
 * Comparing two sources of height on the wall: the watch's own elevation, and a height worked out from air pressure. Neither is trusted
 * yet; this exists to see how closely they agree, how fast each drifts, and how much height an attempt gains by each. Everything is
 * relative: a series starts near zero, because the absolute value means nothing on a wall. Pure.
 */
import type { MotionRow, ElevationSample } from "./wear";

export interface HeightPoint { at: number; m: number }

/** Metres above a reference pressure, from the standard atmosphere (about 8.4 m per hPa near sea level). */
export const altitudeFromPressure = (hPa: number, refHPa: number): number => 44330 * (1 - Math.pow(hPa / refHPa, 1 / 5.255));

/** The mean of the first `n` values. */
const meanOf = (xs: number[], n: number): number => {
  const head = xs.slice(0, Math.max(1, n));
  return head.reduce((a, b) => a + b, 0) / head.length;
};

/** Height from the pressure readings, relative to the mean pressure of the first `refSeconds` seconds. Empty without readings. */
export function pressureHeights(rows: MotionRow[], refSeconds = 30): HeightPoint[] {
  const have = rows.filter((r) => r.pressure !== null).sort((a, b) => a.at - b.at);
  if (have.length === 0) return [];
  const ref = meanOf(have.map((r) => r.pressure as number), refSeconds);
  return have.map((r) => ({ at: r.at, m: altitudeFromPressure(r.pressure as number, ref) }));
}

/** The watch's elevation relative to the mean of its first `refSamples` samples. */
export function relativeElevation(samples: ElevationSample[], refSamples = 10): HeightPoint[] {
  const s = [...samples].sort((a, b) => a.at - b.at);
  if (s.length === 0) return [];
  const ref = meanOf(s.map((x) => x.metres), refSamples);
  return s.map((x) => ({ at: x.at, m: x.metres - ref }));
}

export type Smoothing = "none" | "mean" | "median";

/** Each point replaced by the mean or median of the points within `windowSec` seconds either side. */
export function smoothHeights(points: HeightPoint[], windowSec: number, kind: Smoothing): HeightPoint[] {
  if (kind === "none" || windowSec <= 0) return points;
  const half = (windowSec * 1000) / 2;
  return points.map((p, i) => {
    const near: number[] = [];
    for (let j = i; j >= 0 && points[j].at >= p.at - half; j--) near.push(points[j].m);
    for (let j = i + 1; j < points.length && points[j].at <= p.at + half; j++) near.push(points[j].m);
    const v = kind === "mean" ? near.reduce((a, b) => a + b, 0) / near.length : [...near].sort((a, b) => a - b)[Math.floor(near.length / 2)];
    return { at: p.at, m: v };
  });
}

export interface Gain {
  /** Last minus first inside the stretch. */
  net: number;
  /** Highest minus lowest. */
  range: number;
  points: number;
}

/** The height change between two times. Null with fewer than two points inside. */
export function gainIn(points: HeightPoint[], start: number, end: number): Gain | null {
  const inside = points.filter((p) => p.at >= start && p.at <= end).sort((a, b) => a.at - b.at);
  if (inside.length < 2) return null;
  const ms = inside.map((p) => p.m);
  return { net: inside[inside.length - 1].m - inside[0].m, range: Math.max(...ms) - Math.min(...ms), points: inside.length };
}

export interface Agreement {
  /** Pearson correlation of the two series on a shared one-second grid, and the root-mean-square difference in metres. Null with under three shared seconds. */
  correlation: number | null;
  rmsDiff: number | null;
  seconds: number;
  /** The change in the difference between the two over the session: how much one drifts against the other, in metres. */
  drift: number | null;
}

/** How closely two height series agree, on the seconds they both cover. */
export function agreement(a: HeightPoint[], b: HeightPoint[]): Agreement {
  const grid = (pts: HeightPoint[]) => { const m = new Map<number, number>(); for (const p of pts) m.set(Math.floor(p.at / 1000), p.m); return m; };
  const ga = grid(a);
  const gb = grid(b);
  const xs: number[] = [];
  const ys: number[] = [];
  const secs = [...ga.keys()].filter((k) => gb.has(k)).sort((x, y) => x - y);
  for (const k of secs) { xs.push(ga.get(k) as number); ys.push(gb.get(k) as number); }
  const n = xs.length;
  if (n < 3) return { correlation: null, rmsDiff: null, seconds: n, drift: null };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0, sd = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; sd += (xs[i] - ys[i]) ** 2; }
  const k = Math.max(1, Math.floor(n / 10));
  const head = meanOf(xs.map((x, i) => x - ys[i]), k);
  const tail = meanOf(xs.map((x, i) => x - ys[i]).reverse(), k);
  return { correlation: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, rmsDiff: Math.sqrt(sd / n), seconds: n, drift: tail - head };
}
