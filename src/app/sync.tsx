import { useKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { getProvider } from "../providers";
import { signOutProvider } from "../state/auth";
import { useProviderSync, useSync } from "../state/sync";
import { Button } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const n = (v: number | undefined) => (v ?? 0).toLocaleString("en-US");

/** First-run sync: the whole climb database is downloaded once, then only changes after that. */
export default function SyncScreen() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const provider = getProvider(useLocalSearchParams<{ provider?: string }>().provider);
  const { running, progress, error, expired } = useProviderSync(provider.id);
  const syncNow = () => useSync.getState().syncNow(provider.id);

  useEffect(() => { void syncNow(); }, [provider.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = progress?.totals ?? {};
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, padding: 24, paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }}>
      <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 40, color: c.text }}>Getting {provider.name} ready</Text>
      <Text v="secondary" style={{ marginTop: 8 }}>
        Downloading the climb database once so everything works offline. After this only changes are fetched. This can take several minutes.
      </Text>

      <View style={{ marginTop: 32, gap: 14 }}>
        <Row label="Climbs" value={n(t.climbs)} />
        <Row label="Grades and ratings" value={n(t.climb_stats)} />
        <Row label="Holes and boards" value={n((t.holes ?? 0) + (t.placements ?? 0) + (t.layouts ?? 0))} />
        <Row label="Beta videos" value={n(t.beta_links)} />
      </View>

      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.raised, marginTop: 28, overflow: "hidden" }}>
        <View style={{ height: 8, width: running ? `${Math.min(95, 5 + (progress?.page ?? 0) / 2)}%` : error ? "100%" : "100%", backgroundColor: error ? c.danger : c.text }} />
      </View>
      <Text v="caption" style={{ marginTop: 8 }}>{running ? `Page ${progress?.page ?? 0}` : error ? "Stopped" : "Done"}</Text>

      <View style={{ flex: 1 }} />
      {error && (
        <View style={{ gap: 12, marginBottom: 16 }}>
          <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text>
          {expired ? <Button label="Sign in again" onPress={() => void signOutProvider(provider.id)} /> : <Button label="Try again" onPress={() => void syncNow()} />}
        </View>
      )}
      <View style={{ gap: 12 }}>
        <Text v="caption">Slackboard keeps downloading in the background and finishes the next time the phone allows it. Open the app to speed it up.</Text>
        <Button variant="secondary" label="Keep going in the background" onPress={() => useSync.getState().defer(provider.id)} />
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.card, borderRadius: r.card, borderWidth: 1, borderColor: c.line, padding: 14 }}>
      <Text v="bodyStrong" style={{ flex: 1 }}>{label}</Text>
      <Text v="numeral" style={{ fontSize: 24 }}>{value}</Text>
    </View>
  );
}
