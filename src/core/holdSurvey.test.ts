import { describe, expect, it } from "vitest";
import { canonicalTags, deadPattern, deadPlacementIds, faceWords, hasDirection, isDone, nextUnsure, nextUntagged, parseHoldTag, primaryType, snapFace, surveyOrder, surveyProgress, toggleTag, toSurveyFile, type HoldTag } from "./holdSurvey";

const tag = (key: string, tags: HoldTag["tags"], over: Partial<HoldTag> = {}): HoldTag => ({ board: "b", key, tags, note: "", taggedAt: "2026-11-15 10:00:00", face: null, ...over });
const p = (id: number, led: number) => ({ id, x: 0, y: 0, led });

describe("survey order", () => {
  it("follows the LED strip and visits a key once", () => {
    const o = surveyOrder([p(30, 3), p(10, 1), p(20, 2), p(21, 2)], (id) => (id === 21 ? "20" : String(id)));
    expect(o.map((h) => h.key)).toEqual(["10", "20", "30"]);
  });

  it("finds the next hold with no tags, wrapping, and the next unsure one", () => {
    const o = surveyOrder([p(1, 1), p(2, 2), p(3, 3)], String);
    const m = new Map([["1", tag("1", ["jug"])], ["3", tag("3", ["unsure"])]]);
    expect(nextUntagged(o, m, 0)).toBe(1);
    expect(nextUntagged(o, m, 2)).toBe(1);
    expect(nextUnsure(o, m, 0)).toBe(2);
    expect(nextUntagged(o, new Map([...m, ["2", tag("2", ["crimp"])]]), 0)).toBeNull();
  });

  it("counts tagged, unsure and left, with unsure kept apart from tagged", () => {
    const o = surveyOrder([p(1, 1), p(2, 2), p(3, 3), p(4, 4)], String);
    const m = new Map([["1", tag("1", ["jug", "wood"])], ["2", tag("2", ["unsure", "crimp"])], ["3", tag("3", ["pocket"])]]);
    expect(surveyProgress(o, m)).toEqual({ total: 4, tagged: 2, unsure: 1, left: 1 });
  });
});

describe("tags", () => {
  it("are put in a fixed order without repeats, and the first shape is the hold's type", () => {
    expect(canonicalTags(["wood", "pinch", "undercling", "crimp", "pinch"])).toEqual(["crimp", "pinch", "undercling", "wood"]);
    expect(primaryType(["pinch", "crimp"] as never)).toBe("crimp");
    expect(primaryType(["wood", "gaston"])).toBeNull();
  });

  it("export as the hold-types file plus every tag, leaving unsure holds out of the types", () => {
    const f = toSurveyFile("b", [
      tag("10", ["crimp", "pinch", "wood"], { note: "sharp" }),
      tag("9", ["unsure", "pocket"]),
      tag("2", ["undercling", "plastic"]),
      tag("7", ["jug"], { board: "other" }),
    ]);
    expect(f.holds).toEqual({ "9": "pocket", "10": "crimp" });
    expect(f.tags["2"]).toEqual(["undercling", "plastic"]);
    expect(f.unsure).toEqual(["9"]);
    expect(f.notes).toEqual({ "10": "sharp" });
    expect(Object.keys(f.tags)).toEqual(["2", "9", "10"]);
  });
});

