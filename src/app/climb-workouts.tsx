import { useUserId } from "../state/useActive";
import { getProvider } from "../providers";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { JumpList } from "../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get, workoutTemplatesPath } from "../core/api";
import { parseWorkoutTemplates, type WorkoutTemplate } from "../core/social";
import { sessionFor } from "../state/session";
import { useBoard, useStore } from "../state/store";
import { Icon } from "../ui/Icon";
import { Button, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

export const workoutRequest = (b: { spec: { layoutId: number; hsm: number; edges: { left: number; right: number; bottom: number; top: number } }; angle: number }) =>
  ({ layoutId: b.spec.layoutId, edges: b.spec.edges, hsm: b.spec.hsm, angle: b.angle });

/** Ready-made sessions for your board: pick one and the server builds a list of climbs at the right grades. */
export default function ClimbWorkouts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useBoard();
  const me = useUserId();
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = () => {
    const s = sessionFor();
    if (!s || !board) return;
    setFailed(false);
    void get(s, workoutTemplatesPath(workoutRequest(board))).then((j) => { if (!j) setFailed(true); setTemplates(parseWorkoutTemplates(j)); });
  };
  useEffect(load, [board?.id, board?.angle]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text v="sheetTitle">Climb workouts</Text>
          {board ? <Text v="caption">{board.name} · {board.angle}°</Text> : null}
        </View>
      </View>
      <JumpList data={templates ?? []} keyExtractor={(t) => t.name} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={<Text v="secondary" style={{ marginBottom: 6 }}>Pick a session.</Text>}
        ListEmptyComponent={failed ? <View style={{ gap: 12 }}><Text v="secondary" style={{ color: c.danger }}>Couldn't load climb workouts. Check your connection.</Text><Button label="Try again" onPress={load} /></View> : <Text v="secondary">{templates ? "No climb workouts for this board." : "Loading"}</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/climb-workout/[name]", params: { name: item.name } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <Image source={{ uri: getProvider(board?.spec.provider).links.workoutImage(item.name) }} accessibilityIgnoresInvertColors style={{ width: 48, height: 48, borderRadius: r.thumb, backgroundColor: c.raised }} />
            <View style={{ flex: 1 }}>
              <Text v="climbName">{item.title}</Text>
              <Text v="secondary">{item.description}</Text>
            </View>
            <Icon name="chevR" size={20} color={c.muted} />
          </Pressable>
        )} />
    </View>
  );
}
