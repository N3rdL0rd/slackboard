export interface TimerConfig {
  /** Get-ready countdown before the first rep. */
  prepSec: number;
  workSec: number;
  restSec: number;
  reps: number;
  sets: number;
  /** Rest between sets (not after the last one). */
  setRestSec: number;
}

export type SegmentKind = "prep" | "work" | "rest" | "setrest";

export interface Segment {
  kind: SegmentKind;
  sec: number;
  /** 1-based rep and set this segment belongs to. */
  rep: number;
  set: number;
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  config: TimerConfig;
}

export const PRESETS: Preset[] = [
  { id: "repeaters", name: "Repeaters", blurb: "7 s hang, 3 s rest, 6 reps, 3 sets", config: { prepSec: 10, workSec: 7, restSec: 3, reps: 6, sets: 3, setRestSec: 180 } },
  { id: "maxhang", name: "Max hangs", blurb: "10 s hang, 3 min rest, 5 reps", config: { prepSec: 10, workSec: 10, restSec: 180, reps: 5, sets: 1, setRestSec: 0 } },
  { id: "4x4", name: "4x4", blurb: "4 boulders, 3 min rest, 4 rounds", config: { prepSec: 10, workSec: 180, restSec: 60, reps: 4, sets: 4, setRestSec: 240 } },
  { id: "limit", name: "Limit bouldering", blurb: "3 min on, 3 min off, 6 rounds", config: { prepSec: 10, workSec: 180, restSec: 180, reps: 6, sets: 1, setRestSec: 0 } },
];

export const DEFAULT_CONFIG: TimerConfig = PRESETS[0].config;

export const REST_PRESETS_SEC = [60, 120, 180, 300];

/** Every segment of a session in order. Rest follows each rep except the last of a set; a set rest follows each set except the last. */
export function buildSchedule(cfg: TimerConfig): Segment[] {
  const out: Segment[] = [];
  const reps = Math.max(1, Math.floor(cfg.reps));
  const sets = Math.max(1, Math.floor(cfg.sets));
  if (cfg.prepSec > 0) out.push({ kind: "prep", sec: cfg.prepSec, rep: 1, set: 1 });
  for (let s = 1; s <= sets; s++) {
    for (let r = 1; r <= reps; r++) {
      if (cfg.workSec > 0) out.push({ kind: "work", sec: cfg.workSec, rep: r, set: s });
      if (r < reps && cfg.restSec > 0) out.push({ kind: "rest", sec: cfg.restSec, rep: r, set: s });
    }
    if (s < sets && cfg.setRestSec > 0) out.push({ kind: "setrest", sec: cfg.setRestSec, rep: reps, set: s });
  }
  return out;
}

/** One plain countdown, for rest between attempts. */
export const countdown = (sec: number): Segment[] => [{ kind: "rest", sec, rep: 1, set: 1 }];

export interface TimerState {
  /** Index of the current segment; equals the schedule length when finished. */
  index: number;
  segment: Segment | null;
  remainingMs: number;
  totalMs: number;
  elapsedMs: number;
  done: boolean;
}

export function stateAt(schedule: Segment[], elapsedMs: number): TimerState {
  const totalMs = schedule.reduce((n, s) => n + s.sec * 1000, 0);
  let left = Math.max(0, elapsedMs);
  for (let i = 0; i < schedule.length; i++) {
    const ms = schedule[i].sec * 1000;
    if (left < ms) return { index: i, segment: schedule[i], remainingMs: ms - left, totalMs, elapsedMs: elapsedMs, done: false };
    left -= ms;
  }
  return { index: schedule.length, segment: null, remainingMs: 0, totalMs, elapsedMs: Math.min(elapsedMs, totalMs), done: true };
}

/** Elapsed time at which segment `index` starts, for skipping ahead. */
export function startOf(schedule: Segment[], index: number): number {
  return schedule.slice(0, index).reduce((n, s) => n + s.sec * 1000, 0);
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
