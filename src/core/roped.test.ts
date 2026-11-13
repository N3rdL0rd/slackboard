import { describe, expect, it } from "vitest";
import { ropedActivity } from "./activity";
import {
  afterSave, describeRoped, draftOf, draftProblem, fromMetres, gradeText, makeRopedLog, newDraft, normaliseTries, parseLength, recentCombos, repeatDraft, ropedStats, ropedTitle, ropedWorking, toMetres,
  type RopedLog,
} from "./roped";

const log = (over: Partial<RopedLog> = {}): RopedLog => ({
  id: "r1", style: "sport", setting: "indoor", name: "", venue: "Adventure Rock", link: "", gradeSystem: "yds", gradeLabel: "5.10c", grade: 13, result: "redpoint", attempts: 1,
  lengthM: null, pitches: 1, note: "", climbedAt: "2026-11-04 18:00:00", ...over,
});

describe("results and tries", () => {
  it("makes an onsight or flash one try, and keeps a redpoint's tries", () => {
    expect(normaliseTries("sport", "onsight", 5)).toEqual({ result: "onsight", attempts: 1 });
    expect(normaliseTries("trad", "flash", 3)).toEqual({ result: "flash", attempts: 1 });
    expect(normaliseTries("sport", "redpoint", 4)).toEqual({ result: "redpoint", attempts: 4 });
    expect(normaliseTries("sport", "fell", 0)).toEqual({ result: "fell", attempts: 1 });
    expect(normaliseTries("sport", "project", 500)).toEqual({ result: "project", attempts: 99 });
    expect(normaliseTries("sport", "hung", Number.NaN)).toEqual({ result: "hung", attempts: 1 });
  });

  it("stores autobelay as laps, every lap a send", () => {
    expect(normaliseTries("autobelay", "fell", 6)).toEqual({ result: "redpoint", attempts: 6 });
  });
});

describe("lengths", () => {
  it("reads metres and feet, and refuses nonsense", () => {
    expect(parseLength("", "m")).toBeNull();
    expect(parseLength("  ", "ft")).toBeNull();
    expect(parseLength("25", "m")).toBe(25);
    expect(parseLength("82", "ft")).toBe(25);
    expect(parseLength("12,5", "m")).toBe(12.5);
    expect(parseLength("abc", "m")).toBeUndefined();
    expect(parseLength("-3", "m")).toBeUndefined();
    expect(parseLength("0", "m")).toBeUndefined();
    expect(parseLength("99999", "m")).toBeUndefined();
  });

  it("converts back to the unit shown", () => {
    expect(fromMetres(25, "m")).toBe(25);
    expect(fromMetres(toMetres(82, "ft"), "ft")).toBe(82);
  });
});

