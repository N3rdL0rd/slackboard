import type { ProviderId } from "./provider";

/** A signed-in account on one provider. Tokens are kept apart, in the platform keystore (see state/session.ts). */
export interface Account {
  userId: number;
  username: string;
}

export type Accounts = Record<ProviderId, Account>;

/** The first provider's token keeps its original key so installs from before multi-account stay signed in. */
export const tokenKey = (provider: ProviderId, first: ProviderId): string => (provider === first ? "slackboard.token" : `slackboard.token.${provider}`);

/** The local database file of a provider; the first provider keeps the original file name. */
export const dbName = (provider: ProviderId, first: ProviderId): string => (provider === first ? "slackboard.db" : `slackboard-${provider}.db`);

interface OldState {
  signedIn?: boolean;
  userId?: number | null;
  username?: string;
  accounts?: Accounts;
}

/** Saved state from before accounts were per provider had one signed-in user; it becomes the first provider's account. */
export function migrateAccounts(old: OldState, first: ProviderId): Accounts {
  if (old.accounts && Object.keys(old.accounts).length) return old.accounts;
  if (old.signedIn && old.userId != null) return { [first]: { userId: old.userId, username: old.username ?? "" } };
  return {};
}
