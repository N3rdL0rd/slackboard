/**
 * The real size of a board's grid: how many centimetres one board unit is. Nothing in a service's data says, so it is measured once with a
 * tape between two holds. With it, distances between holds, the length of a climb and an estimate of its moves can be shown in real units.
 */
import type { LengthUnit } from "./settings";

export interface BoardScale {
  board: string;
  cmPerUnit: number;
  /** The two holds that were measured, and the distance between their centres. */
  refA: string;
  refB: string;
  refCm: number;
  /** Local `yyyy-MM-dd HH:mm:ss`. */
  measuredAt: string;
}

/** Plausible range for one board unit, to catch a mistyped distance. */
export const MIN_CM_PER_UNIT = 0.05;
export const MAX_CM_PER_UNIT = 50;
export const MIN_MEASURE_CM = 10;
export const MAX_MEASURE_CM = 600;

type Pt = { x: number; y: number };
export const unitsBetween = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The scale from one measurement: two holds and the distance between their centres in centimetres. Null when it cannot be right. */
export function scaleFromMeasurement(a: Pt, b: Pt, cm: number): number | null {
  const units = unitsBetween(a, b);
  if (!Number.isFinite(cm) || cm < MIN_MEASURE_CM || cm > MAX_MEASURE_CM || units <= 0) return null;
  const s = cm / units;
  return s >= MIN_CM_PER_UNIT && s <= MAX_CM_PER_UNIT ? s : null;
}

export const cmBetween = (a: Pt, b: Pt, scale: number): number => unitsBetween(a, b) * scale;

/** "47 cm", "1.3 m", or in feet and inches for people who use them: "18 in", "4 ft 2 in". */
export function formatLength(cm: number, unit: LengthUnit): string {
  if (unit === "ft") {
    const totalIn = Math.round(cm / 2.54);
    if (totalIn < 24) return `${totalIn} in`;
    return `${Math.floor(totalIn / 12)} ft ${totalIn % 12} in`;
  }
  return cm < 100 ? `${Math.round(cm)} cm` : `${(cm / 100).toFixed(1)} m`;
}

/** A scale from a backup file or database row. Untrusted. */
export function parseBoardScale(v: unknown): BoardScale | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const board = typeof r.board === "string" && r.board.length > 0 && r.board.length <= 100 ? r.board : null;
  const refA = typeof r.refA === "string" && r.refA.length > 0 && r.refA.length <= 20 ? r.refA : null;
  const refB = typeof r.refB === "string" && r.refB.length > 0 && r.refB.length <= 20 ? r.refB : null;
  const cmPerUnit = typeof r.cmPerUnit === "number" && r.cmPerUnit >= MIN_CM_PER_UNIT && r.cmPerUnit <= MAX_CM_PER_UNIT ? r.cmPerUnit : null;
  const refCm = typeof r.refCm === "number" && r.refCm >= MIN_MEASURE_CM && r.refCm <= MAX_MEASURE_CM ? r.refCm : null;
  const measuredAt = typeof r.measuredAt === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.measuredAt) ? r.measuredAt : null;
  if (!board || !refA || !refB || cmPerUnit === null || refCm === null || !measuredAt) return null;
  return { board, cmPerUnit, refA, refB, refCm, measuredAt };
}
