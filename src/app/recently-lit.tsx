import { useUserId } from "../state/useActive";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { JumpList } from "../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../core/api";
import { difficultyOf } from "../core/filters";
import { nextCursor, parseExhibits, relativeTime, type Exhibit } from "../core/feed";
import * as repo from "../core/repo";
import { isRoute, type Climb } from "../core/types";
import { getDb } from "../data/sqlite";
import { grades } from "../data/grades";
import { sessionFor } from "../state/session";
import { useBoard, useStore } from "../state/store";
import { useStatsFor } from "../state/layouts";
import { setSequence } from "../state/sequence";
import { ClimbThumb } from "../ui/ClimbThumb";
import { Button, GradeChip, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c } from "../theme";

/** The climbs most recently lit on this board's controller. The server keeps the log; it fills as people light climbs with the app. */
export default function RecentlyLit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useBoard();
  const userId = useUserId();
  const display = useStore((s) => s.settings.gradeDisplay);
  const angle = board?.angle ?? 40;
  const [items, setItems] = useState<Exhibit[]>([]);
  const [climbs, setClimbs] = useState<Map<string, Climb>>(new Map());
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const session = sessionFor();

  const more = async (reset = false) => {
    if (!session || !board?.serial || loading) return;
    setLoading(true);
    setFailed(false);
    const before = reset ? null : nextCursor(items.map((e) => ({ createdAt: e.createdAt }) as never));
    const j = await get(session, `/exhibits?serial_number=${encodeURIComponent(board.serial)}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
    if (!j) setFailed(true);
    const page = parseExhibits(j);
    if (!page.length) setDone(true);
    const all = reset ? page : [...items, ...page];
    setItems(all);
    const found = await repo.climbsByUuids(await getDb(), [...new Set(all.map((e) => e.climbUuid))]);
    setClimbs(new Map(found.map((x) => [x.uuid, x])));
    setLoading(false);
  };
  useEffect(() => { void more(true); }, [board?.serial]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => items.filter((e) => climbs.has(e.climbUuid)), [items, climbs]);
  const stats = useStatsFor([...new Set(known.map((e) => e.climbUuid))], angle);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text v="sheetTitle">Recently lit</Text>
          {board ? <Text v="caption" numberOfLines={1}>{board.name}</Text> : null}
        </View>
      </View>
      {!board?.serial ? (
        <View style={{ padding: 24, gap: 12 }}>
          <Text v="secondary">Recently lit shows what has been lit on your board's controller. Add the controller's serial number to this board to turn it on.</Text>
          {board && <Button label="Edit board" onPress={() => router.replace({ pathname: "/edit-board", params: { uuid: board.id } })} />}
        </View>
      ) : (
        <JumpList
          data={known}
          keyExtractor={(e) => `${e.climbUuid}:${e.createdAt}`}
          onEndReached={() => { if (!done) void more(); }}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListEmptyComponent={<Text v="secondary" style={{ padding: 24 }}>{loading ? "Loading" : failed ? "Couldn't load this. Check your connection." : "Nothing yet. When climbers light climbs on this board with the app, they show up here."}</Text>}
          renderItem={({ item }) => {
            const climb = climbs.get(item.climbUuid)!;
            const d = difficultyOf(stats.get(climb.uuid));
            const label = d != null ? grades.label(d, display, isRoute(climb)) : null;
            return (
              <Pressable accessibilityRole="button" onPress={() => { setSequence(known.map((e) => e.climbUuid), "Recently lit"); router.push({ pathname: "/climb/[uuid]", params: { uuid: climb.uuid } }); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 64, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                <ClimbThumb climb={climb} size={48} />
                <View style={{ flex: 1 }}>
                  <Text v="climbName" numberOfLines={1}>{climb.name}</Text>
                  <Text v="secondary">{relativeTime(item.createdAt)}</Text>
                </View>
                {label && d != null ? <GradeChip band={grades.band(d)} label={label.primary} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