describe("parseHoldTag", () => {
  it("reads a row (comma list) and a backup record (array) the same way", () => {
    const a = parseHoldTag({ board: "b", key: "5", tags: "wood,crimp", note: "x", taggedAt: "2026-11-15 10:00:00" });
    const b = parseHoldTag({ board: "b", key: "5", tags: ["wood", "crimp"], note: "x", taggedAt: "2026-11-15 10:00:00" });
    expect(a).toEqual(b);
    expect(a?.tags).toEqual(["crimp", "wood"]);
  });

  it("refuses unknown tags, no tags, bad dates and missing keys instead of half-reading them", () => {
    const ok = { board: "b", key: "5", tags: ["jug"], taggedAt: "2026-11-15 10:00:00" };
    expect(parseHoldTag(ok)).not.toBeNull();
    expect(parseHoldTag({ ...ok, tags: ["jug", "sparkly"] })).toBeNull();
    expect(parseHoldTag({ ...ok, tags: [] })).toBeNull();
    expect(parseHoldTag({ ...ok, taggedAt: "yesterday" })).toBeNull();
    expect(parseHoldTag({ ...ok, key: "" })).toBeNull();
    expect(parseHoldTag(null)).toBeNull();
  });
});

describe("tag groups, direction and dead holds", () => {
  it("lets one edge depth, finger count and texture stand at a time, but several shapes", () => {
    let s = toggleTag(new Set(), "crimp");
    s = toggleTag(s, "pinch");
    s = toggleTag(s, "edgeTip");
    s = toggleTag(s, "edgeHalf");
    s = toggleTag(s, "dualTexture");
    s = toggleTag(s, "smooth");
    expect(canonicalTags(s)).toEqual(["crimp", "pinch", "smooth", "edgeHalf"]);
    expect(canonicalTags(toggleTag(s, "pinch"))).toEqual(["crimp", "smooth", "edgeHalf"]);
    expect(canonicalTags(toggleTag(s, "smooth"))).toEqual(["crimp", "pinch", "edgeHalf"]);
  });

  it("asks for a direction only when the hold is pulled sideways or from underneath", () => {
    expect(hasDirection(["crimp", "wood"])).toBe(false);
    expect(hasDirection(["gaston"])).toBe(true);
  });

  it("snaps a direction to 15 degrees and says it in words", () => {
    expect(snapFace(7)).toBe(0);
    expect(snapFace(8)).toBe(15);
    expect(snapFace(359)).toBe(0);
    expect(snapFace(-20)).toBe(345);
    expect(faceWords(90)).toBe("right");
    expect(faceWords(180)).toBe("down");
    expect(faceWords(315)).toBe("up and left");
  });

  it("counts a hold with only light problems as still to do, but a dead hold as done", () => {
    expect(isDone(["wrongLight"])).toBe(false);
    expect(isDone(["wrongLight", "noLight"])).toBe(false);
    expect(isDone(["wrongLight", "crimp"])).toBe(true);
    expect(isDone(["dead"])).toBe(true);
    const o = surveyOrder([p(1, 1), p(2, 2)], String);
    expect(nextUntagged(o, new Map([["1", tag("1", ["noLight"])]]), 0)).toBe(0);
  });

  it("finds dead holds on one board and tests a climb's frames against them", () => {
    const o = surveyOrder([p(11, 1), p(12, 2), p(120, 3)], String);
    const rows = [tag("11", ["dead"]), tag("12", ["jug"]), tag("120", ["dead", "wood"]), tag("12", ["dead"], { board: "other" })];
    const ids = deadPlacementIds(o, rows, "b");
    expect(ids).toEqual([11, 120]);
    const re = deadPattern(ids)!;
    expect(re.test("p5r12p11r13")).toBe(true);
    expect(re.test("p12r12p5r13")).toBe(false);
    expect(re.test("p1120r12")).toBe(false);
    expect(deadPattern([])).toBeNull();
  });

  it("keeps a direction in the file and drops one that is not a whole number of degrees", () => {
    expect(toSurveyFile("b", [tag("3", ["gaston"], { face: 90 })]).faces).toEqual({ "3": 90 });
    const base = { board: "b", key: "5", tags: ["gaston"], taggedAt: "2026-11-15 10:00:00" };
    expect(parseHoldTag({ ...base, face: 135 })?.face).toBe(135);
    expect(parseHoldTag({ ...base, face: 12.5 })?.face).toBeNull();
    expect(parseHoldTag({ ...base, face: 360 })?.face).toBeNull();
  });
});
