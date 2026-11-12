import { deleteSendReq, sendReq, tagReq, type SaveSendInput } from "../core/api";
import { litRequest, LIT_DEBOUNCE_MS } from "../core/lit";
import { enqueue, listOutbox, removeFromOutbox } from "../core/outbox";
import type { LogEntry } from "../core/types";
import * as local from "../core/moonLocal";
import { DEFAULT_PROVIDER, getProvider } from "../providers";
import { getDb } from "../data/sqlite";
import { useData } from "./data";
import { activePin, activeProviderId, pinProvider } from "./active";
import { flushNow, refreshOutboxCount, refreshUserData } from "./outbox";
import { sessionFor } from "./session";
import { useStore } from "./store";
import { useSpaces } from "./spaces";

const session = () => sessionFor();
/** A local provider (MoonBoard) has no server: logs and tags are written to the phone's database and are final at once. */
const isLocal = (provider: string) => getProvider(provider).kind === "local";

/** What a log action did: the queued change, and the server's id for it once the server has accepted it. */
export interface Logged {
  opId: number;
  kind: "ascent" | "bid";
  serverId: string | null;
  provider: string;
}

/**
 * Saves a send or an attempts record. It is written to the on-device queue first, so it is never lost; if
 * the server is reachable it goes out straight away, otherwise `serverId` is null and it uploads later.
 */
export async function logSend(input: SaveSendInput): Promise<Logged | null> {
  const provider = activeProviderId();
  if (isLocal(provider)) {
    const saved = await local.saveLog(await getDb(provider), input);
    const boardId = useStore.getState().boardId ?? useData.getState().boards[0]?.id;
    if (boardId) await useSpaces.getState().recordLog(saved.uuid, boardId);
    await refreshUserData();
    return { opId: 0, kind: saved.kind, serverId: saved.uuid, provider };
  }
  const s = session();
  if (!s) return null;
  const db = await getDb(s.provider);
  const req = sendReq(s, input);
  const opId = await enqueue(db, req, "save that log");
  const boards = useData.getState().boards;
  const boardId = useStore.getState().boardId ?? boards[0]?.id;
  const requestId = String(req.fields.uuid);
  if (boardId) await useSpaces.getState().recordLog(`pending:${opId}`, boardId, requestId);
  await refreshUserData();
  const flushed = await flushNow();
  await refreshOutboxCount();
  const sent = flushed?.sent.find((x) => x.id === opId);
  const body = sent?.body as { ascents?: { uuid: string }[]; bids?: { uuid: string }[] } | undefined;
  const serverId = body?.ascents?.[0]?.uuid ?? body?.bids?.[0]?.uuid ?? null;
  return { opId, kind: req.path === "/ascents/save" ? "ascent" : "bid", serverId, provider: s.provider ?? DEFAULT_PROVIDER.id };
}

/** Undo for a log just made: cancels it if it is still waiting to upload, otherwise deletes it on the server. */
export async function undoLog(entry: Logged): Promise<void> {
  const db = await getDb(entry.provider);
  if (isLocal(entry.provider) && entry.serverId) {
    await local.deleteLog(db, entry.serverId, entry.kind);
    await useSpaces.getState().forgetLog(entry.serverId);
    await refreshUserData();
    return;
  }
  if (entry.serverId) await deleteEntry(entry.serverId, entry.kind, entry.provider);
  else if (!(await removeFromOutbox(db, entry.opId))) {
    // The background flush got there first; it can be deleted from the Log tab.
  }
  await useSpaces.getState().forgetLog(`pending:${entry.opId}`);
  if (entry.serverId) await useSpaces.getState().forgetLog(entry.serverId);
  await refreshOutboxCount();
  await refreshUserData();
}

async function deleteEntry(serverId: string, kind: "ascent" | "bid", provider: string) {
  await enqueue(await getDb(provider), deleteSendReq(kind, serverId), "delete that log");
  await refreshUserData();
  await flushNow(provider);
}

/** Delete from the Log tab. A log still waiting to upload is just cancelled. */
export async function deleteLogEntry(entry: LogEntry): Promise<void> {
  if (isLocal(entry.provider)) {
    await local.deleteLog(await getDb(entry.provider), entry.id, entry.isSend ? "ascent" : "bid");
    await useSpaces.getState().forgetLog(entry.id);
    await refreshUserData();
    return;
  }
  if (entry.id.startsWith("pending:")) {
    const db = await getDb(entry.provider);
    const finalId = (await listOutbox(db)).find((q) => `pending:${q.id}` === entry.id)?.req.fields.uuid;
    await removeFromOutbox(db, Number(entry.id.slice(8)));
    if (finalId) await useSpaces.getState().forgetLog(String(finalId));
  } else await deleteEntry(entry.id, entry.isSend ? "ascent" : "bid", entry.provider);
  await useSpaces.getState().forgetLog(entry.id);
  await refreshOutboxCount();
  await refreshUserData();
}

/** Changes a logged entry. The server updates in place when it gets an existing id; an entry still waiting to upload is replaced in the queue. */
export async function editLogEntry(entry: LogEntry, input: SaveSendInput): Promise<void> {
  if (isLocal(entry.provider)) {
    const db = await getDb(entry.provider);
    // Turning a send into an attempts record (or back) moves it to the other table, so the old row goes first.
    await local.deleteLog(db, entry.id, entry.isSend ? "ascent" : "bid");
    await local.saveLog(db, input, entry.id);
    await refreshUserData();
    return;
  }
  const s = sessionFor(entry.provider);
  if (!s) return;
  const before = activePin();
  pinProvider(entry.provider);
  try {
    const db = await getDb(entry.provider);
    if (entry.id.startsWith("pending:")) {
      await deleteLogEntry(entry);
      await logSend(input);
      return;
    }
    const req = sendReq(s, input);
    req.fields.uuid = entry.id;
    await enqueue(db, req, "save that change");
    await refreshUserData();
    await flushNow(entry.provider);
    await refreshOutboxCount();
  } finally {
    pinProvider(before);
  }
}

/** Like or block a climb. Shown immediately, uploaded when possible. */
export async function setTag(climbUuid: string, name: "~flag" | "~block", listed: boolean): Promise<void> {
  const provider = activeProviderId();
  if (isLocal(provider)) {
    await local.setTag(await getDb(provider), climbUuid, name, listed);
    await refreshUserData();
    return;
  }
  const s = session();
  if (!s) return;
  const db = await getDb();
  await db.run("INSERT OR REPLACE INTO tags (entity_uuid, user_id, name, is_listed) VALUES (?, ?, ?, ?)", [climbUuid.toUpperCase(), s.userId, name, listed ? 1 : 0]);
  await enqueue(db, tagReq(s, climbUuid, name, listed), "save that");
  await refreshUserData();
  await flushNow();
  await refreshOutboxCount();
}

let litTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * Records a climb in the server's Recently lit history for the board's controller, three seconds after it was lit (a
 * newer call within that time replaces it). Does nothing when the user turned "Log climbs I light up" off. The
 * Bluetooth link calls this when a climb is sent to the board.
 */
export function recordLit(climbUuid: string, serial: string | null): void {
  clearTimeout(litTimer);
  litTimer = setTimeout(() => {
    void (async () => {
      const req = litRequest({ enabled: useStore.getState().settings.logLit, session: session(), serial, climbUuid });
      if (!req) return;
      const db = await getDb();
      await enqueue(db, req, "record what was lit");
      await flushNow();
      await refreshOutboxCount();
    })();
  }, LIT_DEBOUNCE_MS);
}
