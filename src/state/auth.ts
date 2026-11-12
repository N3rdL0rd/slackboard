import { clearLocalData } from "../core/logicalCircuits";
import type { ProviderId } from "../core/provider";
import { clearUserData, getDb, getLocalDb } from "../data/sqlite";
import { useData } from "./data";
import { refreshOutboxCount, refreshUserData } from "./outbox";
import { clearToken, saveToken } from "./session";
import { useStore } from "./store";
import { useSync } from "./sync";

/**
 * Signs out of one provider: drops its token and that account's data from the device, and leaves every other account and the
 * shared climb database alone. Circuits and logs that came from this provider stay in the local store (they are the user's).
 */
export async function signOutProvider(provider: ProviderId) {
  await clearToken(provider);
  await clearUserData(await getDb(provider));
  useStore.getState().signOut(provider);
  useSync.getState().forget(provider);
  if (Object.keys(useStore.getState().accounts).length) {
    await refreshUserData();
    await refreshOutboxCount();
  } else {
    // Nothing left to belong to: the cross-board store goes too.
    await clearLocalData(await getLocalDb());
    useData.setState({ boards: [], boardsLoaded: false, boardData: null, stats: null, statsKey: "", logbook: [], done: new Map(), liked: new Set(), blocked: new Set(), permissionsBy: {}, circuits: [], draftsBy: {} });
  }
}

/** Signs out of every provider. */
export async function signOutAll() {
  for (const p of Object.keys(useStore.getState().accounts)) await signOutProvider(p);
}

/** Stores a new session for a provider and gets its first download going (or ends an expired state when signing in again). */
export async function completeSignIn(provider: ProviderId, username: string, token: string, userId: number) {
  await saveToken(provider, token);
  useStore.getState().signIn(provider, username, userId);
  await useSync.getState().checkInitial();
  useSync.getState().clearExpired(provider);
}