describe("the log form", () => {
  const ok = newDraft({ gradeLabel: "5.10c", venue: " Adventure Rock ", name: "  Slab Happy " });

  it("needs a grade, a usable link and a usable length", () => {
    expect(draftProblem(newDraft(), "m")).toBe("Pick the grade.");
    expect(draftProblem(newDraft({ gradeLabel: "5.10e" }), "m")).toBe("Pick the grade.");
    expect(draftProblem({ ...ok, gradeSystem: "french" }, "m")).toBe("Pick the grade.");
    expect(draftProblem({ ...ok, link: "not a link" }, "m")).toBe("That link doesn't look like a web address.");
    expect(draftProblem({ ...ok, length: "tall" }, "m")).toBe("The length should be a number.");
    expect(draftProblem(ok, "m")).toBeNull();
  });

  it("builds a log with the grade on the roped scale, in either notation", () => {
    const l = makeRopedLog({ ...ok, length: "82", pitches: 2, link: "thecrag.com/route/1" }, "ft", "x", "2026-11-04 18:00:00");
    expect(l).toMatchObject({ id: "x", name: "Slab Happy", venue: "Adventure Rock", grade: 13, lengthM: 25, pitches: 2, link: "https://thecrag.com/route/1" });
    expect(makeRopedLog({ ...ok, gradeSystem: "french", gradeLabel: "6a+" }, "m", "y", "2026-11-04 18:00:00").grade).toBe(13);
    expect(() => makeRopedLog(newDraft(), "m", "z", "2026-11-04 18:00:00")).toThrow("Pick the grade.");
  });

  it("clamps pitches and applies the autobelay rule on save", () => {
    expect(makeRopedLog({ ...ok, pitches: 400 }, "m", "a", "2026-11-04 18:00:00").pitches).toBe(30);
    expect(makeRopedLog({ ...ok, pitches: 0 }, "m", "a", "2026-11-04 18:00:00").pitches).toBe(1);
    expect(makeRopedLog({ ...ok, style: "autobelay", result: "fell", attempts: 6 }, "m", "a", "2026-11-04 18:00:00")).toMatchObject({ result: "redpoint", attempts: 6 });
  });

  it("opens a stored log for editing, showing its length in the user's unit", () => {
    const l = log({ lengthM: 25, name: "Slab Happy", link: "https://thecrag.com/x" });
    expect(draftOf(l, "ft").length).toBe("82");
    expect(draftOf(l, "m").length).toBe("25");
    expect(draftOf(log(), "m").length).toBe("");
    expect(makeRopedLog(draftOf(l, "ft"), "ft", l.id, l.climbedAt).lengthM).toBe(25);
  });

  it("repeats the last route's style, place and grade, but not its name, link, note or result", () => {
    const d = repeatDraft(log({ name: "Slab Happy", link: "https://x.com/y", note: "fun", result: "onsight", style: "trad", setting: "outdoor", venue: "Index" }));
    expect(d).toMatchObject({ style: "trad", setting: "outdoor", venue: "Index", gradeLabel: "5.10c", gradeSystem: "yds", result: "redpoint", attempts: 1, name: "", link: "", note: "" });
  });

  it("keeps the form after Save and another, resetting only result, tries, name and note", () => {
    const d = afterSave(newDraft({ gradeLabel: "5.11a", venue: "Gym", result: "fell", attempts: 3, name: "Pump", note: "x", link: "https://a.com/b", length: "20" }));
    expect(d).toMatchObject({ gradeLabel: "5.11a", venue: "Gym", length: "20", result: "redpoint", attempts: 1, name: "", note: "" });
  });
});

describe("recent combinations", () => {
  it("lists each style, place and grade once, newest first, up to the limit", () => {
    const logs = [
      log({ id: "a", climbedAt: "2026-11-01 10:00:00" }),
      log({ id: "b", climbedAt: "2026-11-03 10:00:00", grade: 14, gradeLabel: "5.10d" }),
      log({ id: "c", climbedAt: "2026-11-02 10:00:00" }),
      log({ id: "d", climbedAt: "2026-11-04 10:00:00", style: "toprope" }),
    ];
    expect(recentCombos(logs).map((l) => l.id)).toEqual(["d", "b", "c"]);
    expect(recentCombos(logs, 2).map((l) => l.id)).toEqual(["d", "b"]);
    expect(recentCombos([])).toEqual([]);
  });
});

describe("text", () => {
  it("shows both notations with the chosen one first", () => {
    expect(gradeText(log())).toBe("5.10c, 6a+");
    expect(gradeText(log({ gradeSystem: "french" }))).toBe("6a+, 5.10c");
  });

  it("describes a log in a line and titles it", () => {
    expect(describeRoped(log())).toBe("Sport, indoor, redpoint");
    expect(describeRoped(log({ attempts: 3 }))).toBe("Sport, indoor, redpoint in 3");
    expect(describeRoped(log({ result: "fell", setting: "outdoor" }))).toBe("Sport, outdoor, fell");
    expect(describeRoped(log({ style: "autobelay", attempts: 6 }))).toBe("Autobelay, indoor, 6 laps");
    expect(describeRoped(log({ style: "autobelay", attempts: 1 }))).toBe("Autobelay, indoor, 1 lap");
    expect(ropedTitle(log())).toBe("5.10c sport");
    expect(ropedTitle(log({ name: "Slab Happy" }))).toBe("Slab Happy");
  });
});

