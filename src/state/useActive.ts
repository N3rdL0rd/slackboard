import { useEffect, useRef } from "react";
import type { ProviderId } from "../core/provider";
import { DEFAULT_PROVIDER, getProvider } from "../providers";
import { activePin, pinProvider } from "./active";
import { useData } from "./data";
import { useStore } from "./store";

/** The open board's provider, as a hook (re-renders when the board changes). */
export function useActiveProviderId(): ProviderId {
  const boardId = useStore((s) => s.boardId);
  const accounts = useStore((s) => s.accounts);
  const boards = useData((d) => d.boards);
  const b = boards.find((x) => x.id === boardId) ?? boards[0];
  return activePin() ?? b?.spec.provider ?? Object.keys(accounts)[0] ?? DEFAULT_PROVIDER.id;
}
export const useActiveProvider = () => getProvider(useActiveProviderId());

/** The signed-in user id on the open board's provider. */
export function useUserId(): number | null {
  const p = useActiveProviderId();
  return useStore((s) => s.accounts[p]?.userId ?? null);
}
export function useUsername(): string {
  const p = useActiveProviderId();
  return useStore((s) => s.accounts[p]?.username ?? "");
}

/**
 * Pins the provider for this screen. It is set while rendering, before child effects read their database, and the previous pin
 * is put back when the screen goes away, so screens stacked on each other each keep their own.
 */
export function useProviderContext(provider: ProviderId | undefined): void {
  const before = useRef<ProviderId | null | undefined>(undefined);
  if (before.current === undefined) before.current = activePin();
  if (provider) pinProvider(provider);
  useEffect(() => () => pinProvider(before.current ?? null), []);
}

const NO_PERMISSIONS = new Set<string>();
/** What the account on the open board's provider may do (set climbs, and so on). */
export function usePermissions(): Set<string> {
  const p = useActiveProviderId();
  return useData((d) => d.permissionsBy[p]) ?? NO_PERMISSIONS;
}

/** Whether the open board's user can set climbs, and which kinds. A local provider (MoonBoard) has no account to ask: boulders only. */
export function useCanSet(): { boulder: boolean; route: boolean; any: boolean } {
  const provider = getProvider(useActiveProviderId());
  const permissions = usePermissions();
  const boulder = provider.kind === "local" || permissions.has("set_boulder");
  const route = provider.kind !== "local" && permissions.has("set_route");
  return { boulder, route, any: boulder || route };
}

const NO_CLIMBS: never[] = [];
/** The user's unpublished climbs on the open board's provider. */
export function useDrafts() {
  const p = useActiveProviderId();
  return useData((d) => d.draftsBy[p]) ?? NO_CLIMBS;
}
