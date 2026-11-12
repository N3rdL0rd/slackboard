/**
 * When a send deserves a celebration: a flash (first-try send), or the first send of a V grade above anything sent before.
 * Pure, so the rules are tested; the climb view turns the result into confetti and a "Congrats!" message.
 */
import { isFlash } from "./shareCard";

export interface Celebration {
  kind: "flash" | "hardest";
  /** The line shown under "Congrats!". */
  text: string;
}

/**
 * @param bidCount attempts it took, 1 for a flash
 * @param difficulty the grade just logged (a number on the difficulty scale), 0 or missing when none was given
 * @param previous difficulties of every send logged before this one
 * @param vOf maps a difficulty to its V grade number
 */
export function celebrationFor(bidCount: number, difficulty: number | undefined, previous: number[], vOf: (difficulty: number) => number): Celebration | null {
  const graded = difficulty !== undefined && difficulty > 0;
  const v = graded ? vOf(difficulty) : null;
  const best = previous.filter((x) => x > 0).reduce<number | null>((m, x) => (m === null || vOf(x) > m ? vOf(x) : m), null);
  const hardest = v !== null && (best === null || v > best);
  const flash = isFlash(bidCount);
  if (hardest) return { kind: "hardest", text: flash ? `A flash, and your hardest grade yet: V${v}.` : `Your hardest grade yet: V${v}.` };
  if (flash) return { kind: "flash", text: "Flashed it." };
  return null;
}
