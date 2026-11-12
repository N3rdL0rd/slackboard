/**
 * The angle dial's geometry. The wheel turns under a fixed pointer at the top: rotation 0 puts the middle angle under it, and
 * turning the wheel clockwise (positive) brings a lower angle there.
 */

/** Degrees of wheel rotation per degree of board angle: wide enough to separate 5-degree steps, narrow enough to fit the range. */
export function dialPitch(min: number, max: number, spread = 230, widest = 4): number {
  return Math.min(widest, spread / Math.max(1, max - min));
}

export const centreOf = (min: number, max: number): number => (min + max) / 2;

/** The wheel rotation that puts `angle` under the pointer. */
export const rotationFor = (angle: number, centre: number, pitch: number): number => -(angle - centre) * pitch;

/** The (continuous) angle under the pointer at a given rotation. */
export const angleAt = (rotation: number, centre: number, pitch: number): number => centre - rotation / pitch;

/** The offered angle nearest to `value`. */
export function nearestAngle(sorted: number[], value: number): number {
  let best = sorted[0];
  for (const a of sorted) if (Math.abs(a - value) < Math.abs(best - value)) best = a;
  return best;
}

/** Keeps a rotation between the lowest and highest angle. */
export function clampRotation(rotation: number, min: number, max: number, centre: number, pitch: number): number {
  return Math.max(rotationFor(max, centre, pitch), Math.min(rotationFor(min, centre, pitch), rotation));
}

/** An angle difference in degrees, taken the short way round (so crossing the top of the dial does not jump). */
export const shortestArc = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/** Compass-style direction of a point from the dial's centre, in degrees: 0 straight up, clockwise positive. */
export const directionOf = (x: number, y: number, cx: number, cy: number): number => (Math.atan2(x - cx, cy - y) * 180) / Math.PI;

/**
 * One drag step. Rotation follows the finger's change of direction since the last step, clamped to the dial's range. Returns the
 * new rotation and the direction to measure the next step from (the finger's, so a clamped drag does not store up turning the
 * finger has not made).
 */
export function dragStep(
  rotation: number, lastDirection: number, direction: number, limits: { min: number; max: number; centre: number; pitch: number },
): { rotation: number; direction: number; clamped: boolean } {
  const wanted = rotation + shortestArc(direction - lastDirection);
  const next = clampRotation(wanted, limits.min, limits.max, limits.centre, limits.pitch);
  return { rotation: next, direction, clamped: next !== wanted };
}
