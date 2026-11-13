import { describe, expect, it } from "vitest";
import { activitiesOf } from "./activity";
import { dayCards, dayTitle, filterByKind, routesOf, sendsIn, timelineTotals, type CardLabels } from "./logTimeline";
import type { OutsideLog } from "./outside";
import type { RopedLog } from "./roped";
import type { LogEntry } from "./types";

let n = 0;
const board = (day: string, over: Partial<LogEntry> = {}): LogEntry => ({
  id: `b${++n}`, provider: "tension", climbUuid: `C${n}`, climbName: "Climb", angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty: 4.2, comment: "", climbedAt: `${day} 10:00:00`, isSend: true, ...over,
});
const gym = (day: string, over: Partial<OutsideLog> = {}): OutsideLog => ({
  id: `o${++n}`, setting: "gym", name: "", venue: "Adventure Rock", link: "", wall: "overhang", gradeSystem: "v", gradeLabel: "V3", grade: 3, result: "send", attempts: 1, tags: [], note: "",
  climbedAt: `${day} 11:00:00`, ...over,
});
const rope = (day: string, over: Partial<RopedLog> = {}): RopedLog => ({
  id: `r${++n}`, style: "sport", setting: "indoor", name: "", venue: "Adventure Rock", link: "", gradeSystem: "yds", gradeLabel: "5.10c", grade: 13, result: "redpoint", attempts: 1, lengthM: null, pitches: 1, note: "",
  climbedAt: `${day} 12:00:00`, ...over,
});
const labels: CardLabels = { boulder: (g) => `V${Math.floor(g)}`, roped: (g) => `R${g}` };
const all = (o: { board?: LogEntry[]; offBoard?: OutsideLog[]; roped?: RopedLog[] }) => activitiesOf({ ...o, gradeOf: (e) => e.difficulty });

describe("kind filters", () => {
  const list = all({ board: [board("2026-11-02")], offBoard: [gym("2026-11-02")], roped: [rope("2026-11-02")] });

  it("keeps the kinds each filter names, and everything for All", () => {
    expect(filterByKind(list, "all")).toHaveLength(3);
    expect(filterByKind(list, "board").map((a) => a.kind)).toEqual(["board"]);
    expect(filterByKind(list, "boulders").map((a) => a.kind)).toEqual(["offBoard"]);
    expect(filterByKind(list, "roped").map((a) => a.kind)).toEqual(["roped"]);
    expect(filterByKind(list, "training")).toEqual([]);
  });
});

describe("day cards", () => {
  const list = all({
    board: [board("2026-11-03"), board("2026-11-03", { difficulty: 6.4 }), board("2026-11-03", { isSend: false, difficulty: 0 }), board("2026-11-01", { isSend: false, difficulty: 0 })],
    offBoard: [gym("2026-11-03", { grade: 3.2 })],
    roped: [rope("2026-11-03"), rope("2026-11-03", { grade: 15, gradeLabel: "5.11a" }), rope("2026-11-03", { style: "autobelay", attempts: 6, grade: 11 }), rope("2026-11-02", { result: "fell", grade: 16 })],
  });
  // Both off-board kinds in these tests happened at the same gym.
  const cards = dayCards(list, labels, (a) => (a.kind === "board" ? "Home" : "Adventure Rock"));

  it("groups by day, newest first, with the entries newest first", () => {
    expect(cards.map((c) => c.day)).toEqual(["2026-11-03", "2026-11-02", "2026-11-01"]);
    expect(cards[0].entries).toHaveLength(7);
    expect(cards[0].entries[0].at >= cards[0].entries[6].at).toBe(true);
  });

  it("writes the one-line summary the spec describes, counting autobelay laps as routes", () => {
    expect(cards[0].summary).toBe("8 routes, hardest R15 \u00B7 2 board sends \u00B7 1 boulder send");
  });

  it("says attempts when a kind had no send, and roped tries when nothing was sent", () => {
    expect(cards[2].summary).toBe("1 board attempt");
    expect(cards[1].summary).toBe("1 roped try");
  });

  it("finds the hardest send of each discipline, ignoring attempts", () => {
    expect(cards[0].hardestBoulder).toBeCloseTo(6.4);
    expect(cards[0].hardestRoped).toBe(15);
    expect(cards[1].hardestRoped).toBeNull();
    expect(cards[2].hardestBoulder).toBeNull();
  });

  it("lists each place once, in order", () => {
    // Newest first: the roped climb (12:00) and the gym boulder (11:00) share a gym, and the board send (10:00) was at home.
    expect(cards[0].places).toEqual(["Adventure Rock", "Home"]);
  });

  it("is empty for an empty log", () => {
    expect(dayCards([], labels)).toEqual([]);
  });
});

describe("counting sends", () => {
  it("counts a roped entry as its routes and everything else as one if it was a send", () => {
    const [a, b, c, d] = all({ board: [board("2026-11-03"), board("2026-11-03", { isSend: false, difficulty: 0 })], roped: [rope("2026-11-03", { style: "autobelay", attempts: 6 }), rope("2026-11-03", { result: "fell" })] });
    const byKind = [a, b, c, d];
    expect(byKind.map(sendsIn).sort()).toEqual([0, 0, 1, 6]);
    expect(routesOf(byKind.find((x) => x.kind === "board")!)).toBe(0);
  });

  it("totals days, sends and different climbs, counting a board climb once however often it was sent", () => {
    const list = all({
      board: [board("2026-11-03", { climbUuid: "SAME" }), board("2026-11-04", { climbUuid: "SAME" }), board("2026-11-04", { climbUuid: "OTHER" })],
      offBoard: [gym("2026-11-04")], roped: [rope("2026-11-04", { style: "autobelay", attempts: 4 })],
    });
    expect(timelineTotals(list)).toEqual({ days: 2, sends: 3 + 1 + 4, climbs: 2 + 1 + 1 });
    expect(timelineTotals([])).toEqual({ days: 0, sends: 0, climbs: 0 });
  });
});

describe("day titles", () => {
  it("says Today and Yesterday, then the weekday and date, with the year only when it differs", () => {
    expect(dayTitle("2026-11-04", "2026-11-04")).toBe("Today");
    expect(dayTitle("2026-11-03", "2026-11-04")).toBe("Yesterday");
    expect(dayTitle("2026-10-28", "2026-11-04")).toBe("Wed 28 Oct");
    expect(dayTitle("2025-12-31", "2026-11-04")).toBe("Wed 31 Dec 2025");
  });
});
