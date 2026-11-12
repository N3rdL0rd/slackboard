import { View } from "react-native";
import { parseFrames } from "../core/frames";
import type { Climb } from "../core/types";
import { useGeometry } from "../state/layouts";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { BoardView } from "./BoardView";

/** A small picture of a climb's holes. Works for any climb, including ones from another layout. */
export function ClimbThumb({ climb, size = 56, provider }: { climb: Climb; size?: number; provider?: string }) {
  const geo = useGeometry(climb, provider);
  const settings = useStore((s) => s.settings);
  return (
    <View style={{ width: size, height: size, borderRadius: r.thumb, overflow: "hidden", backgroundColor: c.board, alignItems: "center", justifyContent: "center" }}>
      {geo ? <BoardView bare spec={geo.spec} placements={geo.placements} roles={geo.roles} width={size - 4} frame={parseFrames(climb.frames)[0]} shapes={settings.shapes} highContrast={settings.highContrast} /> : null}
    </View>
  );
}
