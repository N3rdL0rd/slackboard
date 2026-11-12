import { DEFAULT_PROVIDER, getProvider } from "../providers";
import type { ProviderId } from "../core/provider";
import { setProviderResolver } from "../data/sqlite";
import { useData } from "./data";
import { useStore } from "./store";

/**
 * Which provider "now" means. Inside a board the answer is the open board's provider, so every action and database read there
 * goes to that provider's account and local copy without being told. A screen about one climb or sign-in flow can pin it for
 * its lifetime (`useProviderContext`), which is how a climb from another provider's circuit stays in that provider's context.
 */
let pinned: ProviderId | null = null;

export function pinProvider(p: ProviderId | null): void { pinned = p; }
export const activePin = (): ProviderId | null => pinned;

export function activeProviderId(): ProviderId {
  if (pinned) return pinned;
  const { boardId, accounts } = useStore.getState();
  const boards = useData.getState().boards;
  const b = boards.find((x) => x.id === boardId) ?? boards[0];
  return b?.spec.provider ?? Object.keys(accounts)[0] ?? DEFAULT_PROVIDER.id;
}

export const activeProvider = () => getProvider(activeProviderId());

setProviderResolver(activeProviderId);
