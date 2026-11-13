import { useActiveProviderId } from "../state/useActive";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { JumpList } from "../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { circuitDisplayColor } from "../core/circuits";
import { createCircuit } from "../state/circuits";
import { useData } from "../state/data";
import { CircuitEditSheet } from "../ui/CircuitEditSheet";
import { Icon } from "../ui/Icon";
import { Button, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/** Your circuits: named, coloured lists of climbs you can keep private or share. */
export default function Circuits() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const circuits = useData((d) => d.circuits);
  const activeId = useActiveProviderId();
  const [creating, setCreating] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Circuits</Text>
        <IconButton icon="plus" label="New circuit" onPress={() => setCreating(true)} />
      </View>
      <JumpList
        data={circuits}
        keyExtractor={(x) => x.uuid}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>No circuits yet</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>Lists of climbs, like a warm-up.</Text>
            <Button label="New circuit" onPress={() => setCreating(true)} />
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/circuit/[uuid]", params: { uuid: item.uuid } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: circuitDisplayColor(item.color) }} />
            <View style={{ flex: 1 }}>
              <Text v="climbName" numberOfLines={1}>{item.name}</Text>
              <Text v="secondary">{item.climbs.length} {item.climbs.length === 1 ? "climb" : "climbs"} · {item.projections.length === 0 ? "On this phone" : item.isPublic ? "Public" : "Private"}</Text>
            </View>
            <Icon name="chevR" size={20} color={c.muted} />
          </Pressable>
        )}
      />
      <CircuitEditSheet provider={activeId} visible={creating} onClose={() => setCreating(false)} title="New circuit" saveLabel="Create circuit"
        onSave={async (i) => { const out = await createCircuit(i, activeId); if (out.ok) router.push({ pathname: "/circuit/[uuid]", params: { uuid: out.uuid } }); return out.ok ? null : out.message; }} />
    </View>
  );
}
