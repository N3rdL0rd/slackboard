import { describe, expect, it } from "vitest";
import { currentTarget, setSeconds, startRunner, step, toEntries, type RunnerEvent, type RunnerState } from "./sessionRunner";
import type { SetTarget } from "./training";

const hang = (over: Partial<SetTarget> = {}): SetTarget => ({ reps: null, onS: 10, offS: null, restS: 60, loadKg: 20, edgeMm: 20, grip: "halfCrimp", ...over });
const pulls = (over: Partial<SetTarget> = {}): SetTarget => ({ reps: 5, onS: null, offS: null, restS: 30, loadKg: null, edgeMm: null, grip: null, ...over });
const run = (s: RunnerState, ...events: RunnerEvent[]): RunnerState => events.reduce(step, s);
const secs = (n: number): RunnerEvent => ({ type: "tick", ms: n * 1000 });

describe("session runner", () => {
  it("starts ready on the first set, and drops unknown exercises and empty ones", () => {
    const s = startRunner([{ exerciseId: "nope", sets: [hang()] }, { exerciseId: "max-hang", sets: [] }, { exerciseId: "max-hang", sets: [hang()] }]);
    expect(s.items).toHaveLength(1);
    expect(s.phase).toBe("ready");
    expect(startRunner([]).phase).toBe("finished");
  });

  it("counts a hang down by itself, then rests, then starts the next set by itself", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang()] }]);
    s = run(s, { type: "start" });
    expect(s).toMatchObject({ phase: "on", remainingMs: 10_000 });
    s = run(s, secs(10));
    expect(s).toMatchObject({ phase: "rest", set: 1, remainingMs: 60_000 });
    expect(s.done).toHaveLength(1);
    expect(s.done[0].set).toMatchObject({ timeS: 10, loadKg: 20, done: true });
    s = run(s, secs(60));
    expect(s).toMatchObject({ phase: "on", set: 1 });
  });

  it("catches up through every phase when a long time passes at once", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang()] }]);
    s = run(s, { type: "start" }, secs(10 + 60 + 4));
    expect(s).toMatchObject({ phase: "on", set: 1 });
    expect(s.remainingMs).toBe(6000);
    s = run(s, secs(10 + 100));
    expect(s.phase).toBe("finished");
    expect(s.done).toHaveLength(2);
  });

  it("records the time actually held when Done is tapped early, and nothing for under a second", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang()] }]);
    s = run(s, { type: "start" }, secs(6.4), { type: "done" });
    expect(s.done[0].set.timeS).toBe(6);
    s = run(s, { type: "skipRest" }, { type: "done" });
    expect(s.done).toHaveLength(1);
    expect(s.phase).toBe("finished");
  });

  it("runs repeaters as on and off reps inside one set", () => {
    const t = hang({ reps: 3, onS: 7, offS: 3, restS: 0 });
    expect(setSeconds(t)).toBe(7 * 3 + 3 * 2);
    let s = startRunner([{ exerciseId: "repeaters", sets: [t] }]);
    s = run(s, { type: "start" }, secs(7));
    expect(s).toMatchObject({ phase: "off", rep: 0, remainingMs: 3000 });
    s = run(s, secs(3));
    expect(s).toMatchObject({ phase: "on", rep: 1 });
    s = run(s, secs(7 + 3 + 7));
    expect(s.phase).toBe("finished");
    expect(s.done[0].set).toMatchObject({ reps: 3, timeS: 7 });
  });

  it("counts only finished reps when a repeaters set is ended early", () => {
    const t = hang({ reps: 6, onS: 7, offS: 3, restS: 0 });
    let s = startRunner([{ exerciseId: "repeaters", sets: [t, t] }]);
    s = run(s, { type: "start" }, secs(7 + 3 + 7 + 3 + 4), { type: "done" });
    expect(s.done[0].set).toMatchObject({ reps: 2 });
    s = run(s, { type: "skipRest" }, { type: "start" });
    s = run(s, { type: "done" });
    expect(s.done).toHaveLength(1);
  });

  it("holds a counted set until Done, with no countdown", () => {
    let s = startRunner([{ exerciseId: "weighted-pull-up", sets: [pulls({ loadKg: 5 }), pulls({ loadKg: 5 })] }]);
    s = run(s, { type: "start" }, secs(500));
    expect(s.phase).toBe("work");
    expect(s.elapsedMs).toBe(500_000);
    s = run(s, { type: "done" });
    expect(s.done[0].set).toMatchObject({ reps: 5, timeS: null, loadKg: 5 });
    expect(s).toMatchObject({ phase: "rest", set: 1 });
    // A counted set waits to be started after its rest.
    s = run(s, secs(30));
    expect(s.phase).toBe("ready");
  });

  it("goes to the next exercise ready, with no rest between exercises, and finishes after the last", () => {
    let s = startRunner([{ exerciseId: "plank", sets: [hang({ onS: 5, restS: 99 })] }, { exerciseId: "push-up", sets: [pulls()] }]);
    s = run(s, { type: "start" }, secs(5));
    expect(s).toMatchObject({ phase: "ready", item: 1, set: 0 });
    s = run(s, { type: "start" }, { type: "done" });
    expect(s.phase).toBe("finished");
    expect(s.done.map((d) => d.item)).toEqual([0, 1]);
  });

  it("pauses the clock and resumes it", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang()] }]);
    s = run(s, { type: "start" }, secs(3), { type: "pause" }, secs(100));
    expect(s.remainingMs).toBe(7000);
    s = run(s, { type: "resume" }, secs(7));
    expect(s.phase).toBe("finished");
  });

  it("adds rest and skips it", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang()] }]);
    s = run(s, { type: "start" }, secs(10), { type: "addRest", ms: 30_000 });
    expect(s.remainingMs).toBe(90_000);
    s = run(s, { type: "skipRest" });
    expect(s.phase).toBe("on");
  });

  it("applies an edit to this set and the ones after it only", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang(), hang()] }]);
    s = run(s, { type: "start" }, secs(10), { type: "edit", patch: { loadKg: 25 } });
    expect(s.items[0].sets.map((t) => t.loadKg)).toEqual([20, 25, 25]);
    // Not while a hang is running.
    s = run(s, { type: "skipRest" }, { type: "edit", patch: { loadKg: 99 } });
    expect(s.items[0].sets[1].loadKg).toBe(25);
  });

  it("adds an extra set, copying the last", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang({ loadKg: 30 })] }]);
    s = run(s, { type: "addSet" });
    expect(s.items[0].sets).toHaveLength(2);
    expect(s.items[0].sets[1].loadKg).toBe(30);
    expect(currentTarget(s)?.loadKg).toBe(30);
  });

  it("finishes early, keeping what was done, and ignores events after", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang(), hang()] }, { exerciseId: "plank", sets: [hang()] }]);
    s = run(s, { type: "start" }, secs(10), { type: "finish" });
    expect(s.phase).toBe("finished");
    expect(run(s, { type: "start" }, { type: "done" })).toBe(s);
    const entries = toEntries(s, "2026-11-12 10:00:00", 7, (i) => `e${i + 1}`);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "e1", exerciseId: "max-hang", effort: 7, performedAt: "2026-11-12 10:00:00" });
    expect(entries[0].sets).toHaveLength(1);
    expect(entries[0].sets[0].position).toBe(0);
  });

  it("skips the rest of an exercise and moves to the next", () => {
    let s = startRunner([{ exerciseId: "max-hang", sets: [hang(), hang()] }, { exerciseId: "plank", sets: [hang()] }]);
    s = run(s, { type: "start" }, secs(10), { type: "skipExercise" });
    expect(s).toMatchObject({ phase: "ready", item: 1, set: 0 });
    expect(run(s, { type: "skipExercise" }).phase).toBe("finished");
  });
});
