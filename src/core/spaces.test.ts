import { describe, expect, it } from "vitest";
import { ensureLocalSchema } from "./logicalCircuits";
import { openNodeDb } from "./nodeDb";
import {
  SPACE_RADIUS_KM, groupLogSessions, groupSpaces, loadBoardPlaces, loadLogSpaces, loadSpaceLineage, loadSpaceNames, nearestSpace, reconcileSpaces,
  saveBoardPlace, saveLogSpace, saveSpaceLineage, saveSpaceName, sessionSummary, spaceIdForBoard,
  type LogSpace, type SpaceBoard,
} from "./spaces";
import type { LogEntry } from "./types";

const here = { lat: 51.5, lon: -0.12 };
/** About 150 m north. */
const nearby = (n: number) => ({ lat: here.lat + n * 0.00135, lon: here.lon });
function board(id: string, over: Partial<SpaceBoard> = {}): SpaceBoard {
  return { id, name: id, gymName: "Same name", location: here, addedAt: "2026-01-01T00:00:00Z", manualSpaceId: null, ...over };
}
function log(id: string, over: Partial<LogEntry> = {}): LogEntry {
  return {
    id, provider: "tension", climbUuid: id, climbName: id, angle: 40, isMirror: false, bidCount: 1,
    quality: 3, difficulty: 5, comment: "", climbedAt: "2026-11-01 12:00:00", isSend: true, ...over,
  };
}
const attribution = (entryId: string, boardId: string, spaceId = "space:a"): LogSpace => ({ entryId, boardId, spaceId, spaceName: "The gym" });

describe("location grouping", () => {
  it("uses coordinates, not names, even across providers and across the world", () => {
    const spaces = groupSpaces([
      board("tension", { gymName: "Worldwide Gym" }),
      board("moon", { name: "MoonBoard", gymName: "Worldwide Gym", location: { lat: -33.87, lon: 151.2 } }),
    ]);
    expect(spaces).toHaveLength(2);
    expect(SPACE_RADIUS_KM).toBe(0.2);
  });

  it("joins boards at the boundary and keeps boards outside it separate", () => {
    const close = groupSpaces([board("a"), board("b", { location: nearby(1) })]);
    const far = groupSpaces([board("a"), board("b", { location: nearby(2) })]);
    expect(close).toHaveLength(1);
    expect(far).toHaveLength(2);
  });

  it("uses single linkage, including its chain effect", () => {
    const spaces = groupSpaces([
      board("a"), board("b", { location: nearby(1) }), board("c", { location: nearby(2) }),
    ]);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].boards.map((b) => b.id)).toEqual(["a", "b", "c"]);
    // a and c are more than 200 m apart, but b links them into one component.
  });

  it("gives every unlocated board its own Space and defaults to gym name or Home", () => {
    const spaces = groupSpaces([
      board("gym", { location: null, gymName: "The gym" }),
      board("home", { location: null, gymName: null }),
    ]);
    expect(spaces).toHaveLength(2);
    expect(spaces.map((s) => s.name).sort()).toEqual(["Home", "The gym"]);
    expect(nearestSpace(spaces, here)).toBeNull();
  });
});

describe("names and manual moves", () => {
  it("keeps a rename when boards join", () => {
    const first = groupSpaces([board("a"), board("far", { location: nearby(5), addedAt: "2026-02-01" })], { "space:a": "My cave" });
    expect(first.find((s) => s.id === "space:a")?.name).toBe("My cave");
    const joined = groupSpaces([board("a"), board("far", { location: nearby(1), addedAt: "2026-02-01" })], { "space:a": "My cave" }, first);
    expect(joined).toHaveLength(1);
    expect(joined[0].name).toBe("My cave");
    expect(joined[0].id).toBe(spaceIdForBoard("a"));
  });

  it("moves the rename to the remaining oldest member when the anchor leaves", () => {
    const first = groupSpaces([board("a"), board("b", { addedAt: "2026-02-01" })]);
    const renamed = { "space:a": "Training room" };
    const next = groupSpaces([board("b", { addedAt: "2026-02-01" })], renamed, first);
    expect(next[0].id).toBe("space:b");
    expect(next[0].name).toBe("Training room");
    expect(next[0].renamed).toBe(true);
  });

  it("keeps a rename with the old group, not a member manually moved elsewhere", () => {
    const first = reconcileSpaces([board("a"), board("b")], { "space:a": "Original gym" });
    const moved = reconcileSpaces([board("a"), board("b", { manualSpaceId: "space:a" })], first.names, first.spaces, first.lineage);
    const split = reconcileSpaces([board("a"), board("b", { manualSpaceId: "space:b" }), board("c", { location: nearby(10) })], moved.names, moved.spaces, moved.lineage);
    expect(split.spaces.find((s) => s.id === "space:a")?.name).toBe("Original gym");
    expect(split.spaces.find((s) => s.id === "space:c")?.name).not.toBe("Original gym");
  });

  it("resolves names and manual targets through persisted lineage after a cold start", () => {
    const first = reconcileSpaces([board("a"), board("b")], { "space:a": "Cave" });
    const second = reconcileSpaces([board("b")], first.names, first.spaces, first.lineage);
    const cold = reconcileSpaces([board("b")], second.names, [], second.lineage);
    expect(cold.spaces[0].name).toBe("Cave");
    const moved = reconcileSpaces([board("b"), board("guest", { location: nearby(20), manualSpaceId: "space:a" })], second.names, [], second.lineage);
    expect(moved.spaces.find((s) => s.boards.some((b) => b.id === "guest"))?.id).toBe("space:b");
  });

  it("lets a manual move override co-location and follows the target's new anchor", () => {
    const first = groupSpaces([board("a"), board("b"), board("far", { location: nearby(10) })]);
    const moved = groupSpaces([
      board("a"), board("b", { location: nearby(10) }), board("far", { location: nearby(10), manualSpaceId: "space:a" }),
    ], {}, first);
    expect(moved).toHaveLength(2);
    expect(moved.find((s) => s.id === "space:a")?.boards.map((b) => b.id)).toEqual(["a", "far"]);
    const afterAnchorLeaves = groupSpaces([
      board("b", { location: nearby(10) }), board("far", { location: nearby(10), manualSpaceId: "space:b" }),
    ], {}, first);
    expect(afterAnchorLeaves).toHaveLength(1);
    const target = afterAnchorLeaves.find((s) => s.boards.some((b) => b.id === "far"))!;
    expect(target.id).toBe("space:b");
    expect(target.boards.find((b) => b.id === "far")?.manualSpaceId).toBe("space:b");
  });

  it("does not let a manual move pull two distant automatic groups together", () => {
    const spaces = groupSpaces([
      board("a"), board("far", { location: nearby(10), manualSpaceId: "space:a" }),
      board("other", { location: nearby(10) }),
    ]);
    expect(spaces.find((s) => s.id === "space:a")?.boards.map((b) => b.id)).toEqual(["a", "far"]);
    expect(spaces.find((s) => s.id === "space:other")?.boards.map((b) => b.id)).toEqual(["other"]);
  });
});

