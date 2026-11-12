import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { AppState, ScrollView, View } from "react-native";
import { boardColor } from "../core/boards";
import { nearestSpace, SPACE_RADIUS_KM } from "../core/spaces";
import { setBoardPlace, useSpaces, useSpaceFor } from "../state/spaces";
import { useStore } from "../state/store";
import type { Board } from "../core/types";
import { c, r } from "../theme";
import { Chip, Tap } from "./parts";
import { Text } from "./Text";

const LOCATION_INTERVAL_MS = 5 * 60 * 1000;
let lastLocationRead = 0;

/** One tap changes boards; angles and filters stay with their own board. */
export function SpaceBar({ board }: { board: Board }) {
  const space = useSpaceFor(board.id);
  const setBoard = useStore((s) => s.setBoard);
  if (!space || space.boards.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 8 }}>
      {space.boards.map((b) => (
        <Chip key={b.id} label={b.name} selected={b.id === board.id} onPress={() => setBoard(b.id)} />
      ))}
    </ScrollView>
  );
}

interface Nearby {
  spaceId: string;
  spaceName: string;
  boardId: string;
  boardName: string;
}

/** Detects nearby Spaces on first open/foreground without prompting, blocking, or switching the open board. */
export function ArrivalChip({ board }: { board: Board }) {
  const setBoard = useStore((s) => s.setBoard);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const generation = useRef(0);
  const openId = board.id;
  const ready = useSpaces((s) => s.ready);

  useEffect(() => {
    const ticket = ++generation.current;
    const check = async () => {
      const now = Date.now();
      if (now - lastLocationRead < LOCATION_INTERVAL_MS) return;
      lastLocationRead = now;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const here = { lat: position.coords.latitude, lon: position.coords.longitude };
        // The same 200 m rule is used for grouping and arrival, avoiding a different location model for detection.
        const spaces = useSpaces.getState().spaces;
        const own = spaces.find((s) => s.boards.some((b) => b.id === openId));
        const ownBoard = own?.boards.find((b) => b.id === openId);
        if (ownBoard && !ownBoard.location) await setBoardPlace(openId, { gymName: null, location: here });
        const found = nearestSpace(useSpaces.getState().spaces, here, SPACE_RADIUS_KM, own?.id);
        if (ticket !== generation.current) return;
        if (!found) { setNearby(null); return; }
        const next = found.space.boards.find((b) => b.id === found.boardId)!;
        setNearby({ spaceId: found.space.id, spaceName: found.space.name, boardId: next.id, boardName: next.name });
      } catch {
        // Location is best-effort: a denied, unavailable or slow reading changes nothing on screen.
      }
    };
    void check();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") void check(); });
    return () => { generation.current++; sub.remove(); };
  }, [openId, ready]);

  if (!nearby) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 8, paddingVertical: 8, paddingLeft: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: c.lineStrong }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: boardColor(nearby.boardId) }} />
      <Text v="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>At {nearby.spaceName}: {nearby.boardName}</Text>
      <Tap accessibilityRole="button" accessibilityLabel={`Switch to ${nearby.boardName} at ${nearby.spaceName}`}
        onPress={() => { setBoard(nearby.boardId); setNearby(null); }} style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 10 }}>
        <Text v="bodyStrong">Switch</Text>
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel="Dismiss nearby board" onPress={() => setNearby(null)}
        style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 10 }}>
        <Text v="secondary">Dismiss</Text>
      </Tap>
    </View>
  );
}
