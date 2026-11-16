import { describe, expect, it } from "vitest";
import { describeTarget, runnerFace } from "./remoteRunner";
import { startRunner, step, type RunnerItem } from "./sessionRunner";

const colors = { work: "#34D17D", rest: "#4C8DFF", ready: "#C5CBC9" };
const hang = { reps: 1, onS: 10, offS: null, loadKg: 0, edgeMm: 20, grip: "halfCrimp" as const, restS: 120, timeS: null, done: false, feel: null };
const items: RunnerItem[] = [{ exerciseId: "max-hang", sets: [hang, hang, hang] }, { exerciseId: "pull-up-ladder", sets: [{ ...hang, onS: null, reps: 5 }] }];

describe("the training set as the watch shows it", () => {
  it("is ready before the start, with the set number and what comes next", () => {
    const f = runnerFace(startRunner(items), colors)!;
    expect(f).toMatchObject({ phase: "ready", label: "Ready", set: 1, sets: 3, ms: 0, paused: false, color: colors.ready });
    expect(f.next).toBeTruthy();
  });
  it("counts down a hang in milliseconds and counts up a counted set", () => {
    let s = step(startRunner(items), { type: "start" });
    expect(runnerFace(s, colors)).toMatchObject({ phase: "on", label: "Hang", ms: 10_000, color: colors.work });
    s = step(s, { type: "tick", ms: 4000 });
    expect(runnerFace(s, colors)!.ms).toBe(6000);
  });
  it("shows the rest in the rest colour and the pause", () => {
    let s = step(startRunner(items), { type: "start" });
    s = step(s, { type: "done" });
    expect(runnerFace(s, colors)).toMatchObject({ phase: "rest", label: "Rest", color: colors.rest, set: 2 });
    expect(runnerFace(step(s, { type: "pause" }), colors)!.paused).toBe(true);
  });
  it("has nothing to show once the session is finished", () => {
    expect(runnerFace(step(startRunner(items), { type: "finish" }), colors)).toBeNull();
  });
  it("describes a set in a phrase", () => {
    expect(describeTarget({ ...hang, reps: 6, onS: 7, offS: 3 })).toBe("6 \u00D7 7 s on, 3 s off");
    expect(describeTarget({ ...hang, onS: null, reps: 5 })).toBe("5 reps");
  });
});
