import type { Provider, ProviderId } from "../core/provider";
import { decoy } from "./decoy";
import { grasshopper } from "./grasshopper";
import { moonboard } from "./moonboard";
import { tension } from "./tension";

/** Every service the app can talk to. Adding another Aurora brand or a different backend is one more entry here. */
export const providers: Provider[] = [tension, decoy, grasshopper, moonboard];

export const DEFAULT_PROVIDER: Provider = tension;

export function getProvider(id: ProviderId | undefined | null): Provider {
  return providers.find((p) => p.id === id) ?? DEFAULT_PROVIDER;
}
