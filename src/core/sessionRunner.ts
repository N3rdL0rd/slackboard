/**
 * The session runner as a pure state machine. The screen only feeds it events (a tap, or the time that passed) and draws the state, so
 * the rules for hangs, reps, rests and skipping are tested without a phone.
 *
 * A session is an ordered list of exercises, each with the targets of its sets. For each set: `ready`, then the work, then a `rest`
 * before the next set. A timed set (a hang, or repeaters) counts down by itself: `on` for the work of one rep, `off` between the reps
 * of a set. A counted set (pull-ups) has no countdown: it is `work` until the user taps Done. After the last set of an exercise the next
 * exercise is `ready`; after the last of the last, `finished`.
 *
 * `tick` takes the real time that passed, so a phone that slept for a minute catches up through every phase it missed.
 */
import { exerciseById } from "../data/exercises";
import type { SetTarget, TrainingEntry, TrainingSet } from "./training";

export interface RunnerItem {
  exerciseId: string;
  sets: SetTarget[];
}

export type Phase = "ready" | "on" | "off" | "work" | "rest" | "finished";

export type DoneSet = Omit<TrainingSet, "position">;

export interface RunnerState {
  items: RunnerItem[];
  /** The exercise and set the session is on. During a rest this is the set that comes next. */
  item: number;
  set: number;
  /** The rep inside the current timed set, from 0. */
  rep: number;
  phase: Phase;
  paused: boolean;
  /** Time left in `on`, `off` and `rest`. Zero in the other phases. */
  remainingMs: number;
  /** Time spent in the current work (`on` and `work` only). */
  elapsedMs: number;
  done: { item: number; set: DoneSet }[];
}

export type RunnerEvent =
  | { type: "start" }
  | { type: "tick"; ms: number }
  | { type: "done" }
  | { type: "skipRest" }
  | { type: "addRest"; ms: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "edit"; patch: Partial<SetTarget> }
  | { type: "addSet" }
  | { type: "skipExercise" }
  | { type: "finish" };

export const REST_STEP_MS = 30_000;

const copy = (s: RunnerState): RunnerState => ({
  ...s,
  items: s.items.map((i) => ({ ...i, sets: i.sets.map((t) => ({ ...t })) })),
  done: s.done.slice(),
});

export function startRunner(items: RunnerItem[]): RunnerState {
  const kept = items.filter((i) => i.sets.length > 0 && exerciseById(i.exerciseId));
  return { items: kept, item: 0, set: 0, rep: 0, phase: kept.length ? "ready" : "finished", paused: false, remainingMs: 0, elapsedMs: 0, done: [] };
}

export const currentTarget = (s: RunnerState): SetTarget | null => (s.phase === "finished" ? null : s.items[s.item]?.sets[s.set] ?? null);
export const isTimed = (t: SetTarget | null): boolean => t !== null && t.onS !== null;

/** How many sets of the current exercise are done, for "3 of 5". */
export const setsDoneIn = (s: RunnerState, item: number): number => s.done.filter((d) => d.item === item).length;

/** Total seconds of one timed set: its reps of work with the offs between them. */
export const setSeconds = (t: SetTarget): number => (t.onS ?? 0) * (t.reps ?? 1) + (t.offS ?? 0) * Math.max(0, (t.reps ?? 1) - 1);

function enterWork(s: RunnerState, rep: number): void {
  const t = s.items[s.item].sets[s.set];
  s.rep = rep;
  s.elapsedMs = 0;
  if (t.onS !== null) { s.phase = "on"; s.remainingMs = t.onS * 1000; } else { s.phase = "work"; s.remainingMs = 0; }
}

/** Moves to whatever comes after a finished set: a rest, the next set, the next exercise, or the end. */
function afterSet(s: RunnerState): void {
  const item = s.items[s.item];
  s.rep = 0;
  s.elapsedMs = 0;
  if (s.set + 1 < item.sets.length) {
    s.set += 1;
    const rest = item.sets[s.set - 1].restS;
    if (rest > 0) { s.phase = "rest"; s.remainingMs = rest * 1000; } else afterRest(s);
  } else if (s.item + 1 < s.items.length) {
    s.item += 1;
    s.set = 0;
    s.phase = "ready";
    s.remainingMs = 0;
  } else {
    s.phase = "finished";
    s.remainingMs = 0;
  }
}

/** A rest is over: a timed set starts by itself, a counted one waits to be started. */
function afterRest(s: RunnerState): void {
  s.remainingMs = 0;
  if (isTimed(s.items[s.item].sets[s.set])) enterWork(s, 0); else { s.phase = "ready"; s.elapsedMs = 0; }
}

function record(s: RunnerState, set: DoneSet): void {
  s.done.push({ item: s.item, set });
}

