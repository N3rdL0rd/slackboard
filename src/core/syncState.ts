import type { ProviderId } from "./provider";

export interface InitialSyncStatus {
  initialDone: boolean | null;
}

/** The first provider whose unfinished first download must keep the user on the sync screen. */
export function pendingProvider(
  accounts: Record<string, unknown>,
  by: Record<ProviderId, InitialSyncStatus | undefined>,
  deferred: Record<ProviderId, boolean> = {},
): ProviderId | null {
  return Object.keys(accounts).find((p) => by[p]?.initialDone === false && !deferred[p]) ?? null;
}

/** Providers whose unfinished first download the user chose to continue away from the sync screen. */
export function settingUpProviders(
  accounts: Record<string, unknown>,
  by: Record<ProviderId, InitialSyncStatus | undefined>,
  deferred: Record<ProviderId, boolean>,
): ProviderId[] {
  return Object.keys(accounts).filter((p) => by[p]?.initialDone === false && deferred[p]);
}
