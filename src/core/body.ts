/**
 * The optional daily body check-in: how each area feels, a 1 to 5 energy rating, a 1 to 10 effort rating for the day, and a note. It
 * is never required and never asked for in a pop-up. It drives the rest nudge (sore fingers today) and, later, the planner. The app
 * does not diagnose anything: the rules below only decide when to suggest rest. Everything here is pure.
 */
import { addDays, daysBetween, isDay, type Day } from "./days";
import type { Activity } from "./activity";

export const AREAS = ["fingers", "elbows", "shoulders", "other"] as const;
export type Area = (typeof AREAS)[number];

/** How an area feels. `hurts` means pain, not just soreness: for the fingers it is treated as sharp pain. */
export type AreaState = "fine" | "sore" | "hurts";
export const AREA_STATES: readonly AreaState[] = ["fine", "sore", "hurts"];

export const AREA_LABEL: Record<Area, string> = { fingers: "Fingers", elbows: "Elbows", shoulders: "Shoulders", other: "Other" };
export const STATE_LABEL: Record<AreaState, string> = { fine: "Fine", sore: "Sore", hurts: "Hurts" };

export interface DayNote {
  day: Day;
  /** How hard the day was, 1 to 10, or null. It scales the day's load. */
  effort: number | null;
  /** Energy or sleep, 1 to 5, or null. */
  energy: number | null;
  fingers: AreaState;
  elbows: AreaState;
  shoulders: AreaState;
  other: AreaState;
  note: string;
}

export const MAX_NOTE_LENGTH = 2000;

export const blankNote = (day: Day): DayNote => ({ day, effort: null, energy: null, fingers: "fine", elbows: "fine", shoulders: "fine", other: "fine", note: "" });

/** True when the check-in says nothing, so it need not be stored. */
export const isBlankNote = (n: DayNote): boolean => n.effort === null && n.energy === null && AREAS.every((a) => n[a] === "fine") && n.note.trim() === "";

/** The next state when an area chip is tapped: fine, then sore, then hurts, then fine again. */
export const nextState = (s: AreaState): AreaState => AREA_STATES[(AREA_STATES.indexOf(s) + 1) % AREA_STATES.length];

const intIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/**
 * A note from untrusted data (a backup file or the database). A bad day makes the whole record unusable; a bad rating or area is read
 * as not given rather than guessed.
 */
export function parseDayNote(v: unknown): DayNote | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.day !== "string" || !isDay(o.day)) return null;
  if (typeof o.note !== "string" || o.note.length > MAX_NOTE_LENGTH) return null;
  const state = (x: unknown): AreaState => (AREA_STATES as readonly unknown[]).includes(x) ? (x as AreaState) : "fine";
  return { day: o.day, effort: intIn(o.effort, 1, 10), energy: intIn(o.energy, 1, 5), fingers: state(o.fingers), elbows: state(o.elbows), shoulders: state(o.shoulders), other: state(o.other), note: o.note };
}

/** Sharp finger pain holds hard finger work off for this many days. */
export const HOLD_OFF_DAYS = 7;
/** The same area hurting on this many days within `REPEAT_WINDOW_DAYS` shows the plain note about seeing a physio or doctor. */
export const REPEAT_PAIN_DAYS = 3;
export const REPEAT_WINDOW_DAYS = 14;

/**
 * Whether hard finger work should wait: the fingers hurt on any day in the last `HOLD_OFF_DAYS` days (today counts). `until` is the first
 * day it is fine again, counted from the most recent day they hurt.
 */
export function fingerHoldOff(notes: DayNote[], today: Day): { holdOff: boolean; until: Day | null } {
  let latest: Day | null = null;
  for (const n of notes) {
    if (n.fingers !== "hurts" || n.day > today || daysBetween(n.day, today) >= HOLD_OFF_DAYS) continue;
    if (latest === null || n.day > latest) latest = n.day;
  }
  return latest ? { holdOff: true, until: addDays(latest, HOLD_OFF_DAYS) } : { holdOff: false, until: null };
}

/** The areas that hurt on `REPEAT_PAIN_DAYS` or more different days in the last `REPEAT_WINDOW_DAYS` days. */
export function repeatedPain(notes: DayNote[], today: Day): Area[] {
  return AREAS.filter((a) => new Set(notes.filter((n) => n[a] === "hurts" && n.day <= today && daysBetween(n.day, today) < REPEAT_WINDOW_DAYS).map((n) => n.day)).size >= REPEAT_PAIN_DAYS);
}

/** The plain note shown for repeated pain. It suggests rest and a professional, and says nothing about causes. */
export const painNote = (areas: Area[]): string | null => {
  if (!areas.length) return null;
  // "Other" is not a body part, so it reads "something else"; the rest are plural.
  const names = areas.map((a) => (a === "other" ? "something else" : `your ${a}`));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const verb = areas.length === 1 && areas[0] === "other" ? "has" : "have";
  return `${list[0].toUpperCase()}${list.slice(1)} ${verb} hurt on several days lately. Rest, and consider seeing a physio or doctor if it keeps coming back.`;
};

/** The note for a day, if any. */
export const noteFor = (notes: DayNote[], day: Day): DayNote | undefined => notes.find((n) => n.day === day);

/**
 * The entries with the day's effort rating on them, so the load model scales a day by how hard the user said it was. An entry's own
 * effort (training entries carry one) is kept when it is higher.
 */
export function withDayEfforts(list: Activity[], notes: DayNote[]): Activity[] {
  const effort = new Map(notes.filter((n) => n.effort !== null).map((n) => [n.day, n.effort as number]));
  if (!effort.size) return list;
  return list.map((a) => {
    const e = effort.get(a.day);
    if (e === undefined) return a;
    return { ...a, facts: { ...a.facts, effort: a.facts.effort === null ? e : Math.max(a.facts.effort, e) } };
  });
}

/** One line about a check-in for a day card: "Fingers sore · Elbows hurts · energy 3 of 5 · effort 7 of 10". Empty when it says nothing. */
export function noteSummary(n: DayNote): string {
  const parts: string[] = AREAS.filter((a) => n[a] !== "fine").map((a) => `${AREA_LABEL[a]} ${n[a] === "hurts" ? "hurt" : "sore"}`);
  if (n.energy !== null) parts.push(`energy ${n.energy} of 5`);
  if (n.effort !== null) parts.push(`effort ${n.effort} of 10`);
  return parts.join(" \u00B7 ");
}