describe("arrival detection", () => {
  it("returns the closest board only within the supplied radius", () => {
    const spaces = groupSpaces([
      board("a", { location: nearby(1) }),
      board("b", { location: nearby(10) }),
    ]);
    expect(nearestSpace(spaces, here)?.boardId).toBe("a");
    expect(nearestSpace(spaces, nearby(10))?.boardId).toBe("b");
    expect(nearestSpace(spaces, nearby(20))).toBeNull();
    expect(nearestSpace(spaces, here, SPACE_RADIUS_KM, "space:a")).toBeNull();
  });
});

describe("log sessions", () => {
  it("groups one local day in one Space, summarising sends, boards and hardest grade", () => {
    const spaces = groupSpaces([board("a"), board("b")]);
    const entries = [log("one", { difficulty: 5 }), log("two", { climbedAt: "2026-11-01 18:00:00", difficulty: 8 }), log("attempt", { isSend: false, climbedAt: "2026-11-01 19:00:00" })];
    const sessions = groupLogSessions(entries, spaces, {
      one: attribution("one", "a"), two: attribution("two", "b"), attempt: attribution("attempt", "b"),
    }, (e) => e.difficulty / 2);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe("Sunday");
    expect(sessions[0].boardCount).toBe(2);
    expect(sessions[0].hardest).toBe(4);
    expect(sessionSummary(sessions[0], (g) => `V${g * 2}`)).toBe("2 sends on 2 boards, hardest V8 · 1 attempt entry");
  });

  it("separates Spaces and local calendar days, and keeps unknown entries in Earlier", () => {
    const spaces = groupSpaces([board("a"), board("far", { location: nearby(10) })]);
    const entries = [log("a"), log("b", { climbedAt: "2026-11-01 13:00:00" }), log("next", { climbedAt: "2026-11-02 01:00:00" }), log("old")];
    const sessions = groupLogSessions(entries, spaces, {
      a: attribution("a", "a"), b: attribution("b", "far", "space:far"), next: attribution("next", "a"),
    }, (e) => e.difficulty);
    expect(sessions.map((s) => s.spaceName)).toEqual(["Same name", "Same name", "Same name", "Earlier"]);
    expect(sessions.at(-1)?.earlier).toBe(true);
    expect(sessions.at(-1)?.entries.map((e) => e.id)).toEqual(["old"]);
  });
});

describe("local storage", () => {
  it("round-trips places, renamed Spaces and log attribution, including pending-id migration", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    await saveBoardPlace(db, board("a", { location: nearby(1), gymName: "Gym", manualSpaceId: "space:other" }));
    await saveSpaceName(db, "space:a", "Cave");
    await saveLogSpace(db, attribution("pending:4", "a"));
    await saveLogSpace(db, attribution("SERVER", "a"), "pending:4");

    const { name: _displayName, ...place } = board("a", { location: nearby(1), gymName: "Gym", manualSpaceId: "space:other" });
    expect(await loadBoardPlaces(db)).toEqual({ a: place });
    expect(await loadSpaceNames(db)).toEqual({ "space:a": "Cave" });
    expect(await loadLogSpaces(db)).toEqual({ SERVER: attribution("SERVER", "a") });
    expect(await db.all("SELECT * FROM l_log_spaces WHERE entry_id = 'pending:4'")).toEqual([]);
    await saveSpaceLineage(db, "space:a", "space:b");
    expect(await loadSpaceLineage(db)).toEqual({ "space:a": "space:b" });
  });
});
