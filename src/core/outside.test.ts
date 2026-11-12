import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { GRADE_ROWS } from "./gradeTable";
import { GradeScale } from "./grades";
import { ensureLocalSchema } from "./logicalCircuits";
import { openNodeDb } from "./nodeDb";
import {
  adjustedGrade, adviceText, draftFromCombo, quickLabel, recentGymCombos, outsideAsEntries, gymTarget, gymTargetText, angleAdvice, angleForStyle, angleSamples, cleanLink, draftProblem, gradeOptions, makeOutsideLog, normaliseResult, oppositeStyle, outsideEvidence, sharedGrade, snapAngle, styleOfAngle, styleProfile,
  type OutsideDraft, type OutsideLog,
} from "./outside";
import { deleteOutside, loadOutside, saveOutside } from "./outsideLocal";
import { overview } from "./stats";
import type { LogEntry } from "./types";

const scale = new GradeScale(GRADE_ROWS);

const draft = (over: Partial<OutsideDraft> = {}): OutsideDraft => ({
  setting: "gym", name: "", venue: "", link: "", wall: "overhang", gradeSystem: "v", gradeLabel: "V4", result: "send", attempts: 3, tags: [], note: "", ...over,
});

describe("wall categories", () => {
  it("puts board angles in the category a climber would call them", () => {
    expect(styleOfAngle(-10)).toBe("slab");
    expect([0, 5].map(styleOfAngle)).toEqual(["vertical", "vertical"]);
    expect([10, 15, 20].map(styleOfAngle)).toEqual(["slight", "slight", "slight"]);
    expect([25, 30, 35].map(styleOfAngle)).toEqual(["overhang", "overhang", "overhang"]);
    expect([40, 55, 70].map(styleOfAngle)).toEqual(["steep", "steep", "steep"]);
  });
});

describe("results", () => {
  it("makes a flash one try, and a one-try send a flash", () => {
    expect(normaliseResult("flash", 5)).toEqual({ result: "flash", attempts: 1 });
    expect(normaliseResult("send", 1)).toEqual({ result: "flash", attempts: 1 });
    expect(normaliseResult("send", 4)).toEqual({ result: "send", attempts: 4 });
  });
  it("keeps attempts-only records and clamps the count", () => {
    expect(normaliseResult("attempt", 1)).toEqual({ result: "attempt", attempts: 1 });
    expect(normaliseResult("attempt", 0)).toEqual({ result: "attempt", attempts: 1 });
    expect(normaliseResult("attempt", 500).attempts).toBe(99);
  });
});

describe("links", () => {
  it("accepts web addresses, adds https to a bare one, and rejects anything else", () => {
    expect(cleanLink("")).toBe("");
    expect(cleanLink("  https://www.mountainproject.com/route/123/foo  ")).toBe("https://www.mountainproject.com/route/123/foo");
    expect(cleanLink("mountainproject.com/route/1")).toBe("https://mountainproject.com/route/1");
    expect(cleanLink("javascript:alert(1)")).toBeNull();
    expect(cleanLink("not a link")).toBeNull();
  });
});

describe("drafts", () => {
  it("needs a wall angle, a grade for a send, and a usable link; attempts need no grade", () => {
    expect(draftProblem(draft({ wall: null }))).toMatch(/wall angle/i);
    expect(draftProblem(draft({ gradeLabel: null }))).toMatch(/grade/i);
    expect(draftProblem(draft({ gradeLabel: null, result: "attempt" }))).toBeNull();
    expect(draftProblem(draft({ link: "nope nope" }))).toMatch(/link/i);
    expect(draftProblem(draft())).toBeNull();
  });
  it("builds the stored log: flash normalised, grade on the shared scale, outdoor link cleaned", () => {
    const l = makeOutsideLog(draft({ setting: "outdoor", venue: " Hueco ", link: "mountainproject.com/route/1", result: "send", attempts: 1 }), scale, "x", "2026-11-01 10:00:00");
    expect(l).toMatchObject({ setting: "outdoor", venue: "Hueco", link: "https://mountainproject.com/route/1", result: "flash", attempts: 1, gradeLabel: "V4" });
    expect(Math.floor(l.grade!)).toBe(4);
    expect(() => makeOutsideLog(draft({ wall: null }), scale, "y", "2026-11-01 10:00:00")).toThrow();
  });
  it("stores an attempts-only record without a grade", () => {
    const l = makeOutsideLog(draft({ result: "attempt", gradeLabel: null }), scale, "z", "2026-11-01 10:00:00");
    expect(l.grade).toBeNull();
    expect(l.gradeSystem).toBeNull();
  });
});

