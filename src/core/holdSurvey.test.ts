import { describe, expect, it } from "vitest";
import { canonicalTags, nextUnsure, nextUntagged, parseHoldTag, primaryType, surveyOrder, surveyProgress, toSurveyFile, type HoldTag } from "./holdSurvey";

const tag = (key: string, tags: HoldTag["tags"], over: Partial<HoldTag> = {}): HoldTag => ({ board: "b", key, tags, note: "", taggedAt: "2026-11-15 10:00:00", ...over });
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
