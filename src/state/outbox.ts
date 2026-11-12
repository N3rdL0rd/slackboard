import { create } from "zustand";
import { flushOutbox, listOutbox, type FlushResult } from "../core/outbox";
import { getDb } from "../data/sqlite";
import { useData } from "./data";
import { allSessions, sessionFor } from "./session";
import { useStore } from "./store";

interface OutboxState {
  /** Changes waiting to upload. */
  pending: number;
  /** Messages about changes the server refused; shown once, then cleared by the user. */
  rejected: string[];
  clearRejected: () => void;
}

export const useOutbox = create<OutboxState>((set) => ({ pending: 0, rejected: [], clearRejected: () => set({ rejected: [] }) }));

/** Changes waiting to upload, across every provider's queue. */
export async function refreshOutboxCount() {
  let n = 0;
  for (const p of Object.keys(useStore.getState().accounts)) n += (await listOutbox(await getDb(p))).length;
  useOutbox.setState({ pending: n });
}

/** Reloads what the screens show from the database. */
export async function refreshUserData() {
  await useData.getState().loadAll(useStore.getState().accounts);
}

const reason = (r: FlushResult["rejected"][number]) => {
  const first = r.errors ? Object.values(r.errors).flat()[0] : undefined;
  return first ?? (r.code === 401 || r.code === 403 ? `You're not allowed to ${r.label}.` : `The server refused to ${r.label}.`);
};

/**
 * Tries to send everything waiting, each provider's queue to its own server with its own session. Safe to call any time:
 * nothing happens without a session, and one flush runs at a time per provider. With `only`, just that provider's queue.
 */
export async function flushNow(only?: string, fetchImpl?: typeof fetch): Promise<FlushResult | null> {
  const sessions = only ? [sessionFor(only)].filter((x): x is NonNullable<typeof x> => !!x) : allSessions();
  if (!sessions.length) return null;
  const total: FlushResult = { sent: [], rejected: [], remaining: 0 };
  for (const session of sessions) {
    const res = await flushOutbox(await getDb(session.provider), session, fetchImpl);
    total.sent.push(...res.sent); total.rejected.push(...res.rejected); total.remaining += res.remaining;
  }
  const others = await (async () => { let n = 0; for (const p of Object.keys(useStore.getState().accounts)) if (!sessions.some((x) => x.provider === p)) n += (await listOutbox(await getDb(p))).length; return n; })();
  useOutbox.setState((s) => ({ pending: total.remaining + others, rejected: [...s.rejected, ...total.rejected.map(reason)] }));
  if (total.sent.length || total.rejected.length) await refreshUserData();
  return total;
}