describe("grade systems", () => {
  it("lists V and Font grades in order, once each, and they agree on the shared scale", () => {
    const v = gradeOptions(scale, "v").map((g) => g.label);
    const f = gradeOptions(scale, "font").map((g) => g.label);
    expect(v.slice(0, 4)).toEqual(["V0", "V1", "V2", "V3"]);
    expect(new Set(v).size).toBe(v.length);
    expect(f).toContain("6b+");
    expect(Math.floor(sharedGrade(scale, "font", "6b+")!)).toBe(Math.floor(sharedGrade(scale, "v", "V4")!));
    expect(sharedGrade(scale, "v", "V99")).toBeNull();
  });
});

const log = (over: Partial<LogEntry>): LogEntry => ({
  id: "1", provider: "tension", climbUuid: "A", climbName: "c", angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty: 20, comment: "", climbedAt: "2026-11-01 10:00:00", isSend: true, ...over,
});
const out = (over: Partial<OutsideLog>): OutsideLog => ({
  id: "o", setting: "gym", name: "", venue: "", link: "", wall: "vertical", gradeSystem: "v", gradeLabel: "V5", grade: 5, result: "send", attempts: 2, tags: [], note: "", climbedAt: "2026-11-01 10:00:00", ...over,
});
const NOW = new Date(2026, 10, 10);

describe("angle advice", () => {
  it("collects graded sends with their angle and ignores attempts and ungraded ones", () => {
    const s = angleSamples([log({ angle: 40 }), log({ isSend: false }), log({ difficulty: 0 })], [out({ wall: "slab" }), out({ result: "attempt" }), out({ grade: null })], () => 4.5);
    expect(s.map((x) => x.angle)).toEqual([40, -5]);
  });
  it("finds the angle you are weakest at once two categories have three sends each", () => {
    const samples = [
      ...[5.2, 5.0, 5.4].map((grade) => ({ angle: 0, grade, climbedAt: "2026-11-01 10:00:00" })),
      ...[3.9, 3.5, 4.0].map((grade) => ({ angle: 35, grade, climbedAt: "2026-11-01 10:00:00" })),
    ];
    const a = angleAdvice(samples, NOW)!;
    expect(a.best.style).toBe("vertical");
    expect(a.weak.style).toBe("overhang");
    expect(a.worthTraining).toBe(true);
    expect(a.targetAngle).toBe(30);
    expect(adviceText(a, (g) => `V${Math.floor(g)}`)).toContain("V5 on vertical walls but V3 on overhang");
  });
  it("says to use any angle when the grades are even, and gives nothing without enough data", () => {
    const even = [4.0, 4.1, 4.2].flatMap((grade) => [{ angle: 0, grade, climbedAt: "2026-11-01 10:00:00" }, { angle: 35, grade, climbedAt: "2026-11-01 10:00:00" }]);
    const a = angleAdvice(even, NOW)!;
    expect(a.worthTraining).toBe(false);
    expect(adviceText(a, (g) => `V${Math.floor(g)}`)).toMatch(/even/);
    expect(angleAdvice([{ angle: 0, grade: 4, climbedAt: "2026-11-01 10:00:00" }], NOW)).toBeNull();
    expect(angleAdvice(even.slice(0, 3), NOW)).toBeNull();
  });
  it("prefers recent sends once there are enough of them", () => {
    const old = (angle: number) => [6, 6, 6].map((grade) => ({ angle, grade, climbedAt: "2025-01-01 10:00:00" }));
    const recent = [...[4, 4, 4].map((grade) => ({ angle: 0, grade, climbedAt: "2026-11-01 10:00:00" })), ...[4, 4, 4].map((grade) => ({ angle: 35, grade, climbedAt: "2026-11-01 10:00:00" }))];
    expect(angleAdvice([...old(0), ...recent], NOW)!.best.working).toBe(4);
  });
  it("snaps to the nearest angle a board offers, lower on a tie, and nothing for a fixed board", () => {
    expect(snapAngle(30, [0, 10, 20, 25, 35, 40])).toBe(25);
    expect(snapAngle(-5, [0, 10, 20])).toBe(0);
    expect(snapAngle(30, [40])).toBeNull();
  });
});

