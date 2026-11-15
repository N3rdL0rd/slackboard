/** The maths of a slider with a fixed set of stops: where a touch lands, and where a stop sits. Pure. */

/** The stop nearest a touch `x` pixels along a track `width` wide with `n` stops spread edge to edge. */
export function indexAt(x: number, width: number, n: number): number {
  if (n <= 1 || width <= 0) return 0;
  const t = Math.min(1, Math.max(0, x / width));
  return Math.round(t * (n - 1));
}

/** How far along the track (0 to 1) stop `i` sits. */
export function fractionOf(i: number, n: number): number {
  return n <= 1 ? 0 : Math.min(1, Math.max(0, i / (n - 1)));
}

/** The stop one step from `i`, kept inside the track. */
export function stepIndex(i: number, dir: 1 | -1, n: number): number {
  return Math.min(n - 1, Math.max(0, i + dir));
}
