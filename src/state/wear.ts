import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";
import Wear from "../../modules/slackboard-wear";
import { randomHex } from "../core/api";
import { ingestWatchMessages } from "../core/watchLocal";
import { parseInbox, type ElevationSample, type MotionRow, type WatchCapabilities, type WatchMessage, type WorkoutStats } from "../core/wear";
import { getLocalDb } from "../data/sqlite";
import { handleRemoteLines } from "./remote";

/**
 * The link to the Wear OS watch app. Android only: elsewhere there is no native module and every call answers "no watch".
 *
 * Everything the watch sends is stored in the local database as it arrives (see core/watchLocal.ts) and also reflected here, so the
 * developer screens can show what is happening live. Nothing in the app's normal screens reads either.
 */
interface Live {
  /** The latest reading of each stream, and when it was taken (the watch's clock). */
  bpm: number | null;
  bpmAt: number | null;
  elevation: ElevationSample | null;
  motion: MotionRow | null;
  /** The session being recorded, and when the last message about it arrived on this phone. */
  session: string | null;
  lastMessageAt: number | null;
}

interface WearState {
  available: boolean;
  /** Null until checked. */
  reachable: boolean | null;
  running: boolean;
  bpm: number | null;
  /** Samples received since the app started. */
  received: number;
  motionRows: number;
  elevationSamples: number;
  /** Messages and values refused as impossible since the app started. */
  rejected: number;
  /** The latest totals from the watch's workout. */
  stats: WorkoutStats | null;
  live: Live;
  /** Arrival times of the most recent messages, for working out a message rate. */
  arrivals: number[];
  /** Goes up every time new data is stored, so a screen showing stored data knows to load it again. */
  dataVersion: number;
  /** The last report of what the watch supports, if it has sent one since the app started. */
  capabilities: WatchCapabilities | null;
  /** True while waiting for the watch to answer. */
  asking: boolean;
  note: string;
  check: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  askCapabilities: () => Promise<void>;
  drain: () => Promise<void>;
}

const NO_LIVE: Live = { bpm: null, bpmAt: null, elevation: null, motion: null, session: null, lastMessageAt: null };
const MAX_ARRIVALS = 120;

const apply = (s: WearState, m: WatchMessage, receivedAt: number): Partial<WearState> => {
  const live = { ...s.live, lastMessageAt: receivedAt || s.live.lastMessageAt };
  switch (m.kind) {
    case "state":
      if (m.pong) return { running: m.state === "running", note: m.error ?? "" };
      return { running: m.state === "running", bpm: m.state === "running" ? (m.bpm ?? s.bpm) : null, note: m.error ?? "", live: { ...live, session: m.state === "running" ? m.session : null } };
    case "hr": {
      const last = m.samples[m.samples.length - 1];
      return { received: s.received + m.samples.length, rejected: s.rejected + m.dropped, bpm: last ? last.bpm : s.bpm, live: last ? { ...live, bpm: last.bpm, bpmAt: last.at, session: m.session } : live };
    }
    case "summary":
      return { stats: { calories: m.calories, gain: m.gain, hrAvg: m.hrAvg, hrMin: m.hrMin, hrMax: m.hrMax } };
    case "stats":
      return { stats: m.stats };
    case "motion": {
      const last = m.rows[m.rows.length - 1];
      return { motionRows: s.motionRows + m.rows.length, rejected: s.rejected + m.dropped, live: last ? { ...live, motion: last } : live };
    }
    case "elevation": {
      const last = m.samples[m.samples.length - 1];
      return { elevationSamples: s.elevationSamples + m.samples.length, rejected: s.rejected + m.dropped, live: last ? { ...live, elevation: last } : live };
    }
    case "capabilities":
      return { capabilities: m.capabilities };
  }
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Draining is one at a time: two overlapping reads would interleave their writes.
let chain: Promise<unknown> = Promise.resolve();

export const useWear = create<WearState>((set, get) => ({
  available: Wear != null,
  reachable: null,
  running: false,
  bpm: null,
  received: 0,
  motionRows: 0,
  elevationSamples: 0,
  rejected: 0,
  stats: null,
  live: NO_LIVE,
  arrivals: [],
  dataVersion: 0,
  capabilities: null,
  asking: false,
  note: "",

  drain() {
    const run = async () => {
      if (!Wear) return;
      const waiting = await Wear.drainInbox();
      // Remote commands are acted on straight away; what is left is the recorder's data.
      const lines = await handleRemoteLines(waiting);
      if (lines.length === 0) return;
      const { messages, receivedAt, skipped } = parseInbox(lines);
      const result = await ingestWatchMessages(await getLocalDb(), messages.map((message, i) => ({ message, receivedAt: receivedAt[i] })));
      set((s) => {
        let next: WearState = { ...s, rejected: s.rejected + skipped };
        messages.forEach((m, i) => { next = { ...next, ...apply(next, m, receivedAt[i]) }; });
        const arrivals = [...s.arrivals, ...receivedAt.filter((t) => t > 0)].slice(-MAX_ARRIVALS);
        return { ...next, arrivals, dataVersion: result.hr + result.elevation + result.motion + result.sessions > 0 ? s.dataVersion + 1 : s.dataVersion };
      });
    };
    chain = chain.then(run, run);
    return chain as Promise<void>;
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

  async askCapabilities() {
    if (!Wear) return;
    set({ capabilities: null, asking: true, note: "Asking the watch..." });
    const ok = await Wear.requestCapabilities();
    if (!ok) return set({ asking: false, note: "The watch could not be reached." });
    // The watch reads its sensors and Health Services before it answers.
    for (let i = 0; i < 8 && get().capabilities === null; i++) {
      await wait(1500);
      await get().drain();
    }
    set({
      asking: false,
      note: get().capabilities ? "" : "The watch did not answer. It may still be running an older build of the watch app that cannot report this; install the newest one on the watch and try again.",
    });
  },

  async stop() {
    if (!Wear) return;
    const ok = await Wear.stopSession();
    set({ note: ok ? "" : "The watch could not be reached." });
    await wait(2500);
    await get().drain();
  },
}));

/**
 * Keeps the watch's data flowing into the phone: reads what is waiting when the app starts and whenever it comes to the front, and as
 * soon as the native side says something arrived. Mounted once, at the root.
 */
export function useWatchSync(): void {
  useEffect(() => {
    if (!Wear) return;
    void useWear.getState().drain();
    const sub = Wear.addListener("onWatchMessage", () => void useWear.getState().drain());
    const app = AppState.addEventListener("change", (s) => { if (s === "active") void useWear.getState().drain(); });
    return () => { sub.remove(); app.remove(); };
  }, []);
}
