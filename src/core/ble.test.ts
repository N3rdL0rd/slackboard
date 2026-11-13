import { describe, expect, it, vi } from "vitest";
import { mergeSeen, shortUuid, bleReducer, boardLabel, foundEvent, IdleTimer, IDLE_DISCONNECT_SEC, INITIAL_BLE, RECONNECT_DELAYS_MS, isBoardName, LedLink, pickAutoConnect, type BleEvent, type BleState } from "./ble";
import { tension } from "../providers/tension";

const ble = tension.ble!;

const dev = (id: string, name: string, rssi: number | null = -60) => ({ id, name, rssi });
/** A scan result as the service turns it into an event. */
const seen = (id: string, name: string, rssi: number | null = -60): BleEvent => foundEvent(dev(id, name, rssi), ble) ?? { type: "scan-stop" };
const scanning = (): BleState => bleReducer(INITIAL_BLE, { type: "scan-start" });

describe("foundEvent", () => {
  it("accepts names containing the provider's substring, case-sensitively", () => {
    expect(isBoardName("My Tension Kit", ble)).toBe(true);
    expect(isBoardName("tension", ble)).toBe(false);
    expect(isBoardName(null, ble)).toBe(false);
  });
  it("parses the name with the provider's own parser and ignores other devices", () => {
    expect(foundEvent(dev("a", "Tension Board 2#84669@3"), ble)).toMatchObject({ type: "found", parsed: { serial: "84669", apiLevel: 3 } });
    expect(foundEvent(dev("b", "Headphones"), ble)).toBeNull();
  });
});

describe("bleReducer", () => {
  it("collects boards while scanning and ignores other devices", () => {
    let s = scanning();
    s = bleReducer(s, seen("a", "Tension#1@3"));
    s = bleReducer(s, seen("b", "Headphones"));
    expect(s.found.map((f) => f.serial)).toEqual(["1"]);
  });
  it("de-duplicates by serial and keeps the stronger signal", () => {
    let s = scanning();
    s = bleReducer(s, seen("a", "Tension#1", -80));
    s = bleReducer(s, seen("b", "Tension#1", -50));
    expect(s.found).toHaveLength(1);
    expect(s.found[0]).toMatchObject({ id: "b", rssi: -50 });
    s = bleReducer(s, seen("c", "Tension#1", -90));
    expect(s.found[0].id).toBe("b");
  });
  it("keeps boards without a serial separate by device id", () => {
    let s = scanning();
    s = bleReducer(s, seen("a", "Tension"));
    s = bleReducer(s, seen("b", "Tension"));
    expect(s.found).toHaveLength(2);
  });
  it("walks scanning -> connecting -> connected -> idle", () => {
    let s = scanning();
    s = bleReducer(s, seen("a", "Tension#1@3"));
    s = bleReducer(s, { type: "scan-stop" });
    expect(s.phase).toBe("idle");
    s = bleReducer({ ...s, phase: "scanning" }, { type: "connect", id: "a" });
    expect(s).toMatchObject({ phase: "connecting", target: { id: "a" } });
    s = bleReducer(s, { type: "connected" });
    expect(s.phase).toBe("connected");
    s = bleReducer(s, { type: "disconnected" });
    expect(s).toMatchObject({ phase: "idle", target: null });
  });
  it("connecting to an unknown device does nothing", () => {
    const s = scanning();
    expect(bleReducer(s, { type: "connect", id: "zzz" })).toBe(s);
  });
  it("a scan does not wipe a live connection", () => {
    const connected: BleState = { phase: "connected", found: [], target: { id: "a", name: "T", displayName: "T", serial: null, apiLevel: 3, rssi: null }, error: null };
    expect(bleReducer(connected, { type: "scan-start" })).toBe(connected);
  });
  it("failures end in the failed phase with the message", () => {
    expect(bleReducer(scanning(), { type: "scan-error", message: "Bluetooth is off" })).toMatchObject({ phase: "failed", error: "Bluetooth is off" });
    const s = bleReducer({ ...scanning(), phase: "connecting" }, { type: "connect-failed", message: "timed out" });
    expect(s).toMatchObject({ phase: "failed", error: "timed out", target: null });
  });
  it("found events outside a scan are ignored", () => {
    expect(bleReducer(INITIAL_BLE, seen("a", "Tension#1"))).toBe(INITIAL_BLE);
  });
});

