import { useUserId } from "../state/useActive";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { JumpList } from "../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as repo from "../core/repo";
import { getDb } from "../data/sqlite";
import { useData } from "../state/data";
import { useStore } from "../state/store";
import { Icon } from "../ui/Icon";
import { deleteClimb } from "../state/climbActions";
import { Button, IconButton, Sheet } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/** Climbs you've set but not published. Open one to keep editing or publish it. */
export default function Drafts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const version = useData((d) => d.logbook.length + d.boards.length);
  const [drafts, setDrafts] = useState<Awaited<ReturnType<typeof repo.draftsOf>> | null>(null);
  const [pick, setPick] = useState<null | { uuid: string; name: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [gone, setGone] = useState<string[]>([]);
  const remove = async () => {
    if (!pick) return;
    setBusy(true); setError("");
    const out = await deleteClimb(pick.uuid);
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    setGone((g) => [...g, pick.uuid]);
    setPick(null);
  };
  useEffect(() => { if (userId != null) void getDb().then((db) => repo.draftsOf(db, userId)).then(setDrafts); }, [userId, version]);
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Drafts</Text>
      </View>
      <JumpList data={(drafts ?? []).filter((d) => !gone.includes(d.uuid))} keyExtractor={(d) => d.uuid} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={<Text v="secondary">{drafts ? "No drafts. Set a climb and choose Save as draft." : "Loading"}</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/set-climb", params: { uuid: item.uuid } })}
            style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <View style={{ flex: 1 }}>
              <Text v="climbName" numberOfLines={1}>{item.name}</Text>
              <Text v="secondary">{item.frameCount > 1 ? `Route · ${item.frameCount} frames` : "Boulder"} · edit or publish</Text>
            </View>
            <IconButton icon="trash" label={`Delete ${item.name}`} onPress={() => { setError(""); setPick({ uuid: item.uuid, name: item.name }); }} />
            <Icon name="chevR" size={20} color={c.muted} />
          </Pressable>
        )} />
      <Sheet visible={!!pick} onClose={() => setPick(null)} title="Delete this draft?"
        footer={<View style={{ gap: 8 }}><Button variant="danger" label={busy ? "Deleting" : "Delete draft"} disabled={busy} onPress={() => void remove()} /><Button variant="secondary" label="Keep it" onPress={() => setPick(null)} /></View>}>
        <Text v="secondary">"{pick?.name}" is deleted for good.</Text>
        {error ? <Text v="secondary" style={{ color: c.danger, marginTop: 8 }} aria-live="polite">{error}</Text> : null}
      </Sheet>
    </View>
  );
}
