import { describe, expect, it } from "vitest";
import { chunk, encodeV2, encodeV3, holesFor } from "./led";

// Vector produced by a reference encoder from the bundled DB (layout 10, size 6).
const ROLE: Record<number, string> = { 5: "00FF00", 6: "0000FF", 7: "FF0000", 8: "FF00FF" };
const holes = [
  [286, 8], [391, 8], [415, 8], [423, 8], [326, 6], [341, 5], [393, 5], [399, 7], [431, 6], [457, 8],
].map(([position, role]) => ({ position, color: ROLE[role] }));
const hex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join(" ").toUpperCase();

describe("led packets", () => {
  it("encodes V3 exactly as the reference vector", () => {
    expect(hex(encodeV3(holes))).toBe(
      "01 1F FE 02 54 1E 01 E3 87 01 E3 9F 01 E3 A7 01 E3 46 01 03 55 01 1C 89 01 1C 8F 01 E0 AF 01 03 C9 01 E3 03",
    );
  });
  it("encodes V2 exactly as the reference vector", () => {
    expect(hex(encodeV2(holes))).toBe(
      "01 15 5B 02 50 1E CD 87 CD 9F CD A7 CD 46 0D 55 31 89 31 8F C1 AF 0D C9 CD 03",
    );
  });
  it("splits long V3 sets into first/middle/last messages of at most 84 LEDs", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ position: i, color: "FFFFFF" }));
    const bytes = encodeV3(many);
    const cmds: number[] = [];
    for (let i = 0; i < bytes.length; ) {
      cmds.push(bytes[i + 4]);
      i += 4 + bytes[i + 1] + 1;
    }
    expect(cmds).toEqual([82, 81, 83]);
  });
  it("chunks to 20 bytes", () => {
    expect(chunk(new Array(45).fill(1)).map((c) => c.length)).toEqual([20, 20, 5]);
  });
});

describe("holesFor", () => {
  const placements = new Map([[1, { led: 10, mirror: 2 }], [2, { led: 20, mirror: 1 }], [3, { led: 30, mirror: null }]]);
  const roles = new Map([[5, { led_color: "00FF00" }], [6, { led_color: "0000FF" }]]);
  it("maps placements and roles to LEDs", () => {
    expect(holesFor(new Map([[1, 5], [3, 6]]), placements, roles, false)).toEqual([{ position: 10, color: "00FF00" }, { position: 30, color: "0000FF" }]);
  });
  it("lights the mirror placement when mirrored, and the hold itself when it has none", () => {
    expect(holesFor(new Map([[1, 5], [3, 6]]), placements, roles, true)).toEqual([{ position: 20, color: "00FF00" }, { position: 30, color: "0000FF" }]);
  });
  it("skips unknown placements and lights unknown roles white", () => {
    expect(holesFor(new Map([[99, 5], [1, 77]]), placements, roles, false)).toEqual([{ position: 10, color: "FFFFFF" }]);
  });
  it("no frame means nothing lit", () => expect(holesFor(undefined, placements, roles, false)).toEqual([]));
});
