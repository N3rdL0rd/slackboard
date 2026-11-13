/**
 * An opt-in way to let roped sends count toward the boulder working grade. Roped and boulder grades do not convert reliably, so nothing
 * is assumed: the user states one pair they consider equal ("5.11c is about V4"), and every other roped grade is placed relative to
 * that pair, half a V grade for each step of the roped list (the IRCRA scale has two steps for about one V grade). It is a rule of
 * thumb for a rough level, off by default, and it only ever feeds the working grade; roped grades themselves never change.
 */
import { ropedValue } from "../data/ropedGrades";
import { OUTSIDE_PROVIDER, type GradeEvidence } from "./outside";
import { isSend, ropedTitle, type RopedLog } from "./roped";
import type { LogEntry } from "./types";

export interface RopedEquivalence {
  /** A roped grade as an IRCRA number. */
  ircra: number;
  /** The boulder grade (a V number) the user counts as equal to it. */
  v: number;
}

/** How much of a V grade one step of the roped list is worth. */
export const V_PER_ROPED_STEP = 0.5;

/** 5.11c is about V4: a common rule of thumb, and only a starting point for the user to change. */
export const DEFAULT_EQUIVALENCE: RopedEquivalence = { ircra: ropedValue("yds", "5.11c") ?? 17, v: 4 };

export const MAX_V = 17;
export const MIN_IRCRA = 1;
export const MAX_IRCRA = 60;

/** A roped grade as a boulder grade on the shared scale, never below the bottom of it. */
export const ropedAsV = (ircra: number, eq: RopedEquivalence): number => Math.max(0.01, eq.v + (ircra - eq.ircra) * V_PER_ROPED_STEP);

/** Roped sends as entries the stats can add to the logbook. Attempts are left out: the grade is the point, and a fall is not a send. */
export function ropedAsEntries(roped: RopedLog[], eq: RopedEquivalence): LogEntry[] {
  return roped.filter((l) => isSend(l.result)).map((l) => ({
    id: `r:${l.id}`, provider: OUTSIDE_PROVIDER, climbUuid: `r:${l.id}`, climbName: ropedTitle(l), angle: 0, isMirror: false, bidCount: Math.max(1, l.attempts), quality: 0,
    difficulty: ropedAsV(l.grade, eq), comment: l.note, climbedAt: l.climbedAt, isSend: true,
  }));
}

/** Roped sends as grade evidence for the suggestions' working grade. */
export const ropedEvidence = (roped: RopedLog[], eq: RopedEquivalence): GradeEvidence[] =>
  roped.filter((l) => isSend(l.result)).map((l) => ({ grade: ropedAsV(l.grade, eq), climbedAt: l.climbedAt }));

/** Reads an equivalence from stored or backed-up settings. Null unless both numbers are whole and in range. */
export function parseEquivalence(v: unknown): RopedEquivalence | null {
  if (typeof v !== "object" || v === null) return null;
  const { ircra, v: boulder } = v as Record<string, unknown>;
  if (typeof ircra !== "number" || !Number.isInteger(ircra) || ircra < MIN_IRCRA || ircra > MAX_IRCRA) return null;
  if (typeof boulder !== "number" || !Number.isInteger(boulder) || boulder < 0 || boulder > MAX_V) return null;
  return { ircra, v: boulder };
}
