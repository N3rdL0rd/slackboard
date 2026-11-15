/** Preparing a series for drawing: keeping what fits on the screen without losing the highs and lows. Pure. */
export interface Pt { at: number; v: number }

/**
 * The points between `from` and `to`, thinned to at most about two per column: when many fall in one column only the lowest and highest
 * are kept, in time order, so a spike is never smoothed away by thinning.
 */
export function bucketSeries(points: Pt[], from: number, to: number, columns: number): Pt[] {
  if (to <= from || columns <= 0) return [];
  const inside = points.filter((p) => p.at >= from && p.at <= to).sort((a, b) => a.at - b.at);
  if (inside.length <= columns * 2) return inside;
  const out: Pt[] = [];
  const span = to - from;
  let col = -1;
  let lo: Pt | null = null;
  let hi: Pt | null = null;
  const flush = () => {
    if (!lo || !hi) return;
    const two = lo.at <= hi.at ? [lo, hi] : [hi, lo];
    out.push(two[0]);
    if (two[1] !== two[0]) out.push(two[1]);
  };
  for (const p of inside) {
    const c = Math.min(columns - 1, Math.floor(((p.at - from) / span) * columns));
    if (c !== col) { flush(); col = c; lo = p; hi = p; continue; }
    if (lo && p.v < lo.v) lo = p;
    if (hi && p.v > hi.v) hi = p;
  }
  flush();
  return out;
}

/** The point nearest in time to `at`, or null for an empty series. */
export function nearestPoint(points: Pt[], at: number): Pt | null {
  let best: Pt | null = null;
  for (const p of points) if (!best || Math.abs(p.at - at) < Math.abs(best.at - at)) best = p;
  return best;
}

/** The lowest and highest value in a series between two times, padded a little; a flat series gets a range around its value. */
export function valueRange(points: Pt[], from: number, to: number): { lo: number; hi: number } {
  const v = points.filter((p) => p.at >= from && p.at <= to).map((p) => p.v);
  if (v.length === 0) return { lo: 0, hi: 1 };
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  if (hi === lo) return { lo: lo - 1, hi: hi + 1 };
  const pad = (hi - lo) * 0.08;
  return { lo: lo - pad, hi: hi + pad };
}

export interface Range { from: number; to: number }

/** The shortest stretch a chart can be zoomed to. */
export const MIN_SPAN_MS = 5000;

const fit = (v: Range, full: Range): Range => {
  const span = Math.min(full.to - full.from, Math.max(MIN_SPAN_MS, v.to - v.from));
  const from = Math.min(Math.max(v.from, full.from), full.to - span);
  return { from, to: from + span };
};

/** The view scaled by `factor` (under 1 zooms in) about `center`, kept inside the whole range. */
export function zoomRange(view: Range, full: Range, factor: number, center: number = (view.from + view.to) / 2): Range {
  const c = Math.min(view.to, Math.max(view.from, center));
  return fit({ from: c - (c - view.from) * factor, to: c + (view.to - c) * factor }, full);
}

/** The view moved by a share of its own width (negative is earlier), kept inside the whole range. */
export function panRange(view: Range, full: Range, share: number): Range {
  const d = (view.to - view.from) * share;
  return fit({ from: view.from + d, to: view.to + d }, full);
}
