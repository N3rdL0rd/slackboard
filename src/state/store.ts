import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_FILTER, type ClimbFilter } from "../core/filters";
import type { GradeDisplay } from "../core/grades";
import { DEFAULT_CONFIG, type TimerConfig } from "../core/timer";
import { migrateAccounts, type Accounts } from "../core/accounts";
import type { ProviderId } from "../core/provider";
import type { Board } from "../core/types";
import { DEFAULT_PROVIDER } from "../providers";
import { useData } from "./data";

export interface Settings {
  gradeDisplay: GradeDisplay;
  shapes: boolean;
  highContrast: boolean;
  autoConnect: boolean;
  autoDisconnectSec: number;
  /** Tell the server which climbs are lit on the board, for its Recently lit history. The official app always does. */
  logLit: boolean;
  /** Haptic feedback for swiping, the angle dial, sends, attempts and the timer. */
  haptics: boolean;
  /** Count gym and outdoor climbs in the stats (default on). */
  statsOffBoard?: boolean;
}

interface State {
  /** One signed-in account per provider. Tokens are kept in the keystore (state/session.ts). */
  accounts: Accounts;
  /** Which board is open (a wall uuid). Null until the user has one. */
  boardId: string | null;
  /** Viewed angle per board. The board's own angle applies until the user picks another. */
  angles: Record<string, number>;
  /** When each board was last opened (ms), to list recent boards first. */
  boardUsed: Record<string, number>;
  filters: Record<string, ClimbFilter>;
  settings: Settings;
  /** The training timer's last interval setup and rest length, remembered between sessions. */
  timer: TimerConfig;
  restSec: number;
  randomSeed: number;
  /** Newest activity event the user has looked at (`created_at`), for the unread badge. */
  activitySeen: string;
  /** A link the user opened while signed out; opened after sign-in. */
  pendingLink: string | null;
  signIn: (provider: ProviderId, username: string, userId: number) => void;
  /** Removes one provider's account; boards and cross-board data stay. */
  signOut: (provider: ProviderId) => void;
  setAngle: (angle: number) => void;
  /** Records the board the app is already showing as the chosen one, without counting it as used. */
  adoptBoard: (boardId: string) => void;
  setBoard: (id: string) => void;
  setFilter: (f: ClimbFilter) => void;
  patchSettings: (p: Partial<Settings>) => void;
  setTimer: (t: TimerConfig) => void;
  setRestSec: (s: number) => void;
  markActivitySeen: (createdAt: string) => void;
  setPendingLink: (url: string | null) => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      accounts: {},
      boardId: null,
      angles: {},
      boardUsed: {},
      filters: {},
      settings: { gradeDisplay: "both", shapes: false, highContrast: false, autoConnect: true, autoDisconnectSec: 60, logLit: true, haptics: true },
      timer: DEFAULT_CONFIG,
      restSec: 120,
      randomSeed: 1,
      activitySeen: "",
      pendingLink: null,
      signIn: (provider, username, userId) => set((s) => ({ accounts: { ...s.accounts, [provider]: { userId, username } } })),
      signOut: (provider) => set((s) => { const { [provider]: _gone, ...rest } = s.accounts; return { accounts: rest, ...(Object.keys(rest).length ? {} : { boardId: null, angles: {}, boardUsed: {}, filters: {}, activitySeen: "" }) }; }),
      setAngle: (angle) => {
        const id = get().boardId;
        if (id) set((s) => ({ angles: { ...s.angles, [id]: angle } }));
      },
      adoptBoard: (boardId) => set({ boardId }),
      setBoard: (boardId) => set((s) => ({ boardId, boardUsed: { ...s.boardUsed, [boardId]: Date.now() } })),
      setFilter: (f) => {
        const id = get().boardId;
        if (id) set((s) => ({ filters: { ...s.filters, [id]: f }, randomSeed: f.sort === "random" ? (Math.random() * 1e9) | 0 : s.randomSeed }));
      },
      setTimer: (timer) => set({ timer }),
      setRestSec: (restSec) => set({ restSec }),
      patchSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      markActivitySeen: (createdAt) => set((s) => (createdAt > s.activitySeen ? { activitySeen: createdAt } : s)),
      setPendingLink: (pendingLink) => set({ pendingLink }),
    }),
    {
      name: "slackboard-v2", storage: createJSONStorage(() => AsyncStorage), version: 1,
      // Version 0 held a single signed-in user; it becomes the first provider's account.
      migrate: (old) => ({ ...(old as object), accounts: migrateAccounts(old as Parameters<typeof migrateAccounts>[0], DEFAULT_PROVIDER.id) }) as never,
    },
  ),
);

/** The open board, with the viewed angle applied. Falls back to the first board when the saved one is gone. */
export function useBoard(): Board | null {
  const boards = useData((d) => d.boards);
  const boardId = useStore((s) => s.boardId);
  const angles = useStore((s) => s.angles);
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  if (!board) return null;
  const angle = angles[board.id] ?? board.angle;
  return angle === board.angle ? board : { ...board, angle };
}

const mergedFilters = new WeakMap<object, ClimbFilter>();
/** Stored filters from older builds may lack newer fields; fill from defaults (cached so selectors stay stable). */
export const useFilter = (): ClimbFilter =>
  useStore((s) => {
    const stored = s.boardId ? s.filters[s.boardId] : undefined;
    if (!stored) return DEFAULT_FILTER;
    let m = mergedFilters.get(stored);
    if (!m) mergedFilters.set(stored, (m = migrateFilter({ ...DEFAULT_FILTER, ...stored })));
    return m;
  });

/** Filters saved by older builds used a single "progress" choice; turn it into the logbook toggles. */
function migrateFilter(f: ClimbFilter & { progress?: string }): ClimbFilter {
  const { progress, ...rest } = f;
  if (!progress || progress === "any") return rest;
  return { ...rest, showSent: progress === "sent", showTried: progress === "tried", showUntried: progress === "untried" };
}
