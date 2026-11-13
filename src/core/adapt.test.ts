import { describe, expect, it } from "vitest";
import { adaptSession, blockOver, nextBlockProposal, retestDue, retestReport, settleMissed, verdictFor, type AdaptContext } from "./adapt";
import { blankNote, type DayNote } from "./body";
import { addDays, type Day } from "./days";
import { buildPlan, DEFAULT_PROFILE, type Plan, type PlanSession, type Tests } from "./planner";
import type { Feel, TrainingEntry, TrainingSet } from "./training";

const MON: Day = "2026-11-09";
const TESTS: Tests = { hang7: 30, pullups: 12, legRaises: 10, hangFail: 40 };
let n = 0;
const ids = () => `s${++n}`;
const plan = (): Plan =>
  buildPlan({ id: "p", today: MON, createdAt: "2026-11-09 08:00:00", profile: { ...DEFAULT_PROFILE, bodyKg: 70, daysPerWeek: 3, trainDays: [0, 2, 4], climbDays: [], equipment: ["hangboard", "weights", "pullupBar"] }, tests: TESTS, logs: [], newId: ids, climbingHistory: [] } as never);
const fingerSession = (p: Plan): PlanSession => p.sessions.find((s) => s.slot === "finger" && s.items.some((i) => i.exerciseId === "max-hang" && i.sets.some((t) => (t.loadKg ?? 0) > 0))) ?? p.sessions.find((s) => s.slot === "finger")!;

const set = (over: Partial<TrainingSet> = {}): TrainingSet => ({ position: 0, reps: null, loadKg: 20, timeS: 10, edgeMm: 20, grip: "halfCrimp", restS: 180, done: true, feel: null, ...over });
const entry = (feel: Feel | null, over: Partial<TrainingEntry> = {}): TrainingEntry => ({ id: "e", exerciseId: "max-hang", performedAt: "2026-11-05 18:00:00", effort: 6, note: "", sets: [set({ feel }), set({ feel }), set({ feel })], ...over });
const ctx = (over: Partial<AdaptContext> = {}): AdaptContext => ({ today: MON, entries: [], notes: [], activities: [], working: {}, blockKind: "strength", ...over });
const loadOf = (s: PlanSession) => Math.max(...s.items.find((i) => i.exerciseId === "max-hang")!.sets.map((t) => t.loadKg ?? 0));

describe("what last time says", () => {
  it("follows the schedule with no ratings or no history", () => {
    expect(verdictFor(undefined).verdict).toBe("follow");
    expect(verdictFor(entry(null)).verdict).toBe("follow");
  });
  it("progresses only when most are easy and none hard", () => {
    expect(verdictFor(entry("easy")).verdict).toBe("progress");
    expect(verdictFor({ ...entry("easy"), sets: [set({ feel: "easy" }), set({ feel: "easy" }), set({ feel: "hard" })] }).verdict).toBe("follow");
  });
  it("holds on effort 9 and steps back when every set was hard", () => {
    expect(verdictFor(entry("easy", { effort: 9 })).verdict).toBe("hold");
    expect(verdictFor(entry("hard")).verdict).toBe("back");
  });
});

describe("adapting a session", () => {
  const s = fingerSession(plan());
  it("adds a little load after an easy session, and says why", () => {
    const base = loadOf(s);
    const r = adaptSession(s, ctx({ entries: [entry("easy", { sets: [set({ feel: "easy", loadKg: base }), set({ feel: "easy", loadKg: base })] })] }));
    expect(loadOf(r.session)).toBe(base + 1);
    expect(r.reasons.join(" ")).toMatch(/felt easy/);
  });
  it("never adds load in a starter block", () => {
    const r = adaptSession(s, ctx({ blockKind: "starter", entries: [entry("easy")] }));
    expect(loadOf(r.session)).toBeLessThanOrEqual(loadOf(s));
  });
  it("steps back after an all-hard session", () => {
    const base = loadOf(s);
    const r = adaptSession(s, ctx({ entries: [entry("hard", { sets: [set({ feel: "hard", loadKg: base }), set({ feel: "hard", loadKg: base })] })] }));
    expect(loadOf(r.session)).toBe(base - 1);
  });
  it("holds off finger work after sharp pain, whatever else is true", () => {
    const hurt: DayNote = { ...blankNote(addDays(MON, -2)), fingers: "hurts" };
    const r = adaptSession(s, ctx({ notes: [hurt], entries: [entry("easy")] }));
    expect(r.session.light).toBe(true);
    expect(r.session.items.some((i) => i.exerciseId === "max-hang")).toBe(false);
    expect(r.reasons[0]).toMatch(/sharp finger pain/);
  });
  it("lightens for sore fingers", () => {
    const sore: DayNote = { ...blankNote(MON), fingers: "sore" };
    const r = adaptSession(s, ctx({ notes: [sore] }));
    expect(r.session.light).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/sore/);
  });
  it("lightens for low energy", () => {
    const tired: DayNote = { ...blankNote(MON), energy: 1 };
    expect(adaptSession(s, ctx({ notes: [tired] })).session.light).toBe(true);
  });
  it("leaves a session that is not planned alone", () => {
    const done = { ...s, status: "done" as const };
    expect(adaptSession(done, ctx({ entries: [entry("easy")] })).session).toBe(done);
  });
});

describe("missed sessions", () => {
  it("marks past planned sessions skipped without moving anything", () => {
    const p = plan();
    const later = addDays(MON, 3);
    const r = settleMissed(p, later);
    expect(r.changed).toBe(true);
    expect(r.plan.sessions.filter((x) => x.day < later).every((x) => x.status !== "planned")).toBe(true);
    expect(r.plan.sessions.map((x) => x.day)).toEqual(p.sessions.map((x) => x.day));
  });
  it("changes nothing when nothing is overdue", () => {
    const p = plan();
    expect(settleMissed(p, MON).plan).toBe(p);
  });
});

describe("retests and the next block", () => {
  const p = plan();
  it("offers a retest in the last week only", () => {
    expect(retestDue(p, MON)).toBe(false);
    expect(retestDue(p, addDays(MON, 7 * (p.block.retestWeek - 1)))).toBe(true);
    expect(blockOver(p, addDays(MON, p.block.weeks * 7))).toBe(true);
  });
  it("compares each test before and after the plan began", () => {
    const rep = retestReport(p, [
      { id: "1", test: "hang7", value: 30, takenAt: "2026-11-01 10:00:00" },
      { id: "2", test: "hang7", value: 33, takenAt: "2027-01-10 10:00:00" },
      { id: "3", test: "pullups", value: 12, takenAt: "2026-11-01 10:00:00" },
    ]);
    expect(rep).toHaveLength(1);
    expect(rep[0]).toMatchObject({ test: "hang7", delta: 3, percent: 10 });
  });
  it("turns to the other emphasis after a real gain, and repeats gently after a flat result", () => {
    const gain = nextBlockProposal(p, [{ test: "hang7", before: 30, after: 33, delta: 3, percent: 10 }]);
    const flat = nextBlockProposal(p, [{ test: "hang7", before: 30, after: 30, delta: 0, percent: 0 }]);
    expect(gain.emphasis).not.toBe(p.block.emphasis);
    expect(flat.emphasis).toBe(p.block.emphasis);
  });
});