describe("auto connect", () => {
  const found = [
    { id: "a", name: "T#1", displayName: "T", serial: "1", apiLevel: 3, rssi: -50 },
    { id: "b", name: "T#2", displayName: "T", serial: "2", apiLevel: 3, rssi: -70 },
    { id: "c", name: "T#3", displayName: "T", serial: "3", apiLevel: 3, rssi: -70 },
  ];
  const kits = [{ serial: "1", name: "Home", isAutoconnect: true }, { serial: "2", name: "Gym", isAutoconnect: true }, { serial: "3", name: null, isAutoconnect: false }];
  it("picks the newest discovery whose kit allows it", () => expect(pickAutoConnect(found, kits, true)?.id).toBe("b"));
  it("does nothing when the user turned Auto connect off or no kit allows it", () => {
    expect(pickAutoConnect(found, kits, false)).toBeNull();
    expect(pickAutoConnect(found, [{ serial: "1", name: null, isAutoconnect: false }], true)).toBeNull();
  });
  it("labels a board with its kit name, else its device name", () => {
    expect(boardLabel(found[0], kits)).toBe("Home");
    expect(boardLabel(found[2], kits)).toBe("T");
  });
});

describe("LedLink", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  it("writes a stream as 20-byte chunks in order", async () => {
    const out: number[][] = [];
    await new LedLink(async (c) => { out.push([...c]); }).display(Array.from({ length: 45 }, (_, i) => i));
    expect(out.map((c) => c.length)).toEqual([20, 20, 5]);
    expect(out.flat()).toEqual(Array.from({ length: 45 }, (_, i) => i));
  });
  it("never starts a second stream mid-way and keeps only the newest waiting request", async () => {
    const out: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const link = new LedLink(async (c) => { out.push(c[0]); if (first) { first = false; await gate; } });
    const p1 = link.display([1, 1, 1]);
    await tick();
    void link.display([2]); // replaced by the next call before it ever starts
    void link.display([3]);
    release();
    await p1;
    expect(out).toEqual([1, 3]);
    expect(link.sent).toBe(2);
  });
  it("rejects when a write fails and can be used again afterwards", async () => {
    let fail = true;
    const link = new LedLink(async () => { if (fail) throw new Error("gatt"); });
    await expect(link.display([1])).rejects.toThrow("gatt");
    fail = false;
    await expect(link.display([1])).resolves.toBeUndefined();
  });
});

describe("IdleTimer", () => {
  it("fires after the idle time and is pushed back by touch", () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const t = new IdleTimer(60, fired);
    t.touch();
    vi.advanceTimersByTime(59_000);
    t.touch();
    vi.advanceTimersByTime(59_000);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(fired).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("zero seconds never fires, and cancel stops it", () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    const off = new IdleTimer(0, fired);
    off.touch();
    const t = new IdleTimer(5, fired);
    t.touch();
    t.cancel();
    vi.advanceTimersByTime(60_000);
    expect(fired).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("nearby devices", () => {
  const dev = (id: string, rssi: number | null, name: string | null = null) => ({ id, name, rssi, services: [] as string[] });

  it("keeps the loudest first, refreshes a device instead of repeating it, and caps the list", () => {
    let l = mergeSeen([], dev("a", -80));
    l = mergeSeen(l, dev("b", -50, "B"));
    l = mergeSeen(l, dev("c", null));
    expect(l.map((d) => d.id)).toEqual(["b", "a", "c"]);
    l = mergeSeen(l, dev("a", -40, "A"));
    expect(l.map((d) => [d.id, d.name])).toEqual([["a", "A"], ["b", "B"], ["c", null]]);
    expect(mergeSeen(l, dev("z", -10), 3).map((d) => d.id)).toEqual(["z", "a", "b"]);
  });

  it("shortens a service uuid", () => {
    expect(shortUuid("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")).toBe("6e400001");
  });
});

describe("keeping the connection", () => {
  it("lets go after 20 minutes idle and tries a few times to get a dropped link back, with growing gaps", () => {
    expect(IDLE_DISCONNECT_SEC).toBe(1200);
    expect(RECONNECT_DELAYS_MS.length).toBeGreaterThanOrEqual(3);
    expect(RECONNECT_DELAYS_MS.every((d, i) => i === 0 || d > RECONNECT_DELAYS_MS[i - 1])).toBe(true);
  });

  it("the idle timer fires once after the idle time and not before, and a write pushes it back", () => {
    const fake = (() => { let t = 0; const jobs: { at: number; fn: () => void }[] = []; return {
      set: ((fn: () => void, ms: number) => { jobs.push({ at: t + ms, fn }); return jobs.length; }) as never,
      clear: ((h: number) => { jobs[h - 1] = { at: Infinity, fn: () => {} }; }) as never,
      advance: (ms: number) => { t += ms; for (const j of jobs) if (j.at <= t) { j.at = Infinity; j.fn(); } },
    }; })();
    let idle = 0;
    const timer = new IdleTimer(IDLE_DISCONNECT_SEC, () => idle++, fake);
    timer.touch();
    fake.advance(1199_000); expect(idle).toBe(0);
    timer.touch();
    fake.advance(1199_000); expect(idle).toBe(0);
    fake.advance(1_000); expect(idle).toBe(1);
  });
});
