/**
 * One shape for everything the user logs, so streaks, the load model, reviews, goals and the Log timeline never need to know which kind
 * of entry they are looking at. The underlying records (board sends, gym and outdoor climbs, and later roped climbs and training) stay
 * exactly as they are; an adapter reads each one into an `Activity`.
 *
 * To add a kind: add it to `ActivityKind` and `ACTIVITY_KINDS`, and write its adapter. Nothing else has to change.
 */
import { dayOf, type Day } from "./days";
import { adjustedGrade, SETTING_LABEL, wallStyle, type OutsideLog } from "./outside";
import { isSend, ropedTitle, type RopedLog } from "./roped";
import { doneSets, entryName, type TrainingEntry } from "./training";
import { exerciseById } from "../data/exercises";
import type { LogEntry } from "./types";

export type ActivityKind = "board" | "offBoard" | "roped" | "training";

/** Grades only compare within a discipline, so each has its own scale and its own working grade. */
export type Discipline = "boulder" | "roped" | "training";

/** What the load model, streaks and reviews need to know about an entry, whatever kind it is. */
export interface ActivityFacts {
  discipline: Discipline;
  /** A send (including a flash or redpoint) rather than attempts only. Always false for training. */
  send: boolean;
  /** How much work it was: tries on a climb, sets in a training entry. At least 1. */
  tries: number;
  /** The climb's grade on its discipline's own scale (the shared V scale for boulders), or null when ungraded. */
  grade: number | null;
  /** The user's own 1 to 10 effort rating, when they gave one. */
  effort: number | null;
  /** Finger-intensive work, such as max hangs. */
  fingerIntense: boolean;
}

export interface Activity<R = unknown> {
  /** Unique across kinds, so entries of different kinds never clash. */
  id: string;
  kind: ActivityKind;
  /** Local `yyyy-MM-dd HH:mm:ss`. */
  at: string;
  /** The local day it belongs to. */
  day: Day;
  title: string;
  facts: ActivityFacts;
  /** The underlying record, for opening and editing it. */
  ref: R;
}

export interface ActivityKindInfo {
  label: string;
  discipline: Discipline;
  /** Whether a day with this kind of entry counts as a climbing day for streaks. Training counts too. */
  countsTowardStreak: boolean;
}

export const ACTIVITY_KINDS: Record<ActivityKind, ActivityKindInfo> = {
  board: { label: "Board climb", discipline: "boulder", countsTowardStreak: true },
  offBoard: { label: "Gym or outdoor boulder", discipline: "boulder", countsTowardStreak: true },
  roped: { label: "Roped climb", discipline: "roped", countsTowardStreak: true },
  training: { label: "Training", discipline: "training", countsTowardStreak: true },
};

/**
 * The record behind an activity, by kind. The adapters below set `ref` to the record they read, so the kind says which type it is;
 * these four are the only places that trust that.
 */
export const boardEntryOf = (a: Activity): LogEntry | null => (a.kind === "board" ? (a.ref as LogEntry) : null);
export const offBoardLogOf = (a: Activity): OutsideLog | null => (a.kind === "offBoard" ? (a.ref as OutsideLog) : null);
export const trainingEntryOf = (a: Activity): TrainingEntry | null => (a.kind === "training" ? (a.ref as TrainingEntry) : null);
export const ropedLogOf = (a: Activity): RopedLog | null => (a.kind === "roped" ? (a.ref as RopedLog) : null);

/** A board send or attempts record. `gradeOf` puts the send's grade on the shared V scale. */
export function boardActivity(e: LogEntry, gradeOf: (e: LogEntry) => number): Activity<LogEntry> {
  return {
    id: `board:${e.id}`, kind: "board", at: e.climbedAt, day: dayOf(e.climbedAt), title: e.climbName, ref: e,
    facts: { discipline: "boulder", send: e.isSend, tries: Math.max(1, e.bidCount), grade: e.isSend && e.difficulty > 0 ? gradeOf(e) : null, effort: null, fingerIntense: false },
  };
}

/** A gym or outdoor boulder. Its grade is on the shared scale with the gym or outdoor offset applied, as the stats and suggestions use it. */
export function offBoardActivity(l: OutsideLog): Activity<OutsideLog> {
  const grade = adjustedGrade(l);
  return {
    id: `offBoard:${l.id}`, kind: "offBoard", at: l.climbedAt, day: dayOf(l.climbedAt), ref: l,
    title: l.name || `${SETTING_LABEL[l.setting]} ${wallStyle(l.wall).label.toLowerCase()}`,
    facts: { discipline: "boulder", send: l.result !== "attempt", tries: Math.max(1, l.attempts), grade: l.result !== "attempt" ? grade : null, effort: null, fingerIntense: false },
  };
}

/** A roped climb. Its grade is on the roped scale (the IRCRA number), not the V scale, and each autobelay lap counts as a try. */
export function ropedActivity(l: RopedLog): Activity<RopedLog> {
  return {
    id: `roped:${l.id}`, kind: "roped", at: l.climbedAt, day: dayOf(l.climbedAt), title: ropedTitle(l), ref: l,
    facts: { discipline: "roped", send: isSend(l.result), tries: Math.max(1, l.attempts), grade: isSend(l.result) ? l.grade : null, effort: null, fingerIntense: false },
  };
}

/** One exercise on one day. Tries are the sets done; finger-intense work counts toward the rest nudge. Never a send, never graded. */
export function trainingActivity(e: TrainingEntry): Activity<TrainingEntry> {
  return {
    id: `training:${e.id}`, kind: "training", at: e.performedAt, day: dayOf(e.performedAt), title: entryName(e), ref: e,
    facts: { discipline: "training", send: false, tries: Math.max(1, doneSets(e).length), grade: null, effort: e.effort, fingerIntense: exerciseById(e.exerciseId)?.fingerIntense ?? false },
  };
}

/**
 * Every kind of entry as one list, newest first. `gradeOf` gives a board entry's grade on the shared V scale (a board's own difficulty
 * numbers differ between brands), so it is required: without it a board send would carry a number the other kinds can't be compared to.
 */
export function activitiesOf(input: { board?: LogEntry[]; offBoard?: OutsideLog[]; roped?: RopedLog[]; training?: TrainingEntry[]; extra?: Activity[]; gradeOf: (e: LogEntry) => number }): Activity[] {
  const board = (input.board ?? []).map((e) => boardActivity(e, input.gradeOf));
  return [...board, ...(input.offBoard ?? []).map(offBoardActivity), ...(input.roped ?? []).map(ropedActivity),
    // An entry with no done set is not a day of training.
    ...(input.training ?? []).filter((e) => doneSets(e).length > 0).map(trainingActivity), ...(input.extra ?? [])].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Entries grouped by local day. */
export function byDay<T extends Activity>(list: T[]): Map<Day, T[]> {
  const out = new Map<Day, T[]>();
  for (const a of list) (out.get(a.day) ?? out.set(a.day, []).get(a.day)!).push(a);
  return out;
}

/** The days that have at least one entry that counts towards a streak, ascending. */
export function climbingDays(list: Activity[]): Day[] {
  return [...new Set(list.filter((a) => ACTIVITY_KINDS[a.kind].countsTowardStreak).map((a) => a.day))].sort();
}
