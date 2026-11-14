import { describe, expect, it } from "vitest";
import type { Activity, ActivityKind } from "./activity";
import { weeklyReview, yearlyReview, type ReviewLabels } from "./review";
import { cardFileName } from "./shareCard";
import { dayMarks } from "./streak";
import { weekCardFacts, yearCardFacts } from "./reviewShare";

const labels: ReviewLabels = { boulder: (v) => `V${v}`, roped: (n) => `R${n}` };
let n = 0;
const act = (kind: ActivityKind, day: string, over: Partial<Activity["facts"]> = {}): Activity => ({
  id: `${kind}${n++}`, kind, at: `${day} 10:00:00`, day, title: `t${n}`, ref: null,
  facts: { discipline: kind === "roped" ? "roped" : "boulder", send: true, tries: 1, grade: null, effort: null, fingerIntense: false, ...over },
});
const board = (day: string, v: number) => act("board", day, { grade: v + 0.5 });
const TODAY = "2026-11-12";

describe("the weekly image", () => {
  const list = [board("2026-11-09", 3), board("2026-11-10", 4), board("2026-11-10", 2), act("roped", "2026-11-12", { grade: 13 })];
  const r = weeklyReview({ activities: list, notes: [], goals: [], today: TODAY, day: TODAY, labels });
  const marks = [...dayMarks(list.map((a) => a.day), TODAY, r.weekStart, r.weekEnd).values()];
  const f = weekCardFacts(r, marks, labels)!;

  it("carries the same numbers as the review, with correct plurals", () => {
    expect(f.title).toBe("Week of 9 Nov");
    expect(f.figures.map((x) => x.value)).toEqual([r.days, r.sends, r.attempts]);
    expect(f.figures.map((x) => x.label)).toEqual(["days", "sends", "tries"]);
    expect(f.hardest).toEqual([{ scale: "boulder", grade: 4, label: "V4" }, { scale: "roped", grade: 13, label: "R13" }]);
  });
  it("marks all seven days, Monday first", () => {
    expect(f.dots.map((d) => d.letter).join("")).toBe("MTWTFSS");
    expect(f.dots.map((d) => d.mark)).toEqual(["climbed", "climbed", "rest", "climbed", "future", "future", "future"]);
  });
  it("says 1 day, 1 send, 1 try in the singular", () => {
    const one = weeklyReview({ activities: [board("2026-11-09", 1)], notes: [], goals: [], today: TODAY, day: TODAY, labels });
    expect(weekCardFacts(one, [], labels)!.figures.map((x) => x.label)).toEqual(["day", "send", "try"]);
  });
  it("has no image for an empty week", () => {
    const empty = weeklyReview({ activities: [], notes: [], goals: [], today: TODAY, day: TODAY, labels });
    expect(weekCardFacts(empty, [], labels)).toBeNull();
  });
  it("names its file after the week", () => {
    expect(cardFileName("week", f.fileKey)).toBe("slackboard-week-2026-11-09");
  });
});

describe("the yearly image", () => {
  const list = [board("2026-01-05", 1), board("2026-01-06", 2), board("2026-03-01", 4), act("roped", "2026-06-01", { grade: 12 })];
  const y = yearlyReview({ activities: list, goals: [], year: 2026, labels });
  const f = yearCardFacts(y, labels)!;

  it("carries the review's totals and hardest sends", () => {
    expect(f.title).toBe("2026 in review");
    expect(f.figures.map((x) => x.value)).toEqual([y.days, y.sends, y.attempts]);
    expect(f.hardest.map((x) => x.label)).toEqual(["V4", "R12"]);
  });
  it("lists the pyramid hardest first, boulder then roped, capped", () => {
    expect(f.pyramid.map((p) => `${p.label}:${p.count}`)).toEqual(["V4:1", "V2:1", "V1:1", "R12:1"]);
    const many = Array.from({ length: 10 }, (_, i) => board(`2026-02-${String(i + 1).padStart(2, "0")}`, i));
    expect(yearCardFacts(yearlyReview({ activities: many, goals: [], year: 2026, labels }), labels)!.pyramid.filter((p) => p.scale === "boulder")).toHaveLength(6);
  });
  it("gives each month its climbing days and length", () => {
    expect(f.months).toHaveLength(12);
    expect(f.months[0]).toMatchObject({ label: "Jan", days: [5, 6], length: 31 });
    expect(f.months[1]).toMatchObject({ label: "Feb", days: [], length: 28 });
  });
  it("has no image for an empty year", () => {
    expect(yearCardFacts(yearlyReview({ activities: [], goals: [], year: 2026, labels }), labels)).toBeNull();
  });
});
