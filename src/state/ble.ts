import { AppState, PermissionsAndroid, Platform } from "react-native";
import type { BleManager, Device, Subscription } from "react-native-ble-plx";
import { create } from "zustand";
import { toBase64 } from "../core/base64";
import { bleReducer, CONNECT_TIMEOUT_MS, IDLE_DISCONNECT_SEC, RECONNECT_DELAYS_MS, foundEvent, IdleTimer, INITIAL_BLE, LedLink, mergeSeen, pickAutoConnect, shortUuid, type SeenDevice, SCAN_MAX_MS, type BleEvent, type BleState, type Kit } from "../core/ble";
import type { LitHold } from "../core/led";
import type { ProviderBle } from "../core/provider";
import * as repo from "../core/repo";
import type { Board } from "../core/types";
import { getDb } from "../data/sqlite";
import { getProvider } from "../providers";
import { recordLitLocal } from "./litHistory";
import { recordLit } from "./serverSends";
import { useStore } from "./store";

/** Which board the link was opened for: the climbs it can show must use the same layout and LED positions. */
export interface LinkMatch {
  provider: string;
  layoutId: number;
  productSizeId: number;
}

export interface SendStats { ok: number; failed: number; lastBytes: number; lastError: string | null; lastAt: number | null }
const NO_SENDS: SendStats = { ok: 0, failed: 0, lastBytes: 0, lastError: null, lastAt: null };

interface BleStore extends BleState {
  /** Why Bluetooth cannot be used at all here (no native module, as in Expo Go or on the web), or null. */
  unavailable: string | null;
  match: LinkMatch | null;
  kits: Kit[];
  /** Every device heard while "show every nearby device" is on. */
  nearby: SeenDevice[];
  showAll: boolean;
  /** What happened to the packets sent to the board, so a connection that looks fine but lights nothing can be told apart. */
  sends: SendStats;
  startScan: (board: Board | null, everything?: boolean) => Promise<void>;
  stopScan: () => void;
  /** `auto` is for the app's own reconnect after a dropped link; a user action leaves it out and so cancels any reconnect in progress. */
  connect: (id: string, board: Board | null, auto?: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
}

let manager: BleManager | null = null;
let device: Device | null = null;
let link: LedLink | null = null;
let dropSub: Subscription | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let lastBoard: Board | null = null;
/** The controller family of the board the link was opened for. */
let bleSpec: ProviderBle | null = null;
const bleOf = (board: Board | null): ProviderBle | null => (board ? getProvider(board.spec.provider).ble : null);
// Letting go after a long idle is the only automatic disconnect; everything else is the user asking.
const idle = new IdleTimer(IDLE_DISCONNECT_SEC, () => void useBle.getState().disconnect());

/** The board the link was lost to without the user asking, while the app is still trying to get it back. */
let lastDrop: { id: string; board: Board | null } | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getManager(): BleManager | null {
  if (manager) return manager;
  try {
    // Loaded on demand: the native module is missing in Expo Go and on the web, and importing it there would throw.
    const { BleManager: M } = require("react-native-ble-plx") as typeof import("react-native-ble-plx");
    manager = new M();
  } catch { manager = null; }
  return manager;
}

/** Returns a message when the permissions Bluetooth scanning needs are refused. */
async function ensurePermissions(): Promise<string | null> {
  if (Platform.OS !== "android") return null; // iOS asks the first time the manager is used
  const wanted = (Platform.Version as number) >= 31
    ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED)
    ? null
    : "Bluetooth permission was refused. Allow it for Slackboard in your phone's app settings.";
}

const ADAPTER_MESSAGES: Record<string, string> = {
  PoweredOff: "Bluetooth is turned off. Turn it on and try again.",
  Unauthorized: "Slackboard isn't allowed to use Bluetooth. Allow it in your phone's settings.",
  Unsupported: "This device doesn't support Bluetooth Low Energy.",
};