describe("storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });
  it("round-trips a log with tags and link, newest first, and deletes it", async () => {
    const a = out({ id: "a", setting: "outdoor", name: "The Mandala", venue: "Bishop", link: "https://www.mountainproject.com/route/1", tags: ["Crimpy", "Powerful"], climbedAt: "2026-11-01 09:00:00" });
    const b = out({ id: "b", result: "attempt", gradeSystem: null, gradeLabel: null, grade: null, climbedAt: "2026-11-02 09:00:00" });
    await saveOutside(db, a);
    await saveOutside(db, b);
    expect((await loadOutside(db)).map((x) => x.id)).toEqual(["b", "a"]);
    expect((await loadOutside(db)).find((x) => x.id === "a")).toEqual(a);
    expect((await loadOutside(db)).find((x) => x.id === "b")).toEqual(b);
    await deleteOutside(db, "a");
    expect((await loadOutside(db)).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("grade offsets", () => {
  it("counts an outdoor grade a V harder and a gym grade half a V easier, and leaves the stored grade alone", () => {
    const o = out({ setting: "outdoor", grade: 4 });
    const g = out({ setting: "gym", grade: 4 });
    expect(adjustedGrade(o)).toBe(5);
    expect(adjustedGrade(g)).toBe(3.5);
    expect(o.grade).toBe(4);
    expect(adjustedGrade(out({ grade: null }))).toBeNull();
  });
  it("applies the offset to angle samples and to grade evidence, and skips attempts and ungraded ones", () => {
    const logs = [out({ setting: "outdoor", grade: 4, wall: "overhang" }), out({ setting: "gym", grade: 4, wall: "slab" }), out({ result: "attempt" }), out({ grade: null })];
    expect(angleSamples([], logs, () => 0).map((x) => x.grade)).toEqual([5, 3.5]);
    expect(outsideEvidence(logs).map((x) => x.grade)).toEqual([5, 3.5]);
  });
});

describe("style profile", () => {
  const at = (angle: number, n: number, grade = 4) => Array.from({ length: n }, () => ({ angle, grade, climbedAt: "2026-11-01 10:00:00" }));
  it("takes the angle you send most as your style and the far end as its opposite", () => {
    const p = styleProfile([...at(-5, 5), ...at(30, 2), ...at(0, 1)], NOW)!;
    expect(p.main).toBe("slab");
    expect(p.anti).toBe("steep");
    expect(p.counts).toMatchObject({ slab: 5, overhang: 2, vertical: 1 });
    expect(styleProfile([...at(45, 4), ...at(0, 2)], NOW)!.anti).toBe("slab");
  });
  it("pairs vertical with overhang, and for the middle style picks the end you climb less", () => {
    expect(oppositeStyle("vertical", { slab: 0, vertical: 5, slight: 0, overhang: 0, steep: 0 })).toBe("overhang");
    expect(oppositeStyle("slight", { slab: 0, vertical: 0, slight: 5, overhang: 0, steep: 3 })).toBe("slab");
    expect(oppositeStyle("slight", { slab: 4, vertical: 0, slight: 5, overhang: 0, steep: 1 })).toBe("steep");
  });
  it("breaks a tie toward the style you are stronger at, and needs enough sends", () => {
    const p = styleProfile([...at(0, 3, 3), ...at(30, 3, 5)], NOW)!;
    expect(p.main).toBe("overhang");
    expect(styleProfile(at(0, 4), NOW)).toBeNull();
    expect(styleProfile([...at(0, 2), ...at(30, 2), ...at(45, 2)], NOW)).toBeNull();
  });
});

describe("angle for a style on a board", () => {
  it("gives the nearest angle an adjustable board offers, and for a fixed board only an angle in the category", () => {
    expect(angleForStyle("overhang", [0, 10, 20, 30, 40, 50], 40)).toBe(30);
    expect(angleForStyle("slab", [0, 10, 20], 40)).toBe(0);
    expect(angleForStyle("steep", [40], 40)).toBe(40);
    expect(angleForStyle("slab", [40], 40)).toBeNull();
  });
});

describe("gym target", () => {
  const gym = (over: Partial<OutsideLog>) => out({ setting: "gym", wall: "overhang", tags: ["Crimpy"], grade: 4, gradeLabel: "V4", ...over });
  const NOW2 = new Date(2026, 10, 10);
  it("needs to know your level", () => {
    expect(gymTarget({ logs: [], working: null, now: NOW2, seed: 0 })).toBeNull();
  });
  it("aims at your level shown as a gym grade (the shared level less the gym offset), or one above it", () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = gymTarget({ logs: [], working: 3.5, now: NOW2, seed })!;
      expect(["V4", "V5"]).toContain(t.gradeLabel); // 3.5 + 0.5 = V4
      expect(t.push).toBe(t.gradeLabel === "V5");
    }
  });
  it("steers away from what you have already done and ignores outdoor logs", () => {
    const logs = [
      ...Array.from({ length: 6 }, (_, i) => gym({ id: `g${i}`, climbedAt: "2026-11-02 10:00:00" })),
      ...Array.from({ length: 6 }, (_, i) => out({ id: `o${i}`, setting: "outdoor", wall: "slab", tags: ["Slopey"], grade: 4, climbedAt: "2026-11-02 10:00:00" })),
    ];
    const picks = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const t = gymTarget({ logs, working: 3.5, now: NOW2, seed })!;
      picks.add(`${t.wall}|${t.tag}|${t.gradeLabel}`);
    }
    expect(picks.has("overhang|Crimpy|V4")).toBe(false);
    // Outdoor slopey slab counts for nothing here, so it is as likely as anything else; the point is it doesn't push slab away.
    expect([...picks].some((p) => p.startsWith("slab"))).toBe(true);
  });
  it("favours the angles it is told to, and counts attempts as half", () => {
    const t = gymTarget({ logs: [], working: 3.5, favoured: ["steep"], now: NOW2, seed: 1 })!;
    expect(t.wall).toBe("steep");
    const tried = [gym({ result: "attempt", grade: 4, gradeLabel: "V4" }), gym({ id: "b", result: "attempt", grade: 4, gradeLabel: "V4" })];
    const t2 = gymTarget({ logs: tried, working: 3.5, now: NOW2, seed: 0 })!;
    expect(t2.done).toBeLessThanOrEqual(1);
  });
  it("changes with the seed so a new suggestion can be asked for", () => {
    const set = new Set(Array.from({ length: 10 }, (_, seed) => { const t = gymTarget({ logs: [], working: 3.5, now: NOW2, seed })!; return `${t.wall}${t.tag}${t.gradeLabel}`; }));
    expect(set.size).toBeGreaterThan(1);
  });
  it("words it as a nudge", () => {
    expect(gymTargetText({ wall: "overhang", tag: "Crimpy", gradeLabel: "V3", push: false, done: 0 })).toBe("You haven't done much crimpy V3 overhang. Try that today!");
    expect(gymTargetText({ wall: "slab", tag: "Slopey", gradeLabel: "V4", push: true, done: 2 })).toBe("You've only done 2 slopey V4 slab. Try one today!");
  });
});

describe("off-board logs in the stats", () => {
  const NOW3 = new Date(2026, 10, 10);
  it("become logbook entries with the offset grade, and attempts-only ones stay ungraded non-sends", () => {
    const [flash, tries, v0] = outsideAsEntries([
      out({ id: "1", setting: "outdoor", name: "The Mandala", grade: 4, result: "flash", attempts: 1, wall: "overhang" }),
      out({ id: "2", result: "attempt", grade: null, gradeLabel: null, attempts: 5 }),
      out({ id: "3", setting: "gym", grade: 0, wall: "slab" }),
    ]);
    expect(flash).toMatchObject({ provider: "outside", isSend: true, bidCount: 1, climbName: "The Mandala", difficulty: 5, angle: 30 });
    expect(tries).toMatchObject({ isSend: false, bidCount: 5, difficulty: 0 });
    expect(v0.difficulty).toBeGreaterThan(0); // a gym V0 (-0.5 after the offset) still counts as graded
    expect(v0.climbName).toBe("Gym slab");
  });
  it("count in the overview next to board sends: sends, attempts, hardest, grade pyramid", () => {
    const mixed = [log({ difficulty: 20, climbedAt: "2026-11-02 10:00:00" }), ...outsideAsEntries([out({ id: "x", setting: "outdoor", grade: 6, climbedAt: "2026-11-03 10:00:00", attempts: 3 }), out({ id: "y", result: "attempt", grade: null, attempts: 4, climbedAt: "2026-11-03 11:00:00" })])];
    const o = overview(mixed, NOW3, (e) => (e.provider === "outside" ? e.difficulty : 4));
    expect(o.sends).toBe(2);
    expect(o.attempts).toBe(1 + 3 + 4);
    expect(o.hardest?.grade).toBe(7); // outdoor V6 counts as V7
    expect(o.byGrade.map((g) => g.v)).toEqual([4, 7]);
    expect(o.sessions).toBe(2);
  });
});

describe("quick gym logging", () => {
  const g = (over: Partial<OutsideLog>) => out({ setting: "gym", ...over });
  it("offers the last different gym climbs once each, newest first, and ignores outdoor ones", () => {
    const logs = [
      g({ id: "1", wall: "overhang", gradeLabel: "V3", result: "send", climbedAt: "2026-11-01 10:00:00" }),
      g({ id: "2", wall: "overhang", gradeLabel: "V3", result: "send", climbedAt: "2026-11-02 10:00:00" }),
      g({ id: "3", wall: "slab", gradeLabel: "V2", result: "flash", attempts: 1, climbedAt: "2026-11-03 10:00:00" }),
      out({ id: "4", setting: "outdoor", wall: "steep", gradeLabel: "V6", climbedAt: "2026-11-04 10:00:00" }),
      g({ id: "5", wall: "vertical", gradeLabel: null, gradeSystem: null, grade: null, result: "attempt", attempts: 4, climbedAt: "2026-11-02 12:00:00" }),
    ];
    const combos = recentGymCombos(logs, 3);
    expect(combos.map(quickLabel)).toEqual(["Flash V2 \u00B7 Slab", "Tried \u00B7 Vertical", "Sent V3 \u00B7 Overhang"]);
    expect(recentGymCombos(logs, 2)).toHaveLength(2);
    expect(recentGymCombos([], 3)).toEqual([]);
  });
  it("turns a combination back into a draft that can be saved as it was", () => {
    const [c] = recentGymCombos([g({ wall: "overhang", gradeLabel: "V3", result: "send", attempts: 3 })]);
    const d = draftFromCombo(c, "The Gym");
    expect(d).toMatchObject({ setting: "gym", wall: "overhang", gradeLabel: "V3", result: "send", attempts: 3, venue: "The Gym" });
    expect(draftProblem(d)).toBeNull();
  });
});
