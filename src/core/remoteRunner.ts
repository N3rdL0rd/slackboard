/** The training session as the watch shows it: the set in progress, its countdown and what comes next. Pure. */
import { exerciseById } from "../data/exercises";
import type { RemoteRunner } from "./remote";
import { currentTarget, type RunnerState } from "./sessionRunner";
import type { SetTarget } from "./training";

/** What a set asks for, in a phrase: "6 \u00D7 7 s on, 3 s off", "10 s hold", "5 reps". */
export function describeTarget(t: SetTarget): string {
  if (t.onS === null) return t.reps === null ? "Do the set" : `${t.reps} reps`;
  if ((t.reps ?? 1) > 1) return `${t.reps} \u00D7 ${t.onS} s on, ${t.offS ?? 0} s off`;
  return `${t.onS} s hold`;
}

const clock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const LABELS = { on: "Hang", work: "Go", off: "Off", rest: "Rest", ready: "Ready", finished: "Done" } as const;

export interface RunnerColors { work: string; rest: string; ready: string }

export function runnerFace(s: RunnerState, colors: RunnerColors): RemoteRunner | null {
  if (s.phase === "finished") return null;
  const t = currentTarget(s);
  const item = s.items[s.item];
  const ex = item ? exerciseById(item.exerciseId) : undefined;
  if (!t || !item || !ex) return null;
  const base = LABELS[s.phase];
  const label = s.phase === "on" && (t.reps ?? 1) > 1 ? `${base} ${s.rep + 1} of ${t.reps}` : base;
  const timed = s.phase === "on" || s.phase === "off" || s.phase === "rest";
  const ms = timed ? Math.max(0, Math.round(s.remainingMs)) : s.phase === "work" ? Math.max(0, Math.round(s.elapsedMs)) : 0;
  const next = s.items[s.item + 1];
  return {
    phase: s.phase, label, name: ex.name, set: s.set + 1, sets: item.sets.length,
    target: describeTarget(t), ms, paused: s.paused,
    big: s.phase === "ready" ? (t.onS !== null ? clock(t.onS * 1000) : String(t.reps ?? "")) : "",
    next: next ? exerciseById(next.exerciseId)?.name ?? null : null,
    color: s.phase === "on" || s.phase === "work" ? colors.work : s.phase === "ready" ? colors.ready : colors.rest,
  };
}