export const useBle = create<BleStore>((set, get) => {
  const dispatch = (e: BleEvent) => set((s) => ({ ...bleReducer(s, e) }));

  const stopScan = () => {
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
    void manager?.stopDeviceScan();
    dispatch({ type: "scan-stop" });
  };

  const cancelReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    lastDrop = null;
  };

  /** Tries to get a dropped link back, a few times with growing gaps. Anything the user does in the meantime stops it. */
  const tryReconnect = (attempt: number) => {
    if (!lastDrop || attempt >= RECONNECT_DELAYS_MS.length) { reconnectTimer = null; return; }
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      const drop = lastDrop;
      const phase = get().phase;
      if (!drop || (phase !== "idle" && phase !== "failed")) return;
      await get().connect(drop.id, drop.board, true);
      if (get().phase === "connected") lastDrop = null; else tryReconnect(attempt + 1);
    }, RECONNECT_DELAYS_MS[attempt]);
  };
  // When the phone wakes, a link that was lost while it slept is tried again at once.
  AppState.addEventListener("change", (s) => {
    if (s === "active" && lastDrop && !reconnectTimer && (get().phase === "idle" || get().phase === "failed")) tryReconnect(0);
  });

  const cleanUp = () => {
    idle.cancel();
    dropSub?.remove(); dropSub = null;
    link = null;
    device = null;
    set({ match: null });
  };

  return {
    ...INITIAL_BLE,
    unavailable: null,
    match: null,
    kits: [],
    nearby: [],
    showAll: false,
    sends: NO_SENDS,

    async startScan(board, everything = false) {
      cancelReconnect();
      lastBoard = board;
      bleSpec = bleOf(board);
      const m = getManager();
      if (!bleSpec) { set({ ...INITIAL_BLE, phase: "failed", error: "This board can't be lit over Bluetooth." }); return; }
      if (!m) { set({ ...INITIAL_BLE, phase: "failed", error: "Bluetooth needs the installed Slackboard app. It isn't available in Expo Go or the browser.", unavailable: "native module missing" }); return; }
      set({ unavailable: null });
      const denied = await ensurePermissions();
      if (denied) { dispatch({ type: "scan-error", message: denied }); return; }
      const adapter = await m.state();
      if (adapter !== "PoweredOn") { dispatch({ type: "scan-error", message: ADAPTER_MESSAGES[adapter] ?? "Bluetooth isn't ready yet. Try again in a moment." }); return; }
      set({ kits: await repo.loadKits(await getDb(board?.spec.provider)).catch(() => []) });
      dispatch({ type: "scan-start" });
      set({ nearby: [], showAll: everything });
      if (get().phase !== "scanning") return; // already connected or connecting
      scanTimer = setTimeout(stopScan, SCAN_MAX_MS);
      const spec = bleSpec;
      void m.startDeviceScan(everything ? null : [spec.scanService], { allowDuplicates: false }, (error, d) => {
        if (error) { stopScan(); dispatch({ type: "scan-error", message: error.message || "Scanning failed." }); return; }
        if (!d) return;
        const name = d.localName ?? d.name;
        const services = (d.serviceUUIDs ?? []).map((u) => u.toLowerCase());
        if (everything) set((s) => ({ nearby: mergeSeen(s.nearby, { id: d.id, name, rssi: d.rssi, services }) }));
        // A board is recognised by its name, or by advertising the service the app scans for under a name we did not expect.
        const ev = foundEvent({ id: d.id, name, rssi: d.rssi }, spec) ??
          (services.includes(spec.scanService.toLowerCase())
            ? ({ type: "found", device: { id: d.id, name: name ?? "Unnamed board", rssi: d.rssi }, parsed: spec.parseName(name ?? "Unnamed board") } as const)
            : null);
        if (ev) dispatch(ev);
        const auto = pickAutoConnect(get().found, get().kits, useStore.getState().settings.autoConnect);
        if (auto && get().phase === "scanning") void get().connect(auto.id, lastBoard);
      });
    },

    stopScan,

    async connect(id, board, auto = false) {
      if (!auto) cancelReconnect();
      const m = getManager();
      if (!m) return;
      lastBoard = board;
      bleSpec = bleOf(board) ?? bleSpec;
      const spec = bleSpec;
      if (!spec) return;
      stopScan();
      // A device picked from the "every nearby device" list is not a recognised board yet: add it so the connection has a target.
      if (!get().found.some((f) => f.id === id)) {
        const seen = get().nearby.find((n) => n.id === id);
        const label = seen?.name ?? "Unnamed device";
        dispatch({ type: "found", device: { id, name: label, rssi: seen?.rssi ?? null }, parsed: spec.parseName(label) });
      }
      set({ sends: NO_SENDS });
      dispatch({ type: "connect", id });
      const target = get().target;
      if (!target || get().phase !== "connecting") return;
      try {
        const d = await m.connectToDevice(id, { timeout: CONNECT_TIMEOUT_MS });
        await d.discoverAllServicesAndCharacteristics();
        const chars = await d.characteristicsForService(spec.uartService).catch(() => []);
        if (!chars.some((c) => c.uuid.toLowerCase() === spec.uartRx)) {
          const has = (await d.services().catch(() => [])).map((x) => shortUuid(x.uuid)).filter((u) => !["00001800", "00001801"].includes(u));
          throw new Error(`This device doesn't have the controller's UART service (${shortUuid(spec.uartService)}). Services it has: ${has.length ? has.join(", ") : "none"}.`);
        }
        device = d;
        link = new LedLink(
          async (c) => { await d.writeCharacteristicWithResponseForService(spec.uartService, spec.uartRx, toBase64(c)); },
          () => idle.touch(),
        );
        // Reaching here means the link was lost (our own disconnect removes this listener first), so get it back.
        dropSub = m.onDeviceDisconnected(id, () => { cleanUp(); dispatch({ type: "disconnected" }); lastDrop = { id, board: lastBoard }; tryReconnect(0); });
        set({ match: board ? { provider: board.spec.provider, layoutId: board.spec.layoutId, productSizeId: board.spec.productSizeId } : null });
        dispatch({ type: "connected" });
        idle.touch();
      } catch (e) {
        void m.cancelDeviceConnection(id).catch(() => {});
        cleanUp();
        dispatch({ type: "connect-failed", message: e instanceof Error && e.message ? e.message : "Couldn't connect to the board." });
      }
    },

    async disconnect() {
      cancelReconnect();
      const d = device;
      cleanUp();
      dispatch({ type: "disconnected" });
      if (d) await manager?.cancelDeviceConnection(d.id).catch(() => {});
    },
  };
});

