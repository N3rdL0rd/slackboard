import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { tokenKey } from "../core/accounts";
import type { Session } from "../core/api";
import type { ProviderId } from "../core/provider";
import { DEFAULT_PROVIDER, providers } from "../providers";
import { activeProviderId } from "./active";
import { useStore } from "./store";

const cached = new Map<ProviderId, string>();
const key = (p: ProviderId) => tokenKey(p, DEFAULT_PROVIDER.id);

/** Session tokens live in the platform keystore on device (plain storage on web, which has none), one per provider. */
export async function loadTokens(): Promise<void> {
  for (const p of providers) {
    const t = Platform.OS === "web" ? await AsyncStorage.getItem(key(p.id)) : await SecureStore.getItemAsync(key(p.id));
    if (t) cached.set(p.id, t); else cached.delete(p.id);
  }
}
export async function saveToken(provider: ProviderId, token: string): Promise<void> {
  cached.set(provider, token);
  if (Platform.OS === "web") await AsyncStorage.setItem(key(provider), token);
  else await SecureStore.setItemAsync(key(provider), token);
}
export async function clearToken(provider: ProviderId): Promise<void> {
  cached.delete(provider);
  if (Platform.OS === "web") await AsyncStorage.removeItem(key(provider));
  else await SecureStore.deleteItemAsync(key(provider));
}
export const hasToken = (provider: ProviderId) => cached.has(provider);

/** A provider's token plus user id, or null when signed out of it. Without an argument: the active provider's. */
export function sessionFor(provider: ProviderId = activeProviderId()): Session | null {
  const token = cached.get(provider);
  const account = useStore.getState().accounts[provider];
  return token && account ? { token, userId: account.userId, provider } : null;
}

/** Every provider that currently has a usable session. */
export const allSessions = (): Session[] => providers.flatMap((p) => { const s = sessionFor(p.id); return s ? [s] : []; });
