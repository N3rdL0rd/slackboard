/**
 * Training entries: one exercise on one day, with its sets. Pure: validation of untrusted input (a backup file), what a session starts
 * from (last time's values, else the exercise's template), the history of one exercise, and the short text that describes a set.
 * Storage is in trainingLocal.ts.
 */
import { exerciseById, GRIP_LABEL, type Exercise, type Grip } from "../data/exercises";
import { formatWeight } from "./units";
import type { Units } from "./settings";

export const MAX_SETS = 30;
export const MAX_REPS = 200;
export const MAX_TIME_S = 3600;
export const MAX_LOAD_KG = 500;
export const MAX_EDGE_MM = 60;
export const MAX_NOTE = 500;

/** One set as it was done. `timeS` is the work time of one rep; `reps` is how many reps (null for a single hold or an uncounted set). */
/** How a set felt, when the user said: easy (well inside what they could do), right, or hard (close to or at failure). */
export type Feel = "easy" | "right" | "hard";
export const FEELS: Feel[] = ["easy", "right", "hard"];

export interface TrainingSet {
  position: number;
  reps: number | null;
  loadKg: number | null;
  timeS: number | null;
  edgeMm: number | null;
  grip: Grip | null;
  restS: number | null;
  done: boolean;
  /** How it felt. Optional: the planner uses it to set the next session, and nothing breaks without it. */
  feel: Feel | null;
}

export interface TrainingEntry {
  id: string;
  exerciseId: string;
  /** Local `yyyy-MM-dd HH:mm:ss`. */
  performedAt: string;
  /** The user's 1 to 10 effort for the session, when given. */
  effort: number | null;
  note: string;
  sets: TrainingSet[];
}

/** What a set should be, before it is done. The runner starts from these and the user adjusts them. */
export interface SetTarget {
  reps: number | null;
  onS: number | null;
  offS: number | null;
  restS: number;
  loadKg: number | null;
  edgeMm: number | null;
  grip: Grip | null;
}

const GRIPS = Object.keys(GRIP_LABEL) as Grip[];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown, min: number, max: number, integer = false): number | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return undefined;
  return integer && !Number.isInteger(v) ? undefined : v;
}

function parseSet(v: unknown, position: number): TrainingSet | null {
  if (!isObj(v)) return null;
  const reps = num(v.reps, 1, MAX_REPS, true);
  const loadKg = num(v.loadKg, -MAX_LOAD_KG, MAX_LOAD_KG);
  const timeS = num(v.timeS, 0, MAX_TIME_S);
  const edgeMm = num(v.edgeMm, 1, MAX_EDGE_MM);
  const restS = num(v.restS, 0, MAX_TIME_S);
  if ([reps, loadKg, timeS, edgeMm, restS].includes(undefined)) return null;
  const grip = v.grip === null || v.grip === undefined ? null : GRIPS.includes(v.grip as Grip) ? (v.grip as Grip) : undefined;
  const feel = v.feel === null || v.feel === undefined ? null : FEELS.includes(v.feel as Feel) ? (v.feel as Feel) : undefined;
  if (grip === undefined || feel === undefined || typeof v.done !== "boolean") return null;
  return { position, reps: reps ?? null, loadKg: loadKg ?? null, timeS: timeS ?? null, edgeMm: edgeMm ?? null, grip, restS: restS ?? null, done: v.done, feel };
}

/** Reads one entry from untrusted input. Null for anything damaged or naming an exercise this version doesn't know. */
export function parseTrainingEntry(v: unknown): TrainingEntry | null {
  if (!isObj(v)) return null;
  const { id, exerciseId, performedAt, note } = v;
  if (typeof id !== "string" || !id || id.length > 100 || typeof exerciseId !== "string" || !exerciseById(exerciseId)) return null;
  if (typeof performedAt !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(performedAt)) return null;
  const effort = num(v.effort, 1, 10, true);
  if (effort === undefined || !Array.isArray(v.sets) || v.sets.length === 0 || v.sets.length > MAX_SETS) return null;
  const sets: TrainingSet[] = [];
  for (const raw of v.sets) {
    const s = parseSet(raw, sets.length);
    if (!s) return null;
    sets.push(s);
  }
  return { id, exerciseId, performedAt, effort: effort ?? null, note: typeof note === "string" ? note.slice(0, MAX_NOTE) : "", sets };
}

export const doneSets = (e: TrainingEntry): TrainingSet[] => e.sets.filter((s) => s.done);

/** The entry's exercise, or a stand-in name for one this version doesn't know. */
export const entryName = (e: TrainingEntry): string => exerciseById(e.exerciseId)?.name ?? "Exercise";

/** The newest entry of this exercise that has at least one done set. */
export function lastTime(entries: TrainingEntry[], exerciseId: string): TrainingEntry | undefined {
  let best: TrainingEntry | undefined;
  for (const e of entries) {
    if (e.exerciseId !== exerciseId || doneSets(e).length === 0) continue;
    if (!best || e.performedAt > best.performedAt) best = e;
  }
  return best;
}

