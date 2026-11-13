import { describe, expect, it } from "vitest";
import { calendarWeeks, dayMarks, streakInfo, streakLabel, streakStateText, weekDots } from "./streak";

// 2026-11-02 is a Monday.
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;

describe("streakInfo", () => {
  it("counts a chain whose gaps are at most one rest day, with its span", () => {
    // Mon, Wed, Thu, Sat, Mon: every gap is 2 or less.
    const s = streakInfo([d(2), d(4), d(5), d(7), d(9)], d(9));
    expect(s).toMatchObject({ current: 5, span: 8, longest: 5, state: "today", lastDay: d(9) });
  });

  it("breaks when two rest days in a row pass", () => {
    const s = streakInfo([d(2), d(5)], d(5));
    expect(s.current).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.span).toBe(1);
  });

  it("is alive on the day after and two days after the last climb, and broken on the third", () => {
    const days = [d(2), d(3)];
    expect(streakInfo(days, d(3)).state).toBe("today");
    expect(streakInfo(days, d(4))).toMatchObject({ state: "rest", current: 2 });
    expect(streakInfo(days, d(5))).toMatchObject({ state: "last", current: 2 });
    expect(streakInfo(days, d(6))).toMatchObject({ state: "broken", current: 0, span: 0, longest: 2 });
  });

  it("keeps the longest streak after a break, and prefers the more recent of equal chains", () => {
    const s = streakInfo([d(1), d(2), d(3), d(10), d(11), d(12), d(13)], d(14));
    expect(s).toMatchObject({ longest: 4, current: 4, state: "rest" });
    const old = streakInfo([d(1), d(2), d(3), d(4), d(5), d(20)], d(30));
    expect(old).toMatchObject({ longest: 5, current: 0, state: "broken", longestSpan: 5 });
  });

  it("is the same whatever order the days arrive in, and ignores duplicates", () => {
    expect(streakInfo([d(5), d(2), d(4), d(2), d(4)], d(5))).toEqual(streakInfo([d(2), d(4), d(5)], d(5)));
  });

  it("is empty with no days, and ignores days after today", () => {
    expect(streakInfo([], d(5))).toMatchObject({ current: 0, longest: 0, state: "none", lastDay: null });
    expect(streakInfo([d(9)], d(5))).toMatchObject({ state: "none" });
    expect(streakInfo([d(4), d(9)], d(5))).toMatchObject({ current: 1, lastDay: d(4) });
  });

  it("is repaired by an old entry added later and broken by deleting one", () => {
    const without = streakInfo([d(2), d(5), d(6)], d(6));
    expect(without.current).toBe(2);
    expect(streakInfo([d(2), d(4), d(5), d(6)], d(6)).current).toBe(4);
    expect(streakInfo([d(2), d(4), d(6)], d(6)).current).toBe(3);
    expect(streakInfo([d(2), d(6)], d(6)).current).toBe(1);
  });

  it("holds across a month and a year boundary", () => {
    expect(streakInfo(["2026-12-31", "2027-01-02", "2027-01-03"], "2027-01-03").current).toBe(3);
    expect(streakInfo(["2026-02-28", "2026-03-02"], "2026-03-02").current).toBe(2);
  });
});

describe("dayMarks and week dots", () => {
  it("marks climbed days, the rest days that keep the chain, and empty days", () => {
    const m = dayMarks([d(2), d(4)], d(5), d(1), d(7));
    expect([...m.values()]).toEqual(["empty", "climbed", "rest", "climbed", "rest", "future", "future"]);
  });

  it("marks the days after the latest climb as rest only while the streak is alive", () => {
    const alive = dayMarks([d(2)], d(4), d(2), d(5));
    expect([...alive.values()]).toEqual(["climbed", "rest", "rest", "future"]);
    const broken = dayMarks([d(2)], d(5), d(2), d(5));
    // Once it has broken, the days after the last climb are simply empty: they never sat inside a chain.
    expect([...broken.values()]).toEqual(["climbed", "empty", "empty", "empty"]);
  });

  it("gives the Monday-first week that holds today", () => {
    const w = weekDots([d(2), d(4)], d(5));
    expect(w).toHaveLength(7);
    expect(w[0]).toEqual({ day: d(2), mark: "climbed" });
    expect(w[6]).toEqual({ day: d(8), mark: "future" });
  });

  it("gives eight weeks of seven days ending with this week", () => {
    const cal = calendarWeeks([d(2)], d(5));
    expect(cal).toHaveLength(8);
    expect(cal.every((row) => row.length === 7)).toBe(true);
    expect(cal[7][0].day).toBe(d(2));
    expect(cal[0][0].day).toBe("2026-09-14");
  });
});

describe("words", () => {
  it("states each situation without a negative message", () => {
    expect(streakStateText(streakInfo([d(5)], d(5)))).toBe("Climbed today");
    expect(streakStateText(streakInfo([d(5)], d(6)))).toBe("A rest day is fine today");
    expect(streakStateText(streakInfo([d(5)], d(7)))).toBe("Today keeps your streak going");
    expect(streakStateText(streakInfo([d(1), d(2)], d(9)))).toBe("Longest: 2 days");
    expect(streakStateText(streakInfo([], d(9)))).toBe("Log a climb to start a streak");
  });

  it("says the span when rest days are inside the count", () => {
    expect(streakLabel(streakInfo([d(2), d(4), d(5)], d(5)))).toBe("3 days over 4");
    expect(streakLabel(streakInfo([d(4), d(5)], d(5)))).toBe("2 days");
    expect(streakLabel(streakInfo([d(5)], d(5)))).toBe("1 day");
    expect(streakLabel(streakInfo([], d(5)))).toBe("");
  });
});
