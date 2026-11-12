import { makeRef } from "../core/provider";
import { useActiveProviderId } from "../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { circuitDisplayColor, circuitsContaining, DEFAULT_CIRCUIT_COLOR } from "../core/circuits";
import { createCircuit, setClimbCircuits } from "../state/circuits";
import { useData } from "../state/data";
import { CircuitEditSheet } from "../ui/CircuitEditSheet";
import { Icon } from "../ui/Icon";
import { Button, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/** Choose which of your circuits a climb is in. */
export default function CircuitsFor() {
  const { uuid, name } = useLocalSearchParams<{ uuid: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const circuits = useData((d) => d.circuits);
  const activeId = useActiveProviderId();
  const [picked, setPicked] = useState<string[]>(circuitsContaining(circuits, uuid));
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setPicked(circuitsContaining(circuits, uuid)); }, [uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = async () => {
    setBusy(true); setError("");
    const out = await setClimbCircuits(makeRef(activeId, uuid), picked);
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text v="sheetTitle">Add to circuits</Text>
          {name ? <Text v="caption" numberOfLines={1}>{name}</Text> : null}
        </View>
        <IconButton icon="plus" label="New circuit" onPress={() => setCreating(true)} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {circuits.length === 0 && <Text v="secondary">You have no circuits yet. Tap + to make one.</Text>}
        {circuits.map((ci) => {
          const on = picked.includes(ci.uuid);
          return (
            <Pressable key={ci.uuid} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(ci.uuid)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 2, borderColor: on ? c.text : c.line }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: circuitDisplayColor(ci.color) }} />
              <View style={{ flex: 1 }}>
                <Text v="climbName" numberOfLines={1}>{ci.name}</Text>
                <Text v="secondary">{ci.climbs.length} {ci.climbs.length === 1 ? "climb" : "climbs"}</Text>
              </View>
              <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: on ? c.text : c.muted, backgroundColor: on ? c.text : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on && <Icon name="check" size={18} color={c.btnText} stroke={3} />}
              </View>
            </Pressable>
          );
        })}
        {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line }}>
        <Button label={busy ? "Saving" : "Save"} disabled={busy} onPress={() => void save()} />
      </View>
      <CircuitEditSheet provider={activeId} visible={creating} onClose={() => setCreating(false)} title="New circuit" saveLabel="Create and add this climb" initial={{ color: DEFAULT_CIRCUIT_COLOR }}
        onSave={async (i) => { const out = await createCircuit(i, activeId); if (!out.ok) return out.message; setPicked((p) => [...p, out.uuid]); return null; }} />
    </View>
  );
}
