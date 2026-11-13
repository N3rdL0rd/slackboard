import { describe, expect, it } from "vitest";
import { DEFAULT_EQUIVALENCE, parseEquivalence, ropedAsEntries, ropedAsV, ropedEvidence, V_PER_ROPED_STEP } from "./ropedEquivalence";
import type { RopedLog } from "./roped";
import { DEFAULT_SETTINGS, parseSettings, withDefaults } from "./settings";
import { overview } from "./stats";
import { OUTSIDE_PROVIDER } from "./outside";
import { ropedLabel } from "../data/ropedGrades";

const rope = (grade: number, over: Partial<RopedLog> = {}): RopedLog => ({
  id: `r${grade}`, style: "sport", setting: "outdoor", name: "", venue: "", link: "", gradeSystem: "yds", gradeLabel: "x", grade, result: "redpoint", attempts: 3,
  lengthM: null, pitches: 1, note: "", climbedAt: "2026-11-10 10:00:00", ...over,
});
const eq = { ircra: 17, v: 4 };

describe("placing a roped grade on the boulder scale", () => {
  it("gives the user's own pair back exactly, and half a V per step either way", () => {
    expect(ropedAsV(17, eq)).toBe(4);
    expect(ropedAsV(19, eq)).toBe(4 + 2 * V_PER_ROPED_STEP);
    expect(ropedAsV(13, eq)).toBe(2);
  });

  it("never goes below the bottom of the scale", () => {
    expect(ropedAsV(1, eq)).toBe(0.01);
  });

  it("starts from 5.11c is about V4", () => {
    expect(ropedLabel(DEFAULT_EQUIVALENCE.ircra, "yds")).toBe("5.11c");
    expect(DEFAULT_EQUIVALENCE.v).toBe(4);
  });
});

describe("roped sends as stats entries and as evidence", () => {
  const logs = [rope(17), rope(15, { result: "fell", id: "fell" }), rope(19, { result: "onsight", id: "on", climbedAt: "2026-11-11 10:00:00" })];

  it("includes sends only, with the converted grade, on the entry that holds shared-scale grades directly", () => {
    const e = ropedAsEntries(logs, eq);
    expect(e.map((x) => x.difficulty)).toEqual([4, 5]);
    expect(e.every((x) => x.provider === OUTSIDE_PROVIDER && x.isSend)).toBe(true);
    expect(ropedEvidence(logs, eq)).toEqual([{ grade: 4, climbedAt: "2026-11-10 10:00:00" }, { grade: 5, climbedAt: "2026-11-11 10:00:00" }]);
  });

  it("moves the working grade only when they are added", () => {
    const now = new Date(2026, 10, 12);
    const gradeOf = (e: { difficulty: number }) => e.difficulty;
    const board = [1, 2, 3].map((n) => ({ id: `b${n}`, provider: OUTSIDE_PROVIDER, climbUuid: `b${n}`, climbName: "b", angle: 40, isMirror: false, bidCount: 1, quality: 0, difficulty: 2, comment: "", climbedAt: `2026-11-0${n} 10:00:00`, isSend: true }));
    const without = overview(board, now, gradeOf, 8).working;
    const withRoped = overview([...board, ...ropedAsEntries(logs, eq)], now, gradeOf, 8).working;
    expect(without).toBe(2);
    expect(withRoped).toBeGreaterThan(without!);
  });
});

describe("the setting", () => {
  it("is off by default, with a default pair", () => {
    expect(DEFAULT_SETTINGS.ropedWorking).toBe(false);
    expect(DEFAULT_SETTINGS.ropedEquivalence).toEqual(DEFAULT_EQUIVALENCE);
  });

  it("is read from stored settings, and an older copy without it gets the defaults", () => {
    expect(parseSettings({ ropedWorking: true, ropedEquivalence: { ircra: 15, v: 3 } })).toMatchObject({ ropedWorking: true, ropedEquivalence: { ircra: 15, v: 3 } });
    const old = withDefaults({ gradeDisplay: "v" });
    expect(old.ropedWorking).toBe(false);
    expect(old.ropedEquivalence).toEqual(DEFAULT_EQUIVALENCE);
  });

  it("drops a pair that is damaged instead of half-reading it", () => {
    for (const bad of [{ ircra: 15 }, { ircra: 15.5, v: 3 }, { ircra: 0, v: 3 }, { ircra: 15, v: 30 }, { ircra: "15", v: 3 }, null, 5]) {
      expect(parseSettings({ ropedEquivalence: bad }).ropedEquivalence, JSON.stringify(bad)).toBeUndefined();
      expect(parseEquivalence(bad)).toBeNull();
    }
  });
});
