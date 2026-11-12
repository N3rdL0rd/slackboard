import { memo, useMemo } from "react";
import { View } from "react-native";
import { parseFrames } from "../core/frames";
import { difficultyOf, isClassic, type DoneState } from "../core/filters";
import type { GradeDisplay } from "../core/grades";
import { isRoute, type AngleStat, type BoardSpec, type Climb, type Placement, type Role } from "../core/types";
import { grades } from "../data/grades";
import { c, r } from "../theme";
import { BoardView } from "./BoardView";
import { ClassicTag, GradeChip, Stars, Tap } from "./parts";
import { Icon } from "./Icon";
import { Text } from "./Text";

export const ClimbRow = memo(function ClimbRow({ climb, stat, spec, placements, roles, done, display, onPress, shapes, highContrast, draft, note, liked }: {
  climb: Climb; stat: AngleStat | undefined; spec: BoardSpec; placements: Placement[]; roles: Role[]; done: DoneState;
  display: GradeDisplay; onPress: (uuid: string) => void; shapes: boolean; highContrast: boolean; draft?: boolean;
  /** Extra text after the setter, such as which board a suggestion is for. */
  note?: string;
  /** The user liked this climb: a filled heart sits beside the name. */
  liked?: boolean;
}) {
  const d = difficultyOf(stat);
  const route = isRoute(climb);
  const label = d != null ? grades.label(d, display, route) : null;
  const frame = useMemo(() => parseFrames(climb.frames)[0], [climb.frames]);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${climb.name}, ${label ? label.primary : draft ? "draft" : "project"}${liked ? ", liked" : ""}`}
      onPress={() => onPress(climb.uuid)}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}
    >
      <View style={{ width: 64, height: 64, borderRadius: r.thumb, overflow: "hidden", backgroundColor: c.board, alignItems: "center", justifyContent: "center" }}>
        <BoardView bare spec={spec} placements={placements} roles={roles} width={60} frame={frame} shapes={shapes} highContrast={highContrast} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text v="climbName" numberOfLines={1} style={{ flexShrink: 1 }}>{climb.name}</Text>
          {liked ? <Icon name="heart" size={16} color={c.danger} filled /> : null}
        </View>
        <Text v="secondary" numberOfLines={1}>
          {climb.setter}{note ? ` · ${note}` : ""}{stat && stat[2] > 0 ? ` · ${stat[2]} ${stat[2] === 1 ? "send" : "sends"}` : ""}
        </Text>
        {stat ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {stat[2] > 0 ? <Stars value={stat[3]} /> : null}
            {isClassic(stat) && <ClassicTag />}
            {route && <Text v="caption" style={{ color: c.text2 }}>Route · {climb.frameCount} frames</Text>}
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 3, minWidth: 56 }}>
        {label && d != null ? (
          <>
            <GradeChip band={grades.band(d)} label={label.primary} />
            {label.secondary ? <Text v="caption">{label.secondary}</Text> : null}
          </>
        ) : (
          <Text v="bodyStrong" style={{ color: c.muted }}>{draft ? "Draft" : "Project"}</Text>
        )}
        {done ? <Text v="caption" style={{ color: c.text2 }}>{done === "sent" ? "Sent" : "Tried"}</Text> : null}
      </View>
    </Tap>
  );
});
