import { describe, expect, it } from "vitest";
import { activeChips, applyFilter, clearChip, DEFAULT_FILTER, describeRange, type FilterContext } from "./filters";
import { GradeScale } from "./grades";
import type { AngleStat, Climb } from "./types";

const grades = new GradeScale(
  Array.from({ length: 24 }, (_, i) => ({
    difficulty: 10 + i,
    boulder_name: `x/V${Math.floor(i / 2)}`,
    route_name: "",
  })),
);
const mk = (name: string, over: Partial<Climb> = {}): Climb => ({ uuid: name, layoutId: 10, name, setter: "s", frames: "", frameCount: 1, pace: 1000, noMatch: false, createdAt: "2020", left: -10, right: 10, bottom: 0, top: 40, ...over });
const climbs = [mk("easy"), mk("hard"), mk("proj")];
// "proj" has no stat at the viewed angle: a project.
const STATS: [string, AngleStat][] = [["easy", [10, null, 50, 2.5]], ["hard", [20, 20, 10, 3]]];
const ctx = (over: Partial<FilterContext> = {}): FilterContext => ({
  stats: new Map(STATS), grades, done: () => undefined, liked: () => false, blocked: () => false, hasBeta: () => false, isDraft: () => false, circuits: new Map(), board: { left: -50, right: 50, bottom: 0, top: 100 }, seed: 1, ...over,
});

describe("applyFilter", () => {
  it("shows projects last by default and drops them when disabled", () => {
    expect(applyFilter(climbs, DEFAULT_FILTER, ctx()).map((c) => c.name)).toEqual(["easy", "hard", "proj"]);
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, projects: false }, ctx()).map((c) => c.name)).not.toContain("proj");
  });
  it("grade range is inclusive, supports open ends, and excludes projects", () => {
    // difficulty 10 -> V0, 20 -> V5
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, gradeMin: 0, gradeMax: 0 }, ctx()).map((c) => c.name)).toEqual(["easy"]);
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, gradeMin: 1, gradeMax: null }, ctx()).map((c) => c.name)).toEqual(["hard"]);
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, gradeMin: null, gradeMax: 5 }, ctx()).map((c) => c.name)).toEqual(["easy", "hard"]);
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, gradeMin: 2, gradeMax: 3 }, ctx())).toEqual([]);
  });
  it("classic uses the benchmark at the viewed angle", () => {
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, classic: true }, ctx()).map((c) => c.name)).toEqual(["hard"]);
  });
  it("logbook toggles hide what you have sent, attempted or not tried", () => {
    const done = (u: string) => (u === "easy" ? ("sent" as const) : u === "hard" ? ("tried" as const) : undefined);
    const names = (f: Partial<typeof DEFAULT_FILTER>) => applyFilter(climbs, { ...DEFAULT_FILTER, ...f }, ctx({ done })).map((c) => c.name);
    expect(names({ showSent: false })).toEqual(["hard", "proj"]);
    expect(names({ showTried: false, showUntried: false })).toEqual(["easy"]);
    expect(names({ showSent: false, showTried: false })).toEqual(["proj"]);
  });
  it("established and projects are separate toggles", () => {
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, established: false }, ctx()).map((c) => c.name)).toEqual(["proj"]);
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, projects: false }, ctx()).map((c) => c.name)).toEqual(["easy", "hard"]);
  });
  it("drafts show with the My drafts toggle, ignore grade and status rules, and drop out of grade ranges", () => {
    const isDraft = (u: string) => u === "proj";
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, projects: false }, ctx({ isDraft })).map((c) => c.name)).toContain("proj");
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, drafts: false }, ctx({ isDraft })).map((c) => c.name)).not.toContain("proj");
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, gradeMin: 0 }, ctx({ isDraft })).map((c) => c.name)).not.toContain("proj");
  });
  it("hides blocked climbs unless asked", () => {
    const blocked = (u: string) => u === "hard";
    expect(applyFilter(climbs, DEFAULT_FILTER, ctx({ blocked })).map((c) => c.name)).not.toContain("hard");
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, blocked: true }, ctx({ blocked })).map((c) => c.name)).toContain("hard");
  });
  it("random sort is stable for a seed", () => {
    const f = { ...DEFAULT_FILTER, sort: "random" as const };
    expect(applyFilter(climbs, f, ctx()).map((c) => c.name)).toEqual(applyFilter(climbs, f, ctx()).map((c) => c.name));
  });
});

describe("chips", () => {
  it("lists active filters but not sort/search, and clears one", () => {
    const f = { ...DEFAULT_FILTER, gradeMin: 2, gradeMax: 4, classic: true, sort: "newest" as const, search: "x" };
    expect(activeChips(f).map((c) => c.label)).toEqual(["V2 to V4", "Classic only"]);
    expect(activeChips(clearChip(f, "grade")).map((c) => c.label)).toEqual(["Classic only"]);
  });
  it("describes ranges in plain words", () => {
    expect(describeRange(3, 3)).toBe("V3");
    expect(describeRange(5, null)).toBe("V5 and up");
    expect(describeRange(null, 2)).toBe("V2 and easier");
    expect(describeRange(null, null)).toBe("Any grade");
  });
});

describe("more filters", () => {
  const all = [
    mk("tallLeft", { left: -40, right: -5, bottom: 5, top: 90 }),
    mk("shortCentre", { left: -10, right: 10, bottom: 5, top: 30 }),
    mk("route", { frameCount: 6, left: 5, right: 40, bottom: 5, top: 80, createdAt: "2021" }),
    mk("other", { setter: "bob", left: -5, right: 5, bottom: 0, top: 20 }),
  ];
  const stats = new Map<string, AngleStat>(all.map((c) => [c.uuid, [15, null, 5, 2]]));
  const run = (f: Partial<typeof DEFAULT_FILTER>, over: Partial<FilterContext> = {}) => applyFilter(all, { ...DEFAULT_FILTER, ...f }, ctx({ stats, ...over })).map((c) => c.name).sort();

  it("splits boulders from routes by frame count", () => {
    expect(run({ routes: false })).toEqual(["other", "shortCentre", "tallLeft"]);
    expect(run({ boulders: false })).toEqual(["route"]);
  });
  it("tall covers most of the height; side stays on one half", () => {
    expect(run({ tall: true })).toEqual(["route", "tallLeft"]);
    expect(run({ side: true })).toEqual(["route", "tallLeft"]);
    expect(run({ tall: true, side: true })).toEqual(["route", "tallLeft"]);
  });
  it("filters by setter and beta", () => {
    expect(run({ setter: "bob" })).toEqual(["other"]);
    expect(run({ beta: true }, { hasBeta: (u) => u === "route" })).toEqual(["route"]);
  });
  it("applies circuit rules: any, all and none", () => {
    const circuits = new Map([["A", new Set(["route", "other"])], ["B", new Set(["other"])]]);
    expect(run({ circuitsAny: ["A", "B"] }, { circuits })).toEqual(["other", "route"]);
    expect(run({ circuitsAll: ["A", "B"] }, { circuits })).toEqual(["other"]);
    expect(run({ circuitsNone: ["A"] }, { circuits })).toEqual(["shortCentre", "tallLeft"]);
  });
  it("lists the new filters as chips and clears circuit rules together", () => {
    const f = { ...DEFAULT_FILTER, tall: true, setter: "bob", circuitsAny: ["A"], circuitsNone: ["B"] };
    expect(activeChips(f).map((c) => c.label)).toEqual(["Tall", "Set by bob", "2 circuit rules"]);
    expect(clearChip(f, "circuitsAny").circuitsNone).toEqual([]);
  });
});
