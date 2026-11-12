import { chunk } from "./led";
import type { ProviderBle } from "./provider";

/** What a controller's advertised name tells us. Each provider parses its own name format. */
export interface DeviceName {
  displayName: string;
  serial: string | null;
  apiLevel: number;
}

/** The official apps give up on a connection that is not fully set up after this long. */
export const CONNECT_TIMEOUT_MS = 8000;
/** The official apps stop scanning after ten minutes. */
export const SCAN_MAX_MS = 600_000;

export function isBoardName(name: string | null | undefined, ble: Pick<ProviderBle, "nameSubstring" | "ignoreCase">): name is string {
  if (!name) return false;
  return ble.ignoreCase ? name.toLowerCase().includes(ble.nameSubstring.toLowerCase()) : name.includes(ble.nameSubstring);
}

/** Everything a scan hears, for the "show every nearby device" view: enough to recognise a board whose name we did not expect. */
export interface SeenDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  /** Service UUIDs in the advertisement, lower case. */
  services: string[];
}

/** Adds or refreshes a device: loudest first (unknown signal last), at most `cap` kept. */
export function mergeSeen(list: SeenDevice[], d: SeenDevice, cap = 80): SeenDevice[] {
  const next = [d, ...list.filter((x) => x.id !== d.id)];
  next.sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
  return next.slice(0, cap);
}

/** "6e400001-b5a3-..." to "6e400001": enough to tell services apart on a small screen. */
export const shortUuid = (u: string): string => u.toLowerCase().split("-")[0];

/** Turns a scan result into a "found" event, or null when it is not one of this provider's boards. */
export function foundEvent(device: { id: string; name: string | null; rssi: number | null }, ble: ProviderBle): BleEvent | null {
  if (!isBoardName(device.name, ble)) return null;
  return { type: "found", device: { id: device.id, name: device.name, rssi: device.rssi }, parsed: ble.parseName(device.name) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Discovery and connection state

export interface FoundBoard {
  /** The platform's device id (a MAC address on Android, a UUID on iOS). */
  id: string;
  name: string;
  displayName: string;
  serial: string | null;
  apiLevel: number;
  rssi: number | null;
}

export type Phase = "idle" | "scanning" | "connecting" | "connected" | "failed";

export interface BleState {
  phase: Phase;
  found: FoundBoard[];
  /** The board being connected or connected to. */
  target: FoundBoard | null;
  error: string | null;
}

export const INITIAL_BLE: BleState = { phase: "idle", found: [], target: null, error: null };

export type BleEvent =
  | { type: "scan-start" }
  | { type: "scan-stop" }
  | { type: "scan-error"; message: string }
  | { type: "found"; device: { id: string; name: string; rssi: number | null }; parsed: DeviceName }
  | { type: "connect"; id: string }
  | { type: "connected" }
  | { type: "connect-failed"; message: string }
  | { type: "disconnected" }
  | { type: "reset" };

/**
 * Boards found are de-duplicated by serial number (the same board can advertise under a changing device id), keeping the
 * strongest signal; devices without a serial are kept by id.
 */
function addFound(found: FoundBoard[], d: { id: string; name: string; rssi: number | null }, parsed: DeviceName): FoundBoard[] {
  const next: FoundBoard = { id: d.id, name: d.name, ...parsed, rssi: d.rssi };
  const i = found.findIndex((f) => (parsed.serial ? f.serial === parsed.serial : f.id === d.id));
  if (i < 0) return [...found, next];
  const old = found[i];
  const keep = (next.rssi ?? -999) > (old.rssi ?? -999) ? next : { ...old, rssi: old.rssi };
  return found.map((f, k) => (k === i ? keep : f));
}

export function bleReducer(s: BleState, e: BleEvent): BleState {
  switch (e.type) {
    case "scan-start":
      // Connected or connecting stays so; only an idle or failed link starts a new list.
      return s.phase === "connecting" || s.phase === "connected" ? s : { phase: "scanning", found: [], target: null, error: null };
    case "scan-stop":
      return s.phase === "scanning" ? { ...s, phase: "idle" } : s;
    case "scan-error":
      return { phase: "failed", found: s.found, target: null, error: e.message };
    case "found":
      return s.phase === "scanning" ? { ...s, found: addFound(s.found, e.device, e.parsed) } : s;
    case "connect": {
      const target = s.found.find((f) => f.id === e.id) ?? (s.target?.id === e.id ? s.target : null);
      return target ? { phase: "connecting", found: s.found, target, error: null } : s;
    }
    case "connected":
      return s.phase === "connecting" ? { ...s, phase: "connected" } : s;
    case "connect-failed":
      return { phase: "failed", found: s.found, target: null, error: e.message };
    case "disconnected":
      return s.phase === "connected" || s.phase === "connecting" ? { phase: "idle", found: s.found, target: null, error: null } : s;
    case "reset":
      return INITIAL_BLE;
  }
}

export interface Kit {
  serial: string;
  name: string | null;
  isAutoconnect: boolean;
}

/**
 * The board to connect to without asking: the most recently found one whose kit has auto connect on, when the user's own
 * Auto connect setting is on. The official app clicks the newest discovery when nothing is selected.
 */
export function pickAutoConnect(found: FoundBoard[], kits: Kit[], enabled: boolean): FoundBoard | null {
  if (!enabled) return null;
  const auto = new Set(kits.filter((k) => k.isAutoconnect).map((k) => k.serial));
  for (let i = found.length - 1; i >= 0; i--) if (found[i].serial && auto.has(found[i].serial!)) return found[i];
  return null;
}

/** What to call a board in the list: the kit's name when the server knows it, else the device's own name. */
export function boardLabel(f: FoundBoard, kits: Kit[]): string {
  return kits.find((k) => k.serial === f.serial)?.name || f.displayName;
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing

/**
 * Sends packet streams to the controller one chunk at a time. A stream is never interrupted once started, because the
 * controller reassembles one byte stream. While one is being written, only the newest request waiting behind it is kept, so
 * flicking through climbs shows where you stopped rather than every climb on the way.
 */
export class LedLink {
  private pending: number[] | null = null;
  private running: Promise<void> | null = null;
  /** Streams fully written. */
  sent = 0;

  constructor(private readonly writeChunk: (chunk: Uint8Array) => Promise<void>, private readonly onWritten?: () => void) {}

  /** Resolves when this stream, or a newer one that replaced it, has been written. Rejects if a write fails. */
  display(bytes: number[]): Promise<void> {
    this.pending = bytes;
    this.running ??= this.drain().finally(() => { this.running = null; });
    return this.running;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const bytes = this.pending;
      this.pending = null;
      for (const c of chunk(bytes)) await this.writeChunk(c);
      this.sent++;
      this.onWritten?.();
    }
  }
}

/** Fires `onIdle` when `touch()` has not been called for `seconds`. Zero seconds means never. */
export class IdleTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  constructor(private seconds: number, private readonly onIdle: () => void, private readonly timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout }) {}
  setSeconds(seconds: number) { this.seconds = seconds; if (this.handle) this.touch(); }
  touch() {
    this.cancel();
    if (this.seconds > 0) this.handle = this.timers.set(() => { this.handle = null; this.onIdle(); }, this.seconds * 1000);
  }
  cancel() { if (this.handle) { this.timers.clear(this.handle); this.handle = null; } }
}