/** Finishes the current set with the reps and time it actually got, or drops it when nothing was done. */
function finishSet(s: RunnerState): void {
  const t = s.items[s.item].sets[s.set];
  const base = { loadKg: t.loadKg, edgeMm: t.edgeMm, grip: t.grip, restS: t.restS, done: true };
  if (s.phase === "work") {
    record(s, { ...base, reps: t.reps, timeS: null });
  } else if (t.onS !== null) {
    const reps = t.reps ?? 1;
    if (reps === 1) {
      // A single hold: the time actually held, whole seconds, at least one.
      const held = s.phase === "on" ? Math.min(t.onS, Math.max(0, Math.round(s.elapsedMs / 1000))) : t.onS;
      if (held >= 1) record(s, { ...base, reps: t.reps, timeS: held });
    } else {
      // Repeaters: the reps that were finished. A rep that was in progress doesn't count.
      const finished = s.phase === "on" ? s.rep : s.rep + 1;
      if (finished >= 1) record(s, { ...base, reps: finished, timeS: t.onS });
    }
  }
  afterSet(s);
}

function tick(s: RunnerState, ms: number): void {
  if (s.paused || ms <= 0) return;
  let left = ms;
  // Each pass either uses up the time or moves to another phase; a zero-length phase moves on without using any.
  for (let guard = 0; left > 0 && guard < 10_000; guard++) {
    if (s.phase === "work") { s.elapsedMs += left; return; }
    if (s.phase !== "on" && s.phase !== "off" && s.phase !== "rest") return;
    const use = Math.min(left, s.remainingMs);
    s.remainingMs -= use;
    left -= use;
    if (s.phase === "on") s.elapsedMs += use;
    if (s.remainingMs > 0) return;
    const t = s.items[s.item].sets[s.set];
    if (s.phase === "rest") afterRest(s);
    else if (s.phase === "off") enterWork(s, s.rep + 1);
    else if (s.rep + 1 < (t.reps ?? 1)) {
      if ((t.offS ?? 0) > 0) { s.phase = "off"; s.remainingMs = (t.offS ?? 0) * 1000; } else enterWork(s, s.rep + 1);
    } else {
      // The last rep ran out: the set was done in full.
      const full: DoneSet = { loadKg: t.loadKg, edgeMm: t.edgeMm, grip: t.grip, restS: t.restS, done: true, reps: t.reps, timeS: t.onS };
      record(s, full);
      afterSet(s);
    }
  }
}

export function step(state: RunnerState, e: RunnerEvent): RunnerState {
  if (state.phase === "finished" && e.type !== "tick") return state;
  const s = copy(state);
  switch (e.type) {
    case "start":
      if (s.phase === "ready") enterWork(s, 0);
      break;
    case "tick":
      tick(s, e.ms);
      break;
    case "done":
      if (s.phase === "on" || s.phase === "off" || s.phase === "work") finishSet(s);
      break;
    case "skipRest":
      if (s.phase === "rest") afterRest(s);
      break;
    case "addRest":
      if (s.phase === "rest") s.remainingMs += e.ms;
      break;
    case "pause":
      if (s.phase === "on" || s.phase === "off" || s.phase === "work" || s.phase === "rest") s.paused = true;
      break;
    case "resume":
      s.paused = false;
      break;
    case "edit":
      // A change applies to this set and every set after it in the exercise, so a raised weight carries on.
      if (s.phase === "ready" || s.phase === "rest") {
        const sets = s.items[s.item].sets;
        for (let i = s.set; i < sets.length; i++) sets[i] = { ...sets[i], ...e.patch };
      }
      break;
    case "addSet": {
      if (s.phase === "ready" || s.phase === "rest") {
        const sets = s.items[s.item].sets;
        sets.push({ ...sets[sets.length - 1] });
      }
      break;
    }
    case "skipExercise":
      if (s.phase !== "finished") {
        s.paused = false;
        if (s.item + 1 < s.items.length) { s.item += 1; s.set = 0; s.rep = 0; s.phase = "ready"; s.remainingMs = 0; s.elapsedMs = 0; } else { s.phase = "finished"; s.remainingMs = 0; }
      }
      break;
    case "finish":
      s.paused = false;
      s.phase = "finished";
      s.remainingMs = 0;
      break;
  }
  return s;
}

/**
 * The session as training entries, one per exercise that has a done set. Sets that were not done are not saved. `idFor` gives the id of
 * the exercise at an index in the session, so saving again as the session goes updates the same entries.
 */
export function toEntries(s: RunnerState, performedAt: string, effort: number | null, idFor: (item: number) => string): TrainingEntry[] {
  const out: TrainingEntry[] = [];
  s.items.forEach((item, i) => {
    const sets = s.done.filter((d) => d.item === i).map((d, position) => ({ ...d.set, position }));
    if (sets.length) out.push({ id: idFor(i), exerciseId: item.exerciseId, performedAt, effort, note: "", sets });
  });
  return out;
}
