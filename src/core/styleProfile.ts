/**
 * What the logs say about where strength is the limiter, without any test. It compares the user's own best sends: overhang against slab
 * and vertical, board against gym and outdoor, roped against bouldering. A gap counts only with enough sends on each side, and the
 * result says what it saw in plain words. It never changes a grade shown anywhere else; it only suggests which quality to emphasise,
 * and what the user says about themselves outranks it. Pure.
 */
import { styleProfile, wallStyle, type AngleSample, type WallStyleId } from "./outside";

export type Emphasis = "strength" | "endurance" | "balanced";

/** A gap smaller than this many V grades is not a pattern. */
export const MIN_GAP = 2;
/** Sends needed on each side of a comparison. */
export const MIN_SENDS_EACH = 3;

export interface StyleInput {
  /** Sends by wall angle, on the shared scale (from `angleSamples`). */
  samples: AngleSample[];
  /** Working grades on the shared scale (V numbers), null when there are too few sends. */
  boardWorking: number | null;
  outsideWorking: number | null;
  /** Roped working grade placed on the boulder scale, and the boulder one it is compared with. */
  ropedV: number | null;
  boulderV: number | null;
  /** How many graded sends are behind each. */
  sends: { board: number; outside: number; roped: number; boulder: number };
  now: Date;
}

export interface StyleInsight {
  /** What the logs point to, or "unknown" when there is too little to compare. */
  emphasis: Emphasis | "unknown";
  /** What was seen, in plain words with the numbers behind it. */
  findings: string[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const ENOUGH = (n: number) => n >= MIN_SENDS_EACH;

export function styleInsight(input: StyleInput): StyleInsight {
  const findings: string[] = [];
  let strength = false;
  let endurance = false;
  let compared = false;

  // Steep walls against easy angles: the best of each end, each with enough sends.
  const p = styleProfile(input.samples, input.now);
  const easy = p ? (["slab", "vertical"] as WallStyleId[]).filter((s) => ENOUGH(p.counts[s]) && p.working[s] != null) : [];
  const steep = p ? (["overhang", "steep"] as WallStyleId[]).filter((s) => ENOUGH(p.counts[s]) && p.working[s] != null) : [];
  if (p && easy.length && steep.length) {
    compared = true;
    const hi = easy.reduce((a, b) => (p.working[a]! >= p.working[b]! ? a : b));
    const lo = steep.reduce((a, b) => (p.working[a]! >= p.working[b]! ? a : b));
    const gap = p.working[hi]! - p.working[lo]!;
    if (gap >= MIN_GAP) { strength = true; findings.push(`Your ${wallStyle(lo).label.toLowerCase()} grade is ${r1(gap)} V below your ${wallStyle(hi).label.toLowerCase()} grade.`); }
  }

  // The board against gym and outdoor climbing.
  if (ENOUGH(input.sends.board) && ENOUGH(input.sends.outside) && input.boardWorking !== null && input.outsideWorking !== null) {
    compared = true;
    const gap = input.outsideWorking - input.boardWorking;
    if (gap >= MIN_GAP) { strength = true; findings.push(`Your board grades are ${r1(gap)} V below your gym and outdoor grades.`); }
  }

  // Roped against bouldering: a big gap points to endurance.
  if (ENOUGH(input.sends.roped) && ENOUGH(input.sends.boulder) && input.ropedV !== null && input.boulderV !== null) {
    compared = true;
    const gap = input.boulderV - input.ropedV;
    if (gap >= MIN_GAP) { endurance = true; findings.push(`Your roped grades are about ${r1(gap)} V below your bouldering grades.`); }
  }

  if (strength) return { emphasis: "strength", findings: [...findings, "That points to strength work."] };
  if (endurance) return { emphasis: "endurance", findings: [...findings, "That points to endurance work."] };
  if (compared) return { emphasis: "balanced", findings: ["Your grades are similar across styles, so nothing stands out. Balanced strength work suits that."] };
  return { emphasis: "unknown", findings: ["There is too little in your log to see a pattern yet. That is fine; you can say what you think instead."] };
}
