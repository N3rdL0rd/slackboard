import { describe, expect, it } from "vitest";
import { circuitDisplayColor, circuitsContaining, moveItem } from "./circuits";

describe("circuits", () => {
  it("reorders without mutating and ignores moves off either end", () => {
    const l = ["a", "b", "c"];
    expect(moveItem(l, 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(l, 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 2, 1)).toBe(l);
    expect(l).toEqual(["a", "b", "c"]);
  });
  it("lightens colours that disappear on dark", () => {
    expect(circuitDisplayColor("0000FF")).toBe("#4C8DFF");
    expect(circuitDisplayColor("000000")).toBe("#808080");
    expect(circuitDisplayColor("ff0000")).toBe("#FF0000");
  });
  it("finds the circuits a climb is in", () => {
    expect(circuitsContaining([{ uuid: "1", climbs: ["A"] }, { uuid: "2", climbs: ["B"] }], "a")).toEqual(["1"]);
  });
});
