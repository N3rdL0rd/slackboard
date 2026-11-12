import { describe, expect, it } from "vitest";
import { deleteFrame, duplicateFrame, encodeFrames, framesForCount, parseFrames, setHoldInFrame, type Frame } from "./frames";

describe("frames", () => {
  it("parses a single frame in order", () => {
    const [f] = parseFrames("p344r6p358r8p362r6");
    expect([...f]).toEqual([[344, 6], [358, 8], [362, 6]]);
  });
  it("expands ditto frames with removals and changes", () => {
    const f = parseFrames('p1r5p2r6p3r7,"x2p4r8,"');
    expect([...f[1]]).toEqual([[1, 5], [3, 7], [4, 8]]);
    expect([...f[2]]).toEqual([...f[1]]);
  });
  it("round-trips through the full form", () => {
    const s = "p1r5p2r6,p3r7";
    expect(encodeFrames(parseFrames(s))).toBe(s);
  });
  it("round-trips route dittos and empty frames into independent full frames", () => {
    const parsed = parseFrames('p1r5p2r6,"x2p3r7,,p4r8,');
    expect(parsed.map((f) => [...f])).toEqual([
      [[1, 5], [2, 6]],
      [[1, 5], [3, 7]],
      [],
      [[4, 8]],
      [],
    ]);
    expect(parseFrames(encodeFrames(parsed))).toEqual(parsed);
    parsed[0].set(99, 5);
    expect(parsed[1].has(99)).toBe(false);
  });
  it("ignores per-frame angle annotations", () => {
    expect([...parseFrames("p1r5a-2")[0]]).toEqual([[1, 5]]);
  });
  it("duplicates after the current frame without sharing its holds", () => {
    const original: Frame[] = [new Map([[1, 5]]), new Map([[2, 6]])];
    const next = duplicateFrame(original, 0);
    expect(next.map((f) => [...f])).toEqual([[[1, 5]], [[1, 5]], [[2, 6]]]);
    next[1].set(3, 7);
    expect(next[0].size).toBe(1);
    expect(original.length).toBe(2);
  });
  it("deletes the selected frame and shifts later frames down", () => {
    const frames: Frame[] = [new Map([[1, 5]]), new Map([[2, 6]]), new Map([[3, 7]])];
    expect(deleteFrame(frames, 1)).toEqual([frames[0], frames[2]]);
    expect(deleteFrame(frames, 0)).toEqual([frames[1], frames[2]]);
    expect(deleteFrame(frames, 9)).toBe(frames);
  });
  it("sets holds only in the selected frame and observes its own cap", () => {
    const frames: Frame[] = [new Map([[1, 5]]), new Map([[2, 6]])];
    expect(setHoldInFrame(frames, 1, 3, 7, 2)).toEqual([frames[0], new Map([[2, 6], [3, 7]])]);
    expect(setHoldInFrame(frames, 1, 3, 7, 1)).toBeNull();
    expect(setHoldInFrame(frames, 0, 1, 5, 1)).toEqual([new Map(), frames[1]]);
    expect(frames[1]).toEqual(new Map([[2, 6]]));
  });
  it("pads declared missing frames without dropping parsed frames", () => {
    const one: Frame[] = [new Map([[1, 5]])];
    expect(framesForCount(one, 3)).toEqual([one[0], new Map(), new Map()]);
    expect(one.length).toBe(1);
    expect(framesForCount(one, 0)).toEqual(one);
  });
});