/** Whether the connected controller can show climbs of this board. */
export function linkMatches(board: Board | null): boolean {
  const { phase, match } = useBle.getState();
  return phase === "connected" && !!board && !!match && match.provider === board.spec.provider && match.layoutId === board.spec.layoutId && match.productSizeId === board.spec.productSizeId;
}

/**
 * Shows these holes on the board. Returns false when there is no link, or the link was opened for a different board. A
 * failed write drops the connection state like the official app does when the controller goes away.
 */
export async function lightBoard(holes: LitHold[], board: Board | null, climbUuid?: string): Promise<boolean> {
  const { phase, target } = useBle.getState();
  if (phase !== "connected" || !target || !link || !linkMatches(board)) return false;
  idle.touch();
  const bytes = bleOf(board)!.encode(holes, target.apiLevel);
  try {
    await link.display(bytes);
    useBle.setState((s) => ({ sends: { ...s.sends, ok: s.sends.ok + 1, lastBytes: bytes.length, lastError: null, lastAt: Date.now() } }));
  } catch (e) {
    useBle.setState((s) => ({ sends: { ...s.sends, failed: s.sends.failed + 1, lastBytes: bytes.length, lastError: e instanceof Error && e.message ? e.message : "The write failed.", lastAt: Date.now() } }));
    return false;
  }
  if (climbUuid && board) recordLitLocal(board, climbUuid);
  if (climbUuid && board && getProvider(board.spec.provider).capabilities.litHistory) recordLit(climbUuid, target.serial ?? board.serial ?? null);
  return true;
}

/** Blanks the board. */
export const clearBoard = (board: Board | null) => lightBoard([], board);