/** The heaviest load and the longest single hold ever done on this exercise (done sets only). */
export function bests(entries: TrainingEntry[], exerciseId: string): { loadKg: number | null; timeS: number | null } {
  let loadKg: number | null = null;
  let timeS: number | null = null;
  for (const e of entries) {
    if (e.exerciseId !== exerciseId) continue;
    for (const s of doneSets(e)) {
      if (s.loadKg !== null && (loadKg === null || s.loadKg > loadKg)) loadKg = s.loadKg;
      if (s.timeS !== null && (timeS === null || s.timeS > timeS)) timeS = s.timeS;
    }
  }
  return { loadKg, timeS };
}

export interface HistoryPoint { at: string; value: number }

/**
 * One point per session for the progress chart: the heaviest load of the session when the exercise has loads, else the longest hold,
 * else the total reps. Oldest first. `unit` says which of the three it is.
 */
export function history(entries: TrainingEntry[], exerciseId: string): { unit: "kg" | "s" | "reps" | null; points: HistoryPoint[] } {
  const mine = entries.filter((e) => e.exerciseId === exerciseId && doneSets(e).length > 0).sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const maxOf = (e: TrainingEntry, f: (s: TrainingSet) => number | null): number | null => {
    const xs = doneSets(e).map(f).filter((x): x is number => x !== null);
    return xs.length ? Math.max(...xs) : null;
  };
  const hasLoad = mine.some((e) => maxOf(e, (s) => s.loadKg) !== null);
  const hasTime = mine.some((e) => maxOf(e, (s) => s.timeS) !== null);
  const unit = hasLoad ? "kg" : hasTime ? "s" : mine.length ? "reps" : null;
  const points = mine.map((e) => ({
    at: e.performedAt,
    value: (unit === "kg" ? maxOf(e, (s) => s.loadKg) : unit === "s" ? maxOf(e, (s) => s.timeS) : doneSets(e).reduce((n, s) => n + (s.reps ?? 1), 0)) ?? 0,
  }));
  return { unit, points };
}

/** The exercise's template as the targets of its sets. */
export const targetsFromTemplate = (ex: Exercise): SetTarget[] =>
  Array.from({ length: ex.template.sets }, () => ({
    reps: ex.template.reps, onS: ex.template.onS, offS: ex.template.offS, restS: ex.template.restS, loadKg: ex.template.loadKg, edgeMm: ex.template.edgeMm, grip: ex.template.grip,
  }));

/**
 * What a session starts from for this exercise: the same number of sets and the same values as last time (the last done set's, so a
 * weight that was raised mid-session carries over), with the work and off times from the template, which a done set does not keep.
 * Without a last time, the template.
 */
export function targetsFor(ex: Exercise, last: TrainingEntry | undefined): SetTarget[] {
  const base = targetsFromTemplate(ex);
  const done = last ? doneSets(last) : [];
  if (done.length === 0) return base;
  const tail = done[done.length - 1];
  const count = Math.min(MAX_SETS, Math.max(1, done.length));
  return Array.from({ length: count }, () => ({
    reps: tail.reps ?? base[0].reps,
    onS: ex.template.onS === null ? null : tail.timeS ?? ex.template.onS,
    offS: ex.template.offS,
    restS: tail.restS ?? ex.template.restS,
    loadKg: tail.loadKg,
    edgeMm: tail.edgeMm ?? ex.template.edgeMm,
    grip: tail.grip ?? ex.template.grip,
  }));
}

/** A set as a short phrase: "6 × 7 s", "20 mm", "+10 kg", "Half crimp". Only what the set has. */
export function setText(s: Pick<TrainingSet, "reps" | "timeS" | "loadKg" | "edgeMm" | "grip">, units: Units): string {
  const parts: string[] = [];
  if (s.timeS !== null) parts.push(s.reps && s.reps > 1 ? `${s.reps} \u00D7 ${s.timeS} s` : `${s.timeS} s`);
  else if (s.reps !== null) parts.push(`${s.reps} reps`);
  // Edge depth is a hangboard measurement, in millimetres whatever the length unit is.
  if (s.edgeMm !== null) parts.push(`${s.edgeMm} mm`);
  if (s.loadKg !== null) parts.push(formatWeight(s.loadKg, units.weight, { signed: true }));
  if (s.grip !== null && s.grip !== "none") parts.push(GRIP_LABEL[s.grip]);
  return parts.join(" \u00B7 ");
}

/** The whole entry on a line: "3 sets: 10 s · 20 mm · +10 kg · Half crimp". Sets that differ are shown as the last done set. */
export function entryText(e: TrainingEntry, units: Units): string {
  const done = doneSets(e);
  if (done.length === 0) return "No sets done";
  const last = done[done.length - 1];
  return `${done.length} ${done.length === 1 ? "set" : "sets"}: ${setText(last, units) || "done"}`;
}
