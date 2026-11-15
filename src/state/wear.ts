import { create } from "zustand";
import Wear from "../../modules/slackboard-wear";
import { randomHex } from "../core/api";
import { parseInbox, type WatchMessage } from "../core/wear";

/**
 * The link to the Wear OS watch app. Android only: elsewhere there is no native module and every
 * call answers "no watch".
 *
 * Heart-rate samples are counted here but not kept yet; storing them comes with the attempt windows.
 */
interface WearState {
  available: boolean;
  /** Null until checked. */
  reachable: boolean | null;
  running: boolean;
  bpm: number | null;
  /** Samples received since the app started. */
  received: number;
  note: string;
  check: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  drain: () => Promise<void>;
}

const apply = (s: WearState, m: WatchMessage): Partial<WearState> => {
  switch (m.kind) {
    case "state":
      return { running: m.state === "running", bpm: m.state === "running" ? (m.bpm ?? s.bpm) : null, note: m.error ?? "" };
    case "hr": {
      const last = m.samples[m.samples.length - 1];
      return { received: s.received + m.samples.length, bpm: last ? last.bpm : s.bpm };
    }
    case "summary":
      return {};
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useWear = create<WearState>((set, get) => ({
  available: Wear != null,
  reachable: null,
  running: false,
  bpm: null,
  received: 0,
  note: "",

  async drain() {
    if (!Wear) return;
    const { messages } = parseInbox(await Wear.drainInbox());
    for (const m of messages) set((s) => ({ ...s, ...apply(s, m) }));
  },

  async check() {
    if (!Wear) return set({ reachable: false });
    const reachable = await Wear.isWatchReachable();
    set({ reachable, note: "" });
    if (!reachable) return;
    // The watch answers a ping with its state; give it a moment.
    await Wear.ping();
    await wait(2500);
    await get().drain();
  },

  async start() {
    if (!Wear) return;
    const ok = await Wear.startSession(randomHex(16));
    set({ note: ok ? "" : "The watch could not be reached." });
    await wait(2500);
    await get().drain();
  },

  async stop() {
    if (!Wear) return;
    const ok = await Wear.stopSession();
    set({ note: ok ? "" : "The watch could not be reached." });
    await wait(2500);
    await get().drain();
  },
}));
