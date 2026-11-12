import { describe, expect, it } from "vitest";
import { ensureLocalSchema, loadLogicalCircuits, mergeRemoteItems, reconcile, saveLogicalCircuits, syncLogicalCircuits, type LogicalCircuit, type RemoteCircuit } from "./logicalCircuits";
import { openNodeDb } from "./nodeDb";
import { makeRef, type ClimbRef } from "./provider";

const T = (id: string): ClimbRef => makeRef("tension", id);
const M = (id: string): ClimbRef => makeRef("moon", id);
const ids = (items: ClimbRef[]) => items.map((i) => `${i.provider[0]}${i.id}`);
const opts = { userId: 7, now: "2026-11-01 00:00:00", complete: true };
const remote = (over: Partial<RemoteCircuit> = {}): RemoteCircuit => ({ uuid: "C1", name: "Warm up", description: "", color: "FF0000", isPublic: true, climbs: ["A", "B", "C"], ...over });

describe("mergeRemoteItems", () => {
  it("drops climbs the server removed and keeps other providers' climbs", () => {
    const out = mergeRemoteItems([T("A"), M("X"), T("B")], "tension", ["A", "B"], ["A"]);
    expect(ids(out)).toEqual(["tA", "mX"]);
  });
  it("inserts a climb added on the server after its predecessor there", () => {
    const out = mergeRemoteItems([T("A"), M("X"), T("B")], "tension", ["A", "B"], ["A", "N", "B"]);
    expect(ids(out)).toEqual(["tA", "tN", "mX", "tB"]);
  });
  it("puts an added first climb first", () => {
    expect(ids(mergeRemoteItems([M("X"), T("A")], "tension", ["A"], ["N", "A"]))).toEqual(["tN", "mX", "tA"]);
  });
  it("reorders this provider's climbs in their own slots, leaving other providers where they are", () => {
    const out = mergeRemoteItems([T("A"), M("X"), T("B"), M("Y"), T("C")], "tension", ["A", "B", "C"], ["C", "A", "B"]);
    expect(ids(out)).toEqual(["tC", "mX", "tA", "mY", "tB"]);
  });
  it("keeps a climb added here that the server has not seen yet", () => {
    const out = mergeRemoteItems([T("A"), T("PENDING")], "tension", ["A"], ["A"]);
    expect(ids(out)).toEqual(["tA", "tPENDING"]);
  });
  it("is a no-op when the server already matches what we hold", () => {
    const items = [T("A"), M("X"), T("B")];
    expect(mergeRemoteItems(items, "tension", ["A", "B", "C"], ["A", "B"])).toEqual(items);
  });
});

describe("reconcile", () => {
  it("imports a server circuit under its own uuid, with a projection", () => {
    const [c] = reconcile([], "tension", [remote()], opts);
    expect(c).toMatchObject({ uuid: "C1", name: "Warm up", isPublic: true, climbs: ["A", "B", "C"], userId: 7 });
    expect(c.projections).toHaveLength(1);
    expect(c.items.every((i) => i.provider === "tension")).toBe(true);
  });
  it("is stable when nothing changed", () => {
    const once = reconcile([], "tension", [remote()], opts);
    expect(reconcile(once, "tension", [remote()], opts)).toEqual(once);
  });
  it("takes name, colour and visibility from the server when they change there", () => {
    const once = reconcile([], "tension", [remote()], opts);
    const [c] = reconcile(once, "tension", [remote({ name: "Renamed", color: "0000FF", isPublic: false })], opts);
    expect(c).toMatchObject({ name: "Renamed", color: "0000FF", isPublic: false });
  });
  it("keeps other providers' climbs when the server list changes", () => {
    const once = reconcile([], "tension", [remote()], opts);
    const withMoon = once.map((c) => ({ ...c, items: [...c.items, M("X")], climbs: [...c.climbs, "X"] }));
    const [c] = reconcile(withMoon, "tension", [remote({ climbs: ["A", "C"] })], opts);
    expect(ids(c.items)).toEqual(["tA", "tC", "mX"]);
  });
  it("a circuit gone from the server loses its projection but stays on the device", () => {
    const once = reconcile([], "tension", [remote()], opts);
    const [c] = reconcile(once, "tension", [], opts);
    expect(c.projections).toEqual([]);
    expect(c.climbs).toEqual(["A", "B", "C"]);
    expect(c.isPublic).toBe(false);
  });
  it("does not treat a missing circuit as deleted while the server data may be partial", () => {
    const once = reconcile([], "tension", [remote()], opts);
    const [c] = reconcile(once, "tension", [], { ...opts, complete: false });
    expect(c.projections).toHaveLength(1);
  });
  it("leaves local-only circuits and other providers' projections alone", () => {
    const local: LogicalCircuit = { uuid: "L1", name: "Mine", description: "", color: "00CC00", userId: 7, items: [M("X")], climbs: ["X"], isPublic: false, projections: [{ provider: "moon", remoteUuid: "R9", isPublic: false, remoteHash: "h", remoteItems: ["X"] }], createdAt: "t", updatedAt: "t" };
    const out = reconcile([local], "tension", [], opts);
    expect(out[0]).toEqual(local);
  });
});

describe("storage", () => {
  it("round-trips circuits with items in order and projections", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    const saved = await syncLogicalCircuits(db, "tension", [remote({ climbs: ["B", "A"] })], opts);
    expect(await loadLogicalCircuits(db)).toEqual(saved);
    expect((await loadLogicalCircuits(db))[0].climbs).toEqual(["B", "A"]);
  });
  it("writes only what changed and removes deleted circuits", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    const a = await syncLogicalCircuits(db, "tension", [remote(), remote({ uuid: "C2", name: "Two" })], opts);
    expect(a).toHaveLength(2);
    await saveLogicalCircuits(db, a.filter((c) => c.uuid === "C2"), a);
    const rest = await loadLogicalCircuits(db);
    expect(rest.map((c) => c.uuid)).toEqual(["C2"]);
    expect(await db.all("SELECT 1 FROM l_circuit_items WHERE circuit_uuid = 'C1'")).toEqual([]);
  });
  it("a climb listed twice is stored once", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    const c = reconcile([], "tension", [remote()], opts)[0];
    await saveLogicalCircuits(db, [{ ...c, items: [...c.items, T("A")] }], []);
    expect((await loadLogicalCircuits(db))[0].climbs).toEqual(["A", "B", "C"]);
  });
});
