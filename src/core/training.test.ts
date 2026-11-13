import { describe, expect, it } from "vitest";
import { activitiesOf, climbingDays } from "./activity";
import { bests, entryText, history, lastTime, parseTrainingEntry, setText, targetsFor, targetsFromTemplate, type TrainingEntry, type TrainingSet } from "./training";
import { exerciseById, searchExercises, EXERCISES } from "../data/exercises";
import type { Units } from "./settings";

const kg: Units = { weight: "kg", length: "m" };
const set = (over: Partial<TrainingSet> = {}): TrainingSet => ({ position: 0, reps: null, loadKg: 20, timeS: 10, edgeMm: 20, grip: "halfCrimp", restS: 180, done: true, ...over });
const entry = (over: Partial<TrainingEntry> = {}): TrainingEntry => ({
  id: "t1", exerciseId: "max-hang", performedAt: "2026-11-02 18:00:00", effort: 7, note: "", sets: [set(), set({ position: 1 })], ...over,
});
const wire = (over: Record<string, unknown> = {}) => JSON.parse(JSON.stringify({ ...entry(), ...over }));

describe("the library", () => {
  it("has unique ids, and every timed template has a work time and every counted one has reps", () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.template.sets, e.id).toBeGreaterThan(0);
      expect(e.template.onS !== null || e.template.reps !== null, e.id).toBe(true);
      if (e.template.offS !== null) expect(e.template.reps, e.id).toBeGreaterThan(1);
      // The fields a template fills are fields the exercise says it uses.
      if (e.template.edgeMm !== null) expect(e.fields, e.id).toContain("edgeMm");
      if (e.template.onS !== null) expect(e.fields, e.id).toContain("timeS");
    }
  });

  it("searches by every word, in the name, the category or the equipment", () => {
    expect(searchExercises(EXERCISES, "hang board", null).map((e) => e.id)).toContain("max-hang");
    expect(searchExercises(EXERCISES, "", "core").every((e) => e.category === "core")).toBe(true);
    expect(searchExercises(EXERCISES, "zzz", null)).toEqual([]);
    expect(exerciseById("nope")).toBeUndefined();
  });
});

describe("reading an entry from a file", () => {
  it("accepts a good entry unchanged", () => {
    expect(parseTrainingEntry(wire())).toEqual(entry());
  });

  it("renumbers set positions and trims a long note", () => {
    const p = parseTrainingEntry(wire({ note: "x".repeat(900), sets: [set({ position: 9 }), set({ position: 4 })] }))!;
    expect(p.sets.map((s) => s.position)).toEqual([0, 1]);
    expect(p.note).toHaveLength(500);
  });

  it("refuses damaged records instead of half-reading them", () => {
    expect(parseTrainingEntry(null)).toBeNull();
    expect(parseTrainingEntry(wire({ exerciseId: "not-in-library" }))).toBeNull();
    expect(parseTrainingEntry(wire({ performedAt: "yesterday" }))).toBeNull();
    expect(parseTrainingEntry(wire({ effort: 11 }))).toBeNull();
    expect(parseTrainingEntry(wire({ sets: [] }))).toBeNull();
    expect(parseTrainingEntry(wire({ sets: [set({ loadKg: 9999 })] }))).toBeNull();
    expect(parseTrainingEntry(wire({ sets: [set({ grip: "claw" as never })] }))).toBeNull();
    expect(parseTrainingEntry(wire({ sets: [{ ...set(), done: "yes" }] }))).toBeNull();
    expect(parseTrainingEntry(wire({ sets: Array.from({ length: 31 }, () => set()) }))).toBeNull();
  });
});

describe("what a session starts from", () => {
  const ex = exerciseById("repeaters")!;

  it("uses the template when the exercise has never been done", () => {
    expect(targetsFor(ex, undefined)).toEqual(targetsFromTemplate(ex));
    expect(targetsFor(ex, undefined)).toHaveLength(3);
  });

  it("repeats last time's sets and values, taking the last done set so a raised weight carries over", () => {
    const last = entry({ exerciseId: "repeaters", sets: [set({ reps: 6, timeS: 7, loadKg: 10 }), set({ position: 1, reps: 6, timeS: 7, loadKg: 12.5 }), set({ position: 2, done: false, loadKg: 99 })] });
    const t = targetsFor(ex, last);
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.loadKg === 12.5 && x.reps === 6 && x.onS === 7 && x.offS === 3)).toBe(true);
  });

  it("keeps a counted exercise counted, and ignores last time when nothing was done", () => {
    const pull = exerciseById("weighted-pull-up")!;
    const last = entry({ exerciseId: "weighted-pull-up", sets: [set({ reps: 4, timeS: null, edgeMm: null, grip: null, loadKg: 7.5, restS: 120 })] });
    expect(targetsFor(pull, last)[0]).toMatchObject({ reps: 4, onS: null, loadKg: 7.5, restS: 120 });
    expect(targetsFor(pull, entry({ exerciseId: "weighted-pull-up", sets: [set({ done: false })] }))).toEqual(targetsFromTemplate(pull));
  });
});

