/** Circuit colours the server accepts, and how to show them on a dark background. */
export const CIRCUIT_COLORS = ["808080", "FF0000", "FF8000", "00CC00", "0000FF", "8000FF", "FF00FF"] as const;
export const DEFAULT_CIRCUIT_COLOR = "FF0000";

/** The server stores pure blue and black; both vanish on the dark UI, so they are drawn lighter. */
export function circuitDisplayColor(hex: string): string {
  const h = hex.toUpperCase();
  if (h === "000000") return "#808080";
  if (h === "0000FF") return "#4C8DFF";
  return `#${h}`;
}

/** Moves one item up or down; out-of-range moves leave the list alone. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Circuit ids a climb is in. */
export const circuitsContaining = (circuits: { uuid: string; climbs: string[] }[], climbUuid: string) =>
  circuits.filter((c) => c.climbs.includes(climbUuid.toUpperCase())).map((c) => c.uuid);
