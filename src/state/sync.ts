import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProviderId } from "../core/provider";
import { SyncError, getMeta, setMeta, syncAll, type SyncOptions, type SyncProgress } from "../core/sync";
import { getDb } from "../data/sqlite";
import { flushNow, refreshOutboxCount } from "./outbox";
import { loadTokens, sessionFor } from "./session";
import { useStore } from "./store";

export { pendingProvider, settingUpProviders } from "../core/syncState";

export const INITIAL_KEY = "initial_sync_complete";

/** How one provider's sync stands. Each provider syncs on its own, so one being slow or signed out never holds up another. */
export interface ProviderSync {
  /** null until the database has been checked. */
  initialDone: boolean | null;
  running: boolean;
  progress: SyncProgress | null;
  error: string | null;
  /** True when the server rejected the session; the user must sign in again. */
  expired: boolean;
  lastAt: number;
}

export const IDLE_SYNC: ProviderSync = { initialDone: null, running: false, progress: null, error: null, expired: false, lastAt: 0 };

export interface SyncRunOptions {
  /** Passed to every provider. Deadline expiry is a normal pause, not an error. */
  deadlineMs?: number;
}

interface SyncState {
  by: Record<ProviderId, ProviderSync>;
  /** First downloads the user chose to leave running away from the sync screen. */
  deferred: Record<ProviderId, boolean>;
  /** Bumped after every sync that changed a local database, so screens can reload. */
  version: number;
  /** Loads persisted accounts/deferrals and keystore sessions in foreground or headless contexts. */
  boot: () => Promise<void>;
  /** Looks up which providers have finished their first download. */
  checkInitial: () => Promise<void>;
  /** Syncs one provider, or every signed-in provider when none is named. */
  syncNow: (provider?: ProviderId, options?: SyncRunOptions) => Promise<void>;
  /** Lets an unfinished provider's first download continue without forcing the sync screen. */
  defer: (provider: ProviderId) => void;
  /** After signing in again, the provider's session is good. */
  clearExpired: (provider: ProviderId) => void;
  /** Forgets a provider's state, e.g. after signing out of it. */
  forget: (provider: ProviderId) => void;
}

/** Active provider runs can be cancelled by sign-out; the next run resumes from committed pages. */
const cancellations = new Map<ProviderId, () => void>();
let booting: Promise<void> | null = null;
async function hydrateStores() {
  if (!useStore.persist.hasHydrated()) await useStore.persist.rehydrate();
  if (!useSync.persist.hasHydrated()) await useSync.persist.rehydrate();
}

export const useSync = create<SyncState>()(
  persist(
    (set, get) => {
      const patch = (p: ProviderId, v: Partial<ProviderSync>) => set((s) => ({ by: { ...s.by, [p]: { ...(s.by[p] ?? IDLE_SYNC), ...v } } }));
      const finish = (provider: ProviderId, values: Partial<ProviderSync>) => {
        set((s) => {
          const { [provider]: _deferred, ...deferred } = s.deferred;
          return { by: { ...s.by, [provider]: { ...(s.by[provider] ?? IDLE_SYNC), ...values } }, deferred };
        });
      };

      async function syncOne(provider: ProviderId, options: SyncRunOptions) {
        if (get().by[provider]?.running) return;
        const session = sessionFor(provider);
        if (!session) return;
        patch(provider, { initialDone: get().by[provider]?.initialDone ?? false, running: true, error: null, expired: false, progress: null });
        const signal = { aborted: false };
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let firstDone = false;
        try {
          const db = await getDb(provider);
          const controller = new AbortController();
          const cancel = () => { signal.aborted = true; controller.abort(); };
          cancellations.set(provider, cancel);
          timeout = options.deadlineMs == null ? undefined : setTimeout(() => controller.abort(), options.deadlineMs);
          const deadlineFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: controller.signal });
          // Upload what was saved while offline first, so the download that follows already includes it.
          const flushed = await flushNow(provider, deadlineFetch);
          const opts: SyncOptions = {
            deadlineMs: options.deadlineMs, fetch: deadlineFetch, signal,
            onProgress: (progress) => { if (!signal.aborted) patch(provider, { progress }); },
          };
          const res = await syncAll(db, session, opts);
          if (signal.aborted) return;
          if (controller.signal.aborted) res.more = true;
          const now = Date.now();
          if (res.more) {
            patch(provider, { running: false, lastAt: now, progress: res });
          } else {
            // The first full sync of an install flips this flag, which loadAll reads.
            firstDone = !get().by[provider]?.initialDone;
            await setMeta(db, INITIAL_KEY, "1");
            finish(provider, { initialDone: true, running: false, lastAt: now, progress: res });
          }
          await refreshOutboxCount();
          // A sync that brought nothing and uploaded nothing leaves every in-memory view as it was: reloading them would only repaint a 14k-row list.
          const changed = firstDone || Object.values(res.totals ?? {}).some((n) => n > 0) || !!flushed && (flushed.sent.length > 0 || flushed.rejected.length > 0);
          if (changed) set((s) => ({ version: s.version + 1 }));
        } catch (e) {
          if (signal.aborted) return;
          const expired = e instanceof SyncError && (e.status === 401 || e.status === 404);
          patch(provider, { running: false, expired, error: expired ? "Your session has expired. Sign in again." : (e as Error).message });
        } finally {
          cancellations.delete(provider);
          clearTimeout(timeout);
        }
      }

      return {
        by: {},
        deferred: {},
        version: 0,
        async boot() {
          booting ??= (async () => {
            await hydrateStores();
            await loadTokens();
            await get().checkInitial();
          })();
          try {
            await booting;
          } catch (e) {
            booting = null;
            throw e;
          }
        },
        async checkInitial() {
          for (const provider of Object.keys(useStore.getState().accounts)) {
            patch(provider, { initialDone: (await getMeta(await getDb(provider), INITIAL_KEY)) === "1" });
          }
        },
        async syncNow(provider, options = {}) {
          const targets = provider ? [provider] : Object.keys(useStore.getState().accounts);
          await Promise.all(targets.map((p) => syncOne(p, options)));
        },
        defer: (provider) => set((s) => ({ deferred: { ...s.deferred, [provider]: true } })),
        clearExpired: (provider) => patch(provider, { expired: false, error: null }),
        forget: (provider) => {
          cancellations.get(provider)?.();
          set((s) => {
            const { [provider]: _x, ...by } = s.by;
            const { [provider]: _deferred, ...deferred } = s.deferred;
            return { by, deferred };
          });
        },
      };
    },
    {
      name: "slackboard-sync-v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ deferred: s.deferred }),
    },
  ),
);

/** One provider's sync state (idle defaults when it has none yet). */
export const useProviderSync = (provider: ProviderId): ProviderSync => useSync((s) => s.by[provider] ?? IDLE_SYNC);
