/** Small formatting helpers for the developer screens. */

/** "m:ss" for a time measured from a session's start; negative before it. */
export function clockOffset(at: number, start: number): string {
  const total = Math.round((at - start) / 1000);
  const s = Math.abs(total);
  return `${total < 0 ? "-" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A number with fixed places, or a dash for none. */
export const fixed = (v: number | null | undefined, places = 1): string => (v === null || v === undefined || !Number.isFinite(v) ? "-" : v.toFixed(places));

/** A length of time in milliseconds as "1.0 s", "250 ms" or "2.5 min". */
export function span(ms: number | null): string {
  if (ms === null) return "-";
  if (Math.abs(ms) < 1000) return `${Math.round(ms)} ms`;
  if (Math.abs(ms) < 120_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}