describe("roped stats", () => {
  const now = new Date(2026, 10, 12, 12, 0, 0); // Thursday 12 Nov 2026
  const logs = [
    log({ id: "1", result: "onsight", grade: 12, gradeLabel: "5.10b", climbedAt: "2026-11-10 10:00:00", lengthM: 20, pitches: 1 }),
    log({ id: "2", result: "flash", grade: 13, climbedAt: "2026-11-09 10:00:00", lengthM: 20 }),
    log({ id: "3", result: "redpoint", grade: 14, gradeLabel: "5.10d", attempts: 4, climbedAt: "2026-11-02 10:00:00", lengthM: 30, pitches: 2 }),
    log({ id: "4", result: "fell", grade: 16, gradeLabel: "5.11b", climbedAt: "2026-11-02 11:00:00" }),
    log({ id: "5", style: "autobelay", attempts: 6, grade: 11, gradeLabel: "5.10a", climbedAt: "2026-10-20 10:00:00", lengthM: 12 }),
  ];
  const s = ropedStats(logs, now);

  it("counts sends, routes with autobelay laps, and tries that were not sends", () => {
    expect(s).toMatchObject({ sends: 4, routes: 9, tries: 1, onsights: 1, flashes: 1 });
  });

  it("totals pitches and metres over sends, counting each autobelay lap", () => {
    expect(s.pitches).toBe(1 + 1 + 2 + 6);
    expect(s.metres).toBe(20 + 20 + 30 + 72);
  });

  it("finds the hardest send, ignoring a fall on something harder", () => {
    expect(s.hardest).toEqual({ grade: 14, result: "redpoint" });
  });

  it("builds a pyramid by result, easiest first, from sends only", () => {
    expect(s.pyramid).toEqual([
      { grade: 11, onsight: 0, flash: 0, redpoint: 6 },
      { grade: 12, onsight: 1, flash: 0, redpoint: 0 },
      { grade: 13, onsight: 0, flash: 1, redpoint: 0 },
      { grade: 14, onsight: 0, flash: 0, redpoint: 1 },
    ]);
  });

  it("gives twelve weeks ending with this one, with routes and the hardest send in each", () => {
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks[11].start).toBe("2026-11-09");
    expect(s.weeks[11]).toMatchObject({ routes: 2, pitches: 2, metres: 40, hardest: 13 });
    expect(s.weeks[10]).toMatchObject({ start: "2026-11-02", routes: 1, pitches: 2, metres: 30, hardest: 14 });
    expect(s.weeks[8]).toMatchObject({ start: "2026-10-19", routes: 6, metres: 72, hardest: 11 });
    expect(s.weeks[9].routes).toBe(0);
    expect(s.weeks[9].hardest).toBeNull();
  });

  it("handles no logs and entries older than the window", () => {
    const empty = ropedStats([], now);
    expect(empty).toMatchObject({ sends: 0, routes: 0, hardest: null, pyramid: [] });
    expect(empty.weeks).toHaveLength(12);
    const old = ropedStats([log({ climbedAt: "2025-01-01 10:00:00" })], now);
    expect(old.sends).toBe(1);
    expect(old.weeks.every((w) => w.routes === 0)).toBe(true);
  });
});

describe("as an activity", () => {
  it("is on the roped scale, never the boulder scale, and counts laps as tries", () => {
    const a = ropedActivity(log({ style: "autobelay", attempts: 6 }));
    expect(a).toMatchObject({ id: "roped:r1", kind: "roped", day: "2026-11-04", title: "5.10c autobelay" });
    expect(a.facts).toMatchObject({ discipline: "roped", send: true, tries: 6, grade: 13, fingerIntense: false });
    expect(ropedActivity(log({ result: "fell" })).facts).toMatchObject({ send: false, grade: null });
  });
});

describe("roped working grade", () => {
  const now = new Date(2026, 10, 12, 12, 0, 0);
  const sent = (grade: number, climbedAt: string, over: Partial<RopedLog> = {}) => log({ id: `w${grade}${climbedAt}`, grade, climbedAt, ...over });

  it("averages the three hardest sends in the last 90 days", () => {
    const logs = [sent(12, "2026-11-01 10:00:00"), sent(14, "2026-10-20 10:00:00"), sent(13, "2026-09-20 10:00:00"), sent(11, "2026-11-02 10:00:00"), sent(20, "2026-06-01 10:00:00")];
    expect(ropedWorking(logs, now)).toBeCloseTo((14 + 13 + 12) / 3);
  });

  it("is null with fewer than three sends, ignoring falls and anything older", () => {
    expect(ropedWorking([], now)).toBeNull();
    expect(ropedWorking([sent(12, "2026-11-01 10:00:00"), sent(13, "2026-11-02 10:00:00"), sent(14, "2026-11-03 10:00:00", { result: "fell" })], now)).toBeNull();
    expect(ropedWorking([sent(12, "2026-11-01 10:00:00"), sent(13, "2026-11-02 10:00:00"), sent(14, "2026-06-03 10:00:00")], now)).toBeNull();
  });
});
