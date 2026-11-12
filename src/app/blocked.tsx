import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as repo from "../core/repo";
import type { Climb } from "../core/types";
import { getDb } from "../data/sqlite";
import { useData } from "../state/data";
import { setTag } from "../state/serverSends";
import { JumpList } from "../ui/JumpToTop";
import { IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/** Climbs you have blocked. They are hidden from the list; unblock one here to bring it back. */
export default function Blocked() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const blocked = useData((d) => d.blocked);
  const [climbs, setClimbs] = useState<Climb[] | null>(null);
  const ids = useMemo(() => [...blocked].sort(), [blocked]);
  const key = ids.join(",");
  useEffect(() => {
    let live = true;
    void getDb().then((db) => repo.climbsByUuids(db, ids)).then((rows) => { if (live) setClimbs(rows.sort((a, b) => a.name.localeCompare(b.name))); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ids whose climb is not on this device still count as blocked; list them by id so they can be unblocked.
  const missing = climbs ? ids.filter((u) => !climbs.some((x) => x.uuid === u.toUpperCase())) : [];
  const rows = [...(climbs ?? []).map((x) => ({ uuid: x.uuid, name: x.name, sub: `Set by ${x.setter}` })), ...missing.map((u) => ({ uuid: u, name: "Unknown climb", sub: u.slice(0, 8) }))];

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="screenTitle" style={{ flex: 1 }}>Blocked climbs</Text>
      </View>
      <JumpList
        data={rows}
        keyExtractor={(x) => x.uuid}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, gap: 8 }}
        ListHeaderComponent={<Text v="secondary" style={{ marginBottom: 10 }}>Blocked climbs are hidden from your list and search. Unblocking brings one back.</Text>}
        ListEmptyComponent={<View style={{ alignItems: "center", padding: 40, gap: 8 }}>
          <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>{climbs ? "Nothing blocked" : "Loading"}</Text>
          {climbs ? <Text v="secondary" style={{ textAlign: "center" }}>Block a climb from its More menu to hide it.</Text> : null}
        </View>}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong" numberOfLines={1}>{item.name}</Text>
              <Text v="caption" numberOfLines={1}>{item.sub}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Unblock ${item.name}`} onPress={() => void setTag(item.uuid, "~block", false)}
              style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: r.pill, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
              <Text v="bodyStrong" style={{ fontSize: 14 }}>Unblock</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
