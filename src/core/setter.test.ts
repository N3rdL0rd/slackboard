import { describe, expect, it } from "vitest";
import { checkDraft, copyName, framesString, routeIssues, tapHold, utf8Bytes } from "./setter";
import { parseFrames, type Frame } from "./frames";
import type { Role } from "./types";

const roles: Role[] = [
  { id: 5, position: 1, name: "start", full_name: "Start", led_color: "" }, { id: 6, position: 2, name: "middle", full_name: "Middle", led_color: "" },
  { id: 7, position: 3, name: "finish", full_name: "Finish", led_color: "" }, { id: 8, position: 4, name: "foot", full_name: "Foot only", led_color: "" },
];
const rules = { minHolds: 2, maxHolds: 5 };
const draft = (holds: [number, number][], name = "Good") => ({ frames: [new Map(holds)] as Frame[], framesPace: 0, name, description: "" });
const route = (frames: Frame[]) => ({ frames, framesPace: 10000, name: "Good", description: "" });

describe("setter", () => {
  it("accepts a valid climb and lists problems in the order to fix them", () => {
    expect(checkDraft(draft([[1, 5], [2, 7]]), roles, rules, false).problems).toEqual([]);
    expect(checkDraft(draft([]), roles, rules, false).problems).toEqual(["Add a start hold", "Add a finish hold", "Use at least 2 holds"]);
    expect(checkDraft(draft([[1, 5], [2, 7]], "  "), roles, rules, false).problems).toEqual(["Name your climb"]);
    expect(checkDraft(draft([[1, 5], [2, 7]]), roles, rules, true).problems).toEqual(["That name is already used on this board"]);
  });
  it("limits starts, finishes, total holds and name length by bytes", () => {
    expect(checkDraft(draft([[1, 5], [2, 5], [3, 5], [4, 7]]), roles, rules, false).problems).toEqual(["Use at most 2 start holds"]);
    expect(checkDraft(draft([[1, 5], [2, 7], [3, 7], [4, 7]]), roles, rules, false).problems).toEqual(["Use at most 2 finish holds"]);
    expect(checkDraft(draft([[1, 5], [2, 6], [3, 6], [4, 6], [5, 6], [6, 7]]), roles, rules, false).problems).toEqual(["Use at most 5 holds"]);
    expect(utf8Bytes("é")).toBe(2);
    expect(checkDraft(draft([[1, 5], [2, 7]], "é".repeat(51)), roles, rules, false).problems).toEqual(["The name is too long"]);
  });
  it("adds, removes and replaces holds on tap, and stops at the hold limit", () => {
    let h = new Map<number, number>();
    h = tapHold(h, 1, 6, 2)!;
    expect([...h]).toEqual([[1, 6]]);
    h = tapHold(h, 1, 7, 2)!;
    expect([...h]).toEqual([[1, 7]]);
    h = tapHold(h, 1, 7, 2)!;
    expect(h.size).toBe(0);
    h = tapHold(tapHold(h, 1, 6, 2)!, 2, 6, 2)!;
    expect(tapHold(h, 3, 6, 2)).toBeNull();
    expect(tapHold(h, 2, 7, 2)!.get(2)).toBe(7); // replacing at the limit is fine
  });
  it("writes one frame sorted by placement id that parses back", () => {
    const s = framesString(new Map([[30, 7], [10, 5]]));
    expect(s).toBe("p10r5p30r7");
    expect([...parseFrames(s)[0]]).toEqual([[10, 5], [30, 7]]);
  });
  it("writes multiple frames sorted by placement id that parse back", () => {
    const input = [new Map([[30, 7], [10, 5]]), new Map([[20, 6], [10, 5]])];
    expect(framesString(input)).toBe("p10r5p30r7,p10r5p20r6");
    expect(parseFrames(framesString(input))).toEqual(input);
  });
  it("enforces the boulder's exact frame count", () => {
    expect(checkDraft(route([]), roles, rules, false).problems[0]).toBe("A boulder must have exactly 1 frame.");
  });
  it("accepts a valid route", () => {
    const frames = Array.from({ length: 5 }, (_, i) => new Map([[1, i === 0 ? 5 : 6], [2, i === 4 ? 7 : 6]]));
    expect(checkDraft(route(frames), roles, rules, false, "route").problems).toEqual([]);
  });
  it("reports per-frame limits with the frame to jump to", () => {
    const valid = new Map([[1, 6], [2, 6]]);
    const short = new Map([[1, 6]]);
    const long = new Map(Array.from({ length: 6 }, (_, i) => [i + 1, 6]));
    expect(routeIssues([valid, short, long, valid, valid], roles, rules)).toEqual([
      { message: "There must be at least 2 hold(s) in each frame of the route.", frameIndex: 1 },
      { message: "There must be at most 5 hold(s) in each frame of the route.", frameIndex: 2 },
      { message: "A start hold is on no frames.", frameIndex: 0 },
      { message: "A finish hold is on no frames.", frameIndex: 4 },
    ]);
  });
  it("reports starts and finishes on the wrong frames", () => {
    const frames = [
      new Map([[1, 5], [2, 7]]),
      new Map([[1, 6], [2, 6]]),
      new Map([[1, 5], [2, 7]]),
      new Map([[1, 6], [2, 6]]),
      new Map([[1, 6], [2, 6]]),
    ];
    expect(routeIssues(frames, roles, { minHolds: 2, maxHolds: 35 })).toEqual([
      { message: "Start holds must be on the first frame.", frameIndex: 2 },
      { message: "Finish holds must be on the last frame.", frameIndex: 0 },
    ]);
  });
  it("distinguishes missing from too many start and finish holds", () => {
    const frames = Array.from({ length: 5 }, () => new Map([[1, 5], [2, 5], [3, 5], [4, 7], [5, 7], [6, 7], [7, 6]]));
    expect(routeIssues(frames, roles, { minHolds: 2, maxHolds: 35 }).map((p) => p.message)).toEqual([
      "There must be at most 2 start holds.",
      "There must be at most 2 finish holds.",
      "Start holds must be on the first frame.",
      "Finish holds must be on the last frame.",
    ]);
  });
  it("enforces five to one hundred frames with exact messages", () => {
    expect(routeIssues([], roles, rules).map((p) => p.message)).toContain("A route must have at least 5 frames.");
    expect(routeIssues(Array.from({ length: 101 }, () => new Map()), roles, rules).map((p) => p.message)).toContain("A route must have at most 100 frames.");
  });
});

describe("copyName", () => {
  it("prefixes the name", () => expect(copyName("Warm up")).toBe("Copy of Warm up"));
  it("stays inside the 100 byte limit for a long name, and never splits a multi-byte character", () => {
    const long = copyName("x".repeat(300));
    expect(utf8Bytes(long)).toBeLessThanOrEqual(100);
    const wide = copyName("\u6d4b\u8bd5".repeat(60));
    expect(utf8Bytes(wide)).toBeLessThanOrEqual(100);
    expect(wide).not.toContain("\ufffd");
    expect(wide.startsWith("Copy of ")).toBe(true);
  });
});
