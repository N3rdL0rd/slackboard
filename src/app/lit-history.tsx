import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { boardColor } from "../core/boards";
import { groupLitByDay, litTime, type LitEntry } from "../core/litHistory";
import { useLit, useLitHistory } from "../state/litHistory";
import { Button, IconButton, LinkButton, Sheet, Tap } from "../ui/parts";
import { Icon } from "../ui/Icon";
import { JumpList } from "../ui/JumpToTop";
import { Text } from "../ui/Text";
import { c } from "../theme";

type Row = { kind: "day"; key: string; label: string; count: number } | { kind: "entry"; key: string; entry: LitEntry };

/** Every climb you have lit up on a board, newest first, by day. Tap one to open it. */
export default function LitHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entries = useLitHistory();
  const [confirmClear, setConfirmClear] = useState(false);
  const rows = useMemo<Row[]>(() => groupLitByDay(entries, new Date()).flatMap((d) => [
    { kind: "day" as const, key: `d${d.key}`, label: d.label, count: d.entries.length },
    ...d.entries.map((entry) => ({ kind: "entry" as const, key: entry.id, entry })),
  ]), [entries]);
  const open = (e: LitEntry) => router.push({ pathname: "/climb/[uuid]", params: { uuid: e.climbUuid, provider: e.provider, angle: String(e.angle) } });

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Lit history</Text>
      </View>
      <JumpList
        data={rows}
        keyExtractor={(x) => x.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={entries.length ? <Text v="secondary" style={{ paddingHorizontal: 16, paddingBottom: 4 }}>{entries.length} {entries.length === 1 ? "climb" : "climbs"} lit on your boards. A climb counts once it has stayed lit for a few seconds.</Text> : undefined}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40, gap: 10 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing lit yet</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>Connect your board and light a climb. Everything you light up is kept here, for every board.</Text>
          </View>
        }
        ListFooterComponent={entries.length ? <View style={{ paddingTop: 16 }}><LinkButton label="Clear history" icon="trash" danger onPress={() => setConfirmClear(true)} /></View> : undefined}
        renderItem={({ item }) => item.kind === "day" ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 }}>
            <Text v="section">{item.label}</Text>
            <Text v="caption">{item.count} {item.count === 1 ? "climb" : "climbs"}</Text>
          </View>
        ) : (
          <Tap accessibilityRole="button" accessibilityLabel={`${item.entry.climbName} on ${item.entry.boardName}, ${item.entry.angle} degrees, ${litTime(item.entry.litAt)}`} onPress={() => open(item.entry)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: boardColor(item.entry.boardId) }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text v="climbName" numberOfLines={1}>{item.entry.climbName}</Text>
              <Text v="secondary" numberOfLines={1}>{item.entry.boardName} · {item.entry.angle}° · {litTime(item.entry.litAt)}</Text>
            </View>
            <Icon name="chevR" size={20} color={c.muted} />
          </Tap>
        )}
      />
      <Sheet visible={confirmClear} onClose={() => setConfirmClear(false)} title="Clear lit history?"
        footer={<Button variant="danger" label="Clear" onPress={() => { void useLit.getState().clear(); setConfirmClear(false); }} />}>
        <Text v="secondary">This removes the list on this phone. It doesn't touch your logbook or anything kept on a board's service.</Text>
      </Sheet>
    </View>
  );
}
