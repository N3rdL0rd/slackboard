import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { localStamp } from "../core/shareCard";
import { canonicalTags, type HoldTag } from "../core/holdSurvey";
import { useBoard } from "../state/store";
import { useData } from "../state/data";
import { lightBoard, linkMatches } from "../state/ble";
import { useHoldTags, useHoldTagsStore } from "../state/holdTags";
import { useSurveyOrder } from "../state/holdKeys";
import { BoardView, boardHeight } from "../ui/BoardView";
import { IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { ZoomView } from "../ui/ZoomView";
import { c } from "../theme";

/**
 * Mark the holds on a board that cannot be used (missing, broken or spinning). Tap a hold to mark it, tap again to clear it. Climbs
 * that use a marked hold are hidden from the list unless "Show climbs with dead holds" is chosen in the filters. If the board is
 * connected the hold lights up when tapped, so you can see which one it is.
 */
export default function DeadHolds() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const board = useBoard();
  const data = useData((d) => d.boardData);
  const { boardId, order } = useSurveyOrder(board);
  const all = useHoldTags();
  const [zoomed, setZoomed] = useState(false);
  const w = width - 32;

  const dead = new Set(all.filter((t) => t.board === boardId && t.tags.includes("dead")).map((t) => t.key));
  const byId = new Map(order.map((h) => [h.id, h]));
  const marks = order.filter((h) => dead.has(h.key)).map((h) => ({ id: h.id, color: "#F2554D", cross: true }));

  const toggle = async (placementId: number) => {
    const hold = byId.get(placementId);
    if (!hold) return;
    const t = all.find((x) => x.board === boardId && x.key === hold.key);
    const isDead = !!t?.tags.includes("dead");
    const tags = canonicalTags(isDead ? (t?.tags ?? []).filter((x) => x !== "dead") : [...(t?.tags ?? []), "dead"]);
    const next: HoldTag = { board: boardId, key: hold.key, tags, face: t?.face ?? null, note: t?.note ?? "", taggedAt: localStamp(new Date()) };
    await useHoldTagsStore.getState().save(next);
    if (!isDead && linkMatches(board)) void lightBoard([{ position: hold.led, color: "FF0000" }], board);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Dead holds</Text>
      </View>
      <ScrollView scrollEnabled={!zoomed} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 + insets.bottom }}>
        <Text v="secondary">Tap a hold that is missing, broken or spinning to mark it dead. Tap it again to clear it. Pinch to zoom.</Text>
        <Text v="bodyStrong" aria-live="polite">{dead.size === 0 ? "No dead holds" : `${dead.size} dead ${dead.size === 1 ? "hold" : "holds"}`}</Text>
        {board && data ? (
          <ZoomView width={w} height={boardHeight(board.spec, w)} resetKey={boardId} onZoomedChange={setZoomed}>
            <BoardView spec={board.spec} placements={data.placements} roles={data.roles} images={board.spec.images} width={w} marks={marks} onPressHole={(id) => void toggle(id)} />
          </ZoomView>
        ) : <Text v="secondary">Loading the board.</Text>}
        <Text v="caption">Climbs that use a dead hold are hidden from the list. To see them anyway, turn on "With dead holds" in the filters.</Text>
      </ScrollView>
    </View>
  );
}
