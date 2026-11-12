import { describe, expect, it } from "vitest";
import { celebrationFor } from "./celebrate";

// A toy scale: difficulty 10 is V0, 11 is V0 too, 14 is V2, 20 is V5.
const vOf = (d: number) => (d >= 20 ? 5 : d >= 14 ? 2 : 0);

describe("celebrationFor", () => {
  it("celebrates a flash", () => {
    expect(celebrationFor(1, 14, [14, 20], vOf)).toEqual({ kind: "flash", text: "Flashed it." });
  });

  it("celebrates the first send of a higher V grade, but not another of the same grade", () => {
    expect(celebrationFor(3, 20, [14, 14], vOf)).toEqual({ kind: "hardest", text: "Your hardest grade yet: V5." });
    expect(celebrationFor(3, 14, [14], vOf)).toBeNull();
    expect(celebrationFor(3, 11, [14], vOf)).toBeNull();
  });

  it("says so when a new hardest grade was also a flash", () => {
    expect(celebrationFor(1, 20, [14], vOf)).toEqual({ kind: "hardest", text: "A flash, and your hardest grade yet: V5." });
  });

  it("counts a first ever graded send as a new hardest, and an ungraded one as nothing", () => {
    expect(celebrationFor(4, 14, [], vOf)?.kind).toBe("hardest");
    expect(celebrationFor(4, undefined, [], vOf)).toBeNull();
    expect(celebrationFor(4, 0, [14], vOf)).toBeNull();
  });
});