describe("history of one exercise", () => {
  const list = [
    entry({ id: "a", performedAt: "2026-10-01 10:00:00", sets: [set({ loadKg: 15 })] }),
    entry({ id: "b", performedAt: "2026-10-20 10:00:00", sets: [set({ loadKg: 20 }), set({ position: 1, loadKg: 22.5, timeS: 12 })] }),
    entry({ id: "c", performedAt: "2026-10-25 10:00:00", exerciseId: "plank", sets: [set({ loadKg: null, timeS: 45 })] }),
    entry({ id: "d", performedAt: "2026-10-27 10:00:00", sets: [set({ loadKg: 99, done: false })] }),
  ];

  it("finds the last time (done sets only) and the bests", () => {
    expect(lastTime(list, "max-hang")?.id).toBe("b");
    expect(lastTime(list, "face-pull")).toBeUndefined();
    expect(bests(list, "max-hang")).toEqual({ loadKg: 22.5, timeS: 12 });
    expect(bests(list, "face-pull")).toEqual({ loadKg: null, timeS: null });
  });

  it("charts the heaviest load per session, oldest first, or the hold time when there is no load", () => {
    expect(history(list, "max-hang")).toEqual({ unit: "kg", points: [{ at: "2026-10-01 10:00:00", value: 15 }, { at: "2026-10-20 10:00:00", value: 22.5 }] });
    expect(history(list, "plank")).toEqual({ unit: "s", points: [{ at: "2026-10-25 10:00:00", value: 45 }] });
    expect(history(list, "face-pull")).toEqual({ unit: null, points: [] });
  });

  it("totals reps for exercises with no load and no time", () => {
    const l = [entry({ exerciseId: "push-up", sets: [set({ reps: 12, loadKg: null, timeS: null }), set({ position: 1, reps: 10, loadKg: null, timeS: null })] })];
    expect(history(l, "push-up")).toEqual({ unit: "reps", points: [{ at: "2026-11-02 18:00:00", value: 22 }] });
  });
});

describe("describing sets", () => {
  it("shows only what the set has, in the user's weight unit", () => {
    expect(setText(set({ reps: 6, timeS: 7 }), kg)).toBe("6 \u00D7 7 s \u00B7 20 mm \u00B7 +20 kg \u00B7 Half crimp");
    expect(setText(set({ reps: 5, timeS: null, edgeMm: null, grip: null, loadKg: null }), kg)).toBe("5 reps");
    expect(setText(set({ timeS: 10, loadKg: -10, edgeMm: null, grip: "none" }), { weight: "lb", length: "ft" })).toBe("10 s \u00B7 -22 lb");
  });

  it("summarises an entry by its done sets", () => {
    expect(entryText(entry(), kg)).toBe("2 sets: 10 s \u00B7 20 mm \u00B7 +20 kg \u00B7 Half crimp");
    expect(entryText(entry({ sets: [set({ done: false })] }), kg)).toBe("No sets done");
  });
});

describe("training as an activity", () => {
  it("counts as a climbing day, is never a send, and marks finger-intense work", () => {
    const list = activitiesOf({ training: [entry(), entry({ id: "t2", exerciseId: "plank", performedAt: "2026-11-04 09:00:00", sets: [set({ loadKg: null, timeS: 45 })] })], gradeOf: () => 0 });
    expect(list.map((a) => a.kind)).toEqual(["training", "training"]);
    expect(climbingDays(list)).toEqual(["2026-11-02", "2026-11-04"]);
    const hang = list.find((a) => a.id === "training:t1")!;
    expect(hang.facts).toMatchObject({ discipline: "training", send: false, grade: null, tries: 2, effort: 7, fingerIntense: true });
    expect(list.find((a) => a.id === "training:t2")!.facts.fingerIntense).toBe(false);
  });

  it("does not count an entry with no done set as a day of training", () => {
    expect(activitiesOf({ training: [entry({ sets: [set({ done: false })] })], gradeOf: () => 0 })).toEqual([]);
  });
});
