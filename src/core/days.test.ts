import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays, dayOf, dayStart, daysBetween, eachDay, isDay, monthStartDay, parseStamp, stampOf, uniqueDays, weekDays, weekStart, weekStartDay, weekdayOf,
} from "./days";

describe("reading days from stamps", () => {
  it("takes the day straight from the stamp, with or without microseconds or a T", () => {
    expect(dayOf("2026-11-03 18:30:00")).toBe("2026-11-03");
    expect(dayOf("2026-11-03 18:30:00.123456")).toBe("2026-11-03");
    expect(dayOf("2026-11-03T23:59:59")).toBe("2026-11-03");
  });
  it("gives the local day of a Date, and round trips through a stamp", () => {
    const d = new Date(2026, 10, 3, 23, 59, 59);
    expect(dayOf(d)).toBe("2026-11-03");
    expect(stampOf(d)).toBe("2026-11-03 23:59:59");
    expect(parseStamp(stampOf(d)).getTime()).toBe(d.getTime());
  });
  it("recognises real dates only", () => {
    expect(isDay("2026-02-28")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-2-3")).toBe(false);
    expect(isDay("yesterday")).toBe(false);
  });
});

describe("calendar arithmetic", () => {
  it("steps across month, year and leap-year boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("counts whole days between two days in either direction", () => {
    expect(daysBetween("2026-11-01", "2026-11-03")).toBe(2);
    expect(daysBetween("2026-11-03", "2026-11-01")).toBe(-2);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2027-01-01")).toBe(365);
  });
  it("starts weeks on Monday", () => {
    expect(weekdayOf("2026-11-02")).toBe(0);   // a Monday
    expect(weekdayOf("2026-11-08")).toBe(6);   // the Sunday
    expect(weekStartDay("2026-11-08")).toBe("2026-11-02");
    expect(weekStartDay("2026-11-02")).toBe("2026-11-02");
    expect(weekStartDay("2026-11-01")).toBe("2026-10-26");   // a Sunday belongs to the week before
    expect(weekDays("2026-11-02")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("finds month starts, ranges and distinct days", () => {
    expect(monthStartDay("2026-11-17")).toBe("2026-11-01");
    expect(eachDay("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(eachDay("2026-11-03", "2026-11-01")).toEqual([]);
    expect(uniqueDays(["2026-11-03", "2026-11-01", "2026-11-03"])).toEqual(["2026-11-01", "2026-11-03"]);
  });
  it("rejects something that is not a day", () => {
    expect(() => addDays("tomorrow", 1)).toThrow();
  });
});

describe("daylight saving changes", () => {
  const original = process.env.TZ;
  beforeAll(() => { process.env.TZ = "America/Chicago"; });
  afterAll(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; });

  it("never loses or repeats a day when the clocks change", () => {
    // Chicago: clocks went forward on 2026-03-08 (a 23-hour day) and back on 2026-11-01 (a 25-hour day).
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(eachDay("2026-10-30", "2026-11-03")).toHaveLength(5);
  });

  it("keeps late-evening and early-morning entries on their own day on a 25-hour day", () => {
    expect(dayOf("2026-11-01 00:30:00")).toBe("2026-11-01");
    expect(dayOf("2026-11-01 23:30:00")).toBe("2026-11-01");
    expect(dayOf(new Date(2026, 10, 1, 23, 30))).toBe("2026-11-01");
  });

  it("starts the local week at midnight even when a change falls inside it", () => {
    const start = weekStart(new Date(2026, 10, 3, 12, 0));   // Tuesday after the change
    expect(stampOf(start)).toBe("2026-11-02 00:00:00");
    expect(stampOf(dayStart("2026-03-08"))).toBe("2026-03-08 00:00:00");
  });
});
