import { describe, expect, it } from "vitest";
import { BOARD_COLORS, boardColor, neighbourBoard, orderBoards, resolveBoardId } from "./boards";

const b = (id: string) => ({ id });

describe("boardColor", () => {
  it("is stable per board and comes from the palette", () => {
    expect(boardColor("abc")).toBe(boardColor("abc"));
    expect(BOARD_COLORS).toContain(boardColor("some-other-uuid"));
  });
});

describe("orderBoards", () => {
  it("puts the most recently opened first and keeps the rest in their original order", () => {
    const out = orderBoards([b("a"), b("b"), b("c"), b("d")], { c: 50, b: 10 }).map((x) => x.id);
    expect(out).toEqual(["c", "b", "a", "d"]);
  });
  it("leaves the list alone when nothing was opened", () => {
    expect(orderBoards([b("a"), b("b")], {}).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("neighbourBoard", () => {
  const list = [b("a"), b("b"), b("c")];
  it("wraps in both directions", () => {
    expect(neighbourBoard(list, "c", 1)?.id).toBe("a");
    expect(neighbourBoard(list, "a", -1)?.id).toBe("c");
    expect(neighbourBoard(list, "b", 1)?.id).toBe("c");
  });
  it("has no neighbour with a single board", () => {
    expect(neighbourBoard([b("a")], "a", 1)).toBeUndefined();
  });
});

describe("resolveBoardId", () => {
  const boards = [{ id: "a" }, { id: "b" }];
  it("keeps the chosen board, and falls back to the first when none is chosen or the chosen one is gone", () => {
    expect(resolveBoardId("b", boards)).toBe("b");
    expect(resolveBoardId(null, boards)).toBe("a");
    expect(resolveBoardId(undefined, boards)).toBe("a");
    expect(resolveBoardId("deleted", boards)).toBe("a");
    expect(resolveBoardId("a", [])).toBeNull();
  });
});
