import { describe, expect, it } from "vitest";
import type { Activity, ActivityFacts } from "./activity";
import { addDays } from "./days";
import { baselineLoad, dayLoad, effortMultiplier, isHardDay, isSpike, loadByDay, LOAD, typicalDayEntries, weekLoad } from "./load";

const facts = (over: Partial<ActivityFacts> = {}): ActivityFacts => ({ discipline: "boulder", send: true, tries: 1, grade: 20, effort: null, fingerIntense: false, ...over });
let n = 0;
const act = (day: string, over: Partial<ActivityFacts> = {}): Activity => ({ id: `a${n++}`, kind: "board", at: `${day} 18:00:00`, day, title: "x", ref: null, facts: facts(over) });
const hangs = (day: string, sets = 3): Activity => ({ ...act(day, { discipline: "training", send: false, tries: sets, grade: null, fingerIntense: true }), kind: "training" });

describe("a day's load", () => {
  it("counts sends fully and attempts-only entries by half", () => {
    expect(dayLoad([act("2026-11-02")])).toBe(LOAD.sendPoints);
    expect(dayLoad([act("2026-11-02", { send: false, grade: null })])).toBe(LOAD.attemptPoints);
  });
  it("adds a share for each extra try, up to a cap", () => {
    expect(dayLoad([act("2026-11-02", { tries: 3 })])).toBeCloseTo(1 + 2 * LOAD.extraTryShare);
    expect(dayLoad([act("2026-11-02", { tries: 50 })])).toBeCloseTo(1 + (LOAD.maxTries - 1) * LOAD.extraTryShare);
  });
  it("adds a bonus for a send at or above the working grade in that discipline only", () => {
    const working = { boulder: 20, roped: 100 };
    expect(dayLoad([act("2026-11-02", { grade: 20 })], working)).toBe(LOAD.sendPoints + LOAD.hardSendBonus);
    expect(dayLoad([act("2026-11-02", { grade: 19 })], working)).toBe(LOAD.sendPoints);
    expect(dayLoad([act("2026-11-02", { grade: 20 })], {})).toBe(LOAD.sendPoints);
    expect(dayLoad([act("2026-11-02", { discipline: "roped", grade: 20 })], working)).toBe(LOAD.sendPoints);
  });
  it("counts training by sets, and finger-intense training double", () => {
    expect(dayLoad([hangs("2026-11-02", 3)])).toBe(3 * LOAD.trainingSetPoints * LOAD.fingerMultiplier);
    const pulls: Activity = { ...act("2026-11-02", { discipline: "training", send: false, tries: 4, grade: null }), kind: "training" };
    expect(dayLoad([pulls])).toBe(4 * LOAD.trainingSetPoints);
  });
  it("scales the day by its highest effort rating and leaves an unrated day alone", () => {
    expect(effortMultiplier(null)).toBe(1);
    expect(effortMultiplier(5)).toBeCloseTo(1);
    expect(dayLoad([act("2026-11-02", { effort: 9 }), act("2026-11-02", { effort: 3 })])).toBeCloseTo(2 * effortMultiplier(9));
  });
  it("is nothing for a day with no entries", () => {
    expect(dayLoad([])).toBe(0);
  });
});

describe("weeks", () => {
  const monday = "2026-11-02";
  it("sums the seven days from a Monday and no others", () => {
    const by = loadByDay([act("2026-11-01"), act("2026-11-02"), act("2026-11-08"), act("2026-11-09")]);
    expect(weekLoad(by, monday)).toBe(2);
  });
  it("never lets a quiet month make a normal week look huge", () => {
    const by = loadByDay([act(monday), act(addDays(monday, 2)), act(addDays(monday, 4))]);
    expect(baselineLoad(by, monday)).toBe(LOAD.baselineFloor);
    expect(isSpike(by, monday)).toBe(false);
  });
  it("calls a week a spike when it is well over the usual", () => {
    const usual = (week: number) => Array.from({ length: 4 }, (_, i) => act(addDays(monday, -7 * week + i), { tries: 1 }));
    const heavy = Array.from({ length: 12 }, (_, i) => act(addDays(monday, i % 7), { tries: 2 }));
    const by = loadByDay([...usual(1), ...usual(2), ...usual(3), ...usual(4), ...heavy]);
    expect(baselineLoad(by, monday)).toBeCloseTo(LOAD.baselineFloor);
    expect(isSpike(by, monday)).toBe(true);
    expect(isSpike(loadByDay([...usual(1), ...usual(2), ...usual(3), ...usual(4), ...usual(0)]), monday)).toBe(false);
  });
});

describe("hard days", () => {
  const working = { boulder: 20 };
  it("is hard for a send at or above the working grade, not below it", () => {
    expect(isHardDay([act("2026-11-02", { grade: 20 })], working)).toBe(true);
    expect(isHardDay([act("2026-11-02", { grade: 15 })], working)).toBe(false);
  });
  it("is hard for finger-intense training or a high effort rating", () => {
    expect(isHardDay([hangs("2026-11-02")])).toBe(true);
    expect(isHardDay([act("2026-11-02", { grade: 5, effort: LOAD.hardEffort })])).toBe(true);
    expect(isHardDay([act("2026-11-02", { grade: 5, effort: LOAD.hardEffort - 1 })])).toBe(false);
  });
  it("does not call attempts alone hard, since there is no grade to compare", () => {
    expect(isHardDay([act("2026-11-02", { send: false, grade: null, tries: 6 })], working)).toBe(false);
  });
  it("is hard when a day is far longer than the user's usual", () => {
    const long = Array.from({ length: 10 }, () => act("2026-11-02", { grade: 5 }));
    expect(isHardDay(long, working, 3)).toBe(true);
    expect(isHardDay(long, working, 8)).toBe(false);
    expect(isHardDay(long.slice(0, 5), working, 1)).toBe(false);
  });
  it("is not hard when nothing was logged", () => {
    expect(isHardDay([])).toBe(false);
  });
  it("finds the usual number of entries as a median over climbing days", () => {
    const list = [act("2026-11-01"), act("2026-11-02"), act("2026-11-02"), act("2026-11-02"), act("2026-11-03"), act("2026-11-03")];
    expect(typicalDayEntries(list)).toBe(2);
    expect(typicalDayEntries([])).toBe(0);
  });
});
