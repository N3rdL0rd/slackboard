import { useUserId } from "../state/useActive";
import { getProvider } from "../providers";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { get, workoutTemplatesPath } from "../core/api";
import { parseWorkoutTemplates, type WorkoutTemplate } from "../core/social";
import { sessionFor } from "../state/session";
import { useBoard, useStore } from "../state/store";
import { Icon } from "./Icon";
import { Button, Sheet, Tap } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

/** workoutRequest, repeated here so this sheet does not import a screen. */
const request = (b: { spec: { layoutId: number; hsm: number; edges: { left: number; right: number; bottom: number; top: number } }; angle: number }) =>
  ({ layoutId: b.spec.layoutId, edges: b.spec.edges, hsm: b.spec.hsm, angle: b.angle });

/** Climb workouts without leaving the Climb tab: pick a template and the server builds the session for this board and angle. */
export function ClimbWorkoutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const board = useBoard();
  const me = useUserId();
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = board ? `${board.id}:${board.angle}` : "";
  const load = () => {
    const s = sessionFor();
    if (!s || !board) return;
    setFailed(false);
    void get(s, workoutTemplatesPath(request(board))).then((j) => { if (!j) setFailed(true); setTemplates(parseWorkoutTemplates(j)); });
  };
  useEffect(() => { if (visible) load(); }, [visible, key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!board) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Climb workout">
      <Text v="secondary" style={{ marginBottom: 12 }}>For {board.name} at {board.angle}°. Pick a session and the server builds the list of climbs.</Text>
      {failed ? (
        <View style={{ gap: 12 }}>
          <Text v="secondary" style={{ color: c.danger }}>Couldn't load climb workouts. Check your connection.</Text>
          <Button label="Try again" onPress={load} />
        </View>
      ) : templates == null ? <Text v="secondary">Loading</Text> : (
        <View style={{ gap: 10 }}>
          {templates.map((t) => (
            <Tap key={t.name} accessibilityRole="button" onPress={() => { onClose(); router.push({ pathname: "/climb-workout/[name]", params: { name: t.name } }); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <Image source={{ uri: getProvider(board.spec.provider).links.workoutImage(t.name) }} accessibilityIgnoresInvertColors style={{ width: 44, height: 44, borderRadius: r.thumb }} />
              <View style={{ flex: 1 }}>
                <Text v="bodyStrong">{t.title}</Text>
                <Text v="caption" numberOfLines={2}>{t.description}</Text>
              </View>
              <Icon name="chevR" size={20} color={c.muted} />
            </Tap>
          ))}
        </View>
      )}
    </Sheet>
  );
}
