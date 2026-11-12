import { useRouter } from "expo-router";
import { View } from "react-native";
import { getProvider } from "../providers";
import { settingUpProviders, useSync } from "../state/sync";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { Text } from "./Text";
import { Button } from "./parts";

/** Deferred first downloads stay visible without blocking the rest of the app. */
export function SyncBanner() {
  const router = useRouter();
  const accounts = useStore((s) => s.accounts);
  const by = useSync((s) => s.by);
  const deferred = useSync((s) => s.deferred);
  const providers = settingUpProviders(accounts, by, deferred);
  return (
    <View style={{ gap: 8 }}>
      {providers.map((id) => {
        const brand = getProvider(id);
        const st = by[id];
        const page = st?.progress?.page ?? 0;
        const percent = st?.running ? Math.min(95, 5 + page / 2) : 5;
        return (
          <View key={id} accessibilityLiveRegion="polite" style={{ padding: 12, gap: 8, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: st?.error ? c.danger : c.line }}>
            <Text v="bodyStrong">{brand.name} is still setting up</Text>
            <View accessibilityRole="progressbar" accessibilityLabel={`${brand.name} setup progress`} accessibilityValue={{ min: 0, max: 100, now: percent }}
              style={{ height: 5, borderRadius: 3, backgroundColor: c.card, overflow: "hidden" }}>
              <View style={{ height: 5, width: `${percent}%`, backgroundColor: st?.error ? c.danger : c.text }} />
            </View>
            {st?.expired ? (
              <>
                <Text v="caption">Sign in again to finish downloading its climbs.</Text>
                <Button label="Sign in again" onPress={() => router.push({ pathname: "/welcome", params: { provider: id } })} />
              </>
            ) : st?.error ? (
              <>
                <Text v="caption" style={{ color: c.danger }}>{st.error} Downloaded pages are saved.</Text>
                <Button label="Retry download" onPress={() => void useSync.getState().syncNow(id)} />
              </>
            ) : (
              <Text v="caption">{st?.running ? `Downloading page ${Math.max(1, page)} · ${page} completed` : "Download continues when the phone allows it. Open the app to speed it up."}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
