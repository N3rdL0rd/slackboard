import { describe, expect, it } from "vitest";
import { HOLD_TYPES, HOLD_TYPE_INFO, holdProfile, mappedShare, matchesHoldFilter, parseHoldMap, profileBar, shareOf, untagged, MIN_MAPPED_SHARE } from "./holdTypes";

const map = new Map([["A1", "jug"], ["A2", "jug"], ["A3", "crimp"], ["A4", "sloper"], ["A5", "sloper"], ["F1", "foot"]] as const);
const hold = (key: string, foot = false) => ({ key, foot });

describe("the types", () => {
  it("each has a label and a plain definition", () => {
    for (const t of HOLD_TYPES) { expect(HOLD_TYPE_INFO[t].label).not.toBe(""); expect(HOLD_TYPE_INFO[t].hint).not.toBe(""); }
  });
});

describe("reading a hold-types file", () => {
  const good = { board: "moon2016", version: 1, holds: { A1: "jug", A2: "sloper" } };

  it("reads a good file", () => {
    const r = parseHoldMap(good);
    expect(r.ok && [r.board, r.holds.get("A2"), r.skipped]).toEqual(["moon2016", "sloper", 0]);
  });
  it("skips and counts holds with an unknown type or an empty key, and keeps the rest", () => {
    const r = parseHoldMap({ ...good, holds: { A1: "jug", A2: "bucket", "": "jug", A3: 5 } });
    expect(r.ok && [r.holds.size, r.skipped]).toEqual([1, 3]);
  });
  it("refuses a file that is the wrong shape, undated or newer than the app understands", () => {
    for (const bad of [null, "x", 5, [], {}, { board: "", version: 1, holds: {} }, { board: "b", holds: {} }, { board: "b", version: 1 }, { board: "b", version: 1, holds: [] }, { board: "b", version: 0, holds: {} }]) expect(parseHoldMap(bad).ok).toBe(false);
    const newer = parseHoldMap({ ...good, version: 2 });
    expect(!newer.ok && newer.error).toMatch(/newer/);
  });
  it("lists what is left to tag", () => {
    expect(untagged(["A1", "B1", "B2"], map)).toEqual(["B1", "B2"]);
  });
});

describe("a climb's hold profile", () => {
  const climb = [hold("A1"), hold("A2"), hold("A3"), hold("A4"), hold("F1", true)];

  it("counts the hand holds by type and leaves out holds used as feet", () => {
    const p = holdProfile(climb, map);
    expect(p).toMatchObject({ handHolds: 4, mapped: 4 });
    expect(p.counts).toMatchObject({ jug: 2, crimp: 1, sloper: 1, foot: 0 });
  });
  it("counts a hold with no type as a hand hold that is not mapped", () => {
    const p = holdProfile([...climb, hold("Z9")], map);
    expect(p).toMatchObject({ handHolds: 5, mapped: 4 });
    expect(mappedShare(p)).toBeCloseTo(0.8);
  });
  it("gives shares of the mapped holds, and a bar biggest first", () => {
    const p = holdProfile(climb, map);
    expect(shareOf(p, "jug")).toBe(0.5);
    expect(profileBar(p)).toEqual([{ type: "jug", share: 0.5 }, { type: "crimp", share: 0.25 }, { type: "sloper", share: 0.25 }]);
  });
  it("has no shares and no bar when nothing is mapped, or the climb has no hand holds", () => {
    const none = holdProfile([hold("Z1"), hold("Z2")], map);
    expect(shareOf(none, "jug")).toBeNull();
    expect(profileBar(none)).toEqual([]);
    expect(mappedShare(holdProfile([hold("F1", true)], map))).toBeNull();
  });
});

describe("filtering by hold type", () => {
  const p = holdProfile([hold("A1"), hold("A2"), hold("A3"), hold("A4"), hold("A5")], map); // 2 jugs, 1 crimp, 2 slopers

  it("mostly means at least half of the mapped hand holds", () => {
    expect(matchesHoldFilter(p, { type: "sloper", rule: "mostly" })).toBe(false); // 40%
    expect(matchesHoldFilter(holdProfile([hold("A4"), hold("A5"), hold("A1")], map), { type: "sloper", rule: "mostly" })).toBe(true);
  });
  it("has, none and at least", () => {
    expect(matchesHoldFilter(p, { type: "crimp", rule: "has" })).toBe(true);
    expect(matchesHoldFilter(p, { type: "pocket", rule: "has" })).toBe(false);
    expect(matchesHoldFilter(p, { type: "pocket", rule: "none" })).toBe(true);
    expect(matchesHoldFilter(p, { type: "crimp", rule: "none" })).toBe(false);
    expect(matchesHoldFilter(p, { type: "jug", rule: "atLeast", count: 2 })).toBe(true);
    expect(matchesHoldFilter(p, { type: "jug", rule: "atLeast", count: 3 })).toBe(false);
    expect(matchesHoldFilter(p, { type: "jug", rule: "atLeast" })).toBe(true);
  });
  it("never judges a climb that is not mapped well enough, in either direction", () => {
    const half = holdProfile([hold("A1"), hold("Z1"), hold("Z2"), hold("Z3")], map);
    expect(MIN_MAPPED_SHARE).toBeGreaterThan(0.25);
    expect(matchesHoldFilter(half, { type: "pocket", rule: "none" })).toBe(false);
    expect(matchesHoldFilter(half, { type: "jug", rule: "has" })).toBe(false);
    expect(matchesHoldFilter(holdProfile([hold("F1", true)], map), { type: "jug", rule: "none" })).toBe(false);
  });
});
