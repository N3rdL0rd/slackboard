import { useMemo } from "react";
import { View } from "react-native";
import { cmBetween, formatLength, unitsBetween } from "../core/boardScale";
import { parseFrames } from "../core/frames";
import { estimateMoves, type PlacedHold } from "../core/moveEstimate";
import { surveyBoardId } from "../core/holdSurvey";
import type { BoardSpec, Climb, Placement, Role } from "../core/types";
import { useBoardScale } from "../state/boardScale";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { LinkButton } from "./parts";
import { Text } from "./Text";

/**
 * The measuring tool on the climb screen: the distance between two holds you tap, and a rough read of the climb (hand moves, length of
 * the hand path, longest move). Real lengths need the board's scale, measured once in the hold survey.
 */
export function MeasurePanel({ climb, spec, placements, roles, picks, onClear, onClose }: {
  climb: Climb; spec: BoardSpec; placements: Placement[]; roles: Role[]; picks: number[]; onClear: () => void; onClose: () => void;
}) {
  const unit = useStore((s) => s.settings.units.length);
  const scale = useBoardScale(surveyBoardId(spec.provider, spec.layoutId, spec.productSizeId))?.cmPerUnit ?? null;
  const byId = useMemo(() => new Map(placements.map((p) => [p.id, p])), [placements]);
  const est = useMemo(() => {
    const roleOf = new Map(roles.map((x) => [x.id, x.name]));
    const holds = new Map<number, PlacedHold>();
    for (const f of parseFrames(climb.frames)) {
      f.forEach((roleId, pid) => {
        const p = byId.get(pid);
        if (p) holds.set(pid, { x: p.x, y: p.y, role: roleOf.get(roleId) ?? "middle" });
      });
    }
    return estimateMoves([...holds.values()]);
  }, [climb.frames, roles, byId]);

  const len = (units: number) => (scale === null ? `${Math.round(units)} units` : formatLength(units * scale, unit));
  const a = picks[0] !== undefined ? byId.get(picks[0]) : undefined;
  const b = picks[1] !== undefined ? byId.get(picks[1]) : undefined;

  return (
    <View style={{ marginTop: 10, padding: 14, borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text v="bodyStrong">Measure</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          {picks.length > 0 ? <LinkButton label="Clear" onPress={onClear} /> : null}
          <LinkButton label="Done" onPress={onClose} />
        </View>
      </View>
      <Text v="body" aria-live="polite">
        {a && b ? `A to B: ${scale === null ? `${unitsBetween(a, b).toFixed(1)} board units` : formatLength(cmBetween(a, b, scale), unit)}` : a ? "Tap a second hold." : "Tap two holds on the board."}
      </Text>
      {est ? (
        <Text v="secondary">
          About {est.moves} hand {est.moves === 1 ? "move" : "moves"} · hand path {len(est.pathUnits)} · longest move {len(est.longestUnits)}
        </Text>
      ) : null}
      <Text v="caption">A rough guide: the holds are read in order up the board, and feet are left out.{scale === null ? " To see real lengths, measure this board's scale in the hold survey (Settings > Developer)." : ""}</Text>
    </View>
  );
}
