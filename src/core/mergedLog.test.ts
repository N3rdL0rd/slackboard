import { describe, expect, it } from "vitest";
import { ensureLocalSchema } from "./logicalCircuits";
import { deleteLocalLog, doneKey, doneMap, loadLocalLogs, mergeLogs, saveLocalLog } from "./mergedLog";
import { openNodeDb } from "./nodeDb";
import type { LogEntry } from "./types";

const e = (over: Partial<LogEntry>): LogEntry => ({ id: "1", provider: "tension", climbUuid: "C1", climbName: "x", angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty: 16, comment: "", climbedAt: "2026-10-28 18:00:00", isSend: true, ...over });

describe("mergeLogs", () => {
  it("interleaves providers newest first", () => {
    const out = mergeLogs([e({ id: "a", climbedAt: "2026-10-01 10:00:00" })], [e({ id: "b", provider: "moon", climbedAt: "2026-10-02 10:00:00" })]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("keeps the same id from different providers apart, and an exact repeat once", () => {
    const out = mergeLogs([e({ id: "1" }), e({ id: "1" })], [e({ id: "1", provider: "moon" })]);
    expect(out.map((x) => x.provider).sort()).toEqual(["moon", "tension"]);
  });
});

describe("doneMap", () => {
  it("a send beats attempts at the same angle, in either order", () => {
    const k = doneKey("tension", "C1", 40);
    expect(doneMap([e({ id: "a", isSend: false }), e({ id: "b", isSend: true })]).get(k)).toBe("sent");
    expect(doneMap([e({ id: "b", isSend: true }), e({ id: "a", isSend: false })]).get(k)).toBe("sent");
    expect(doneMap([e({ isSend: false })]).get(k)).toBe("tried");
  });
  it("is separate per angle and per provider", () => {
    const m = doneMap([e({ angle: 30 }), e({ id: "2", provider: "moon" })]);
    expect(m.get(doneKey("tension", "C1", 40))).toBeUndefined();
    expect(m.get(doneKey("tension", "C1", 30))).toBe("sent");
    expect(m.get(doneKey("moon", "C1", 40))).toBe("sent");
  });
  it("matches climb ids regardless of case", () => {
    expect(doneMap([e({ climbUuid: "abc" })]).get(doneKey("tension", "ABC", 40))).toBe("sent");
  });
});

describe("local logs", () => {
  it("round-trips and deletes", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    const row = e({ id: "L1", provider: "moon", isMirror: true, isSend: false, bidCount: 3, comment: "hard, \"crimpy\"" });
    await saveLocalLog(db, row);
    expect(await loadLocalLogs(db)).toEqual([row]);
    await deleteLocalLog(db, "L1");
    expect(await loadLocalLogs(db)).toEqual([]);
  });
});
