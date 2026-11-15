import { useRef } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import { faceWords, snapFace } from "../core/holdSurvey";
import { c } from "../theme";
import { LinkButton } from "./parts";
import { Text } from "./Text";

const SIZE = 200;
const STEP = 15;

/** The direction a hold's useful face points: touch or drag round the circle, straight up is 0 and right is 90, in 15 degree steps. */
export function FaceDial({ value, onChange }: { value: number | null; onChange: (deg: number | null) => void }) {
  const box = useRef({ x: SIZE / 2, y: SIZE / 2 });
  const at = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - box.current.x;
    const dy = locationY - box.current.y;
    if (Math.hypot(dx, dy) < 12) return;
    onChange(snapFace((Math.atan2(dx, -dy) * 180) / Math.PI, STEP));
  };
  const mid = SIZE / 2;
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number, r: number) => ({ x: mid + Math.cos(rad(deg)) * r, y: mid + Math.sin(rad(deg)) * r });
  const tip = value === null ? null : pt(value, 78);
  const head = (deg: number) => pt(deg, 62);
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View
        accessible accessibilityRole="adjustable" accessibilityLabel="Direction the hold faces"
        accessibilityValue={{ text: value === null ? "not set" : `${value} degrees, ${faceWords(value)}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(snapFace((value ?? 0) + (e.nativeEvent.actionName === "increment" ? STEP : -STEP), STEP))}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={at} onResponderMove={at}
        style={{ width: SIZE, height: SIZE }}
      >
        <Svg width={SIZE} height={SIZE} pointerEvents="none">
          <Circle cx={mid} cy={mid} r={92} fill={c.card} stroke={c.lineStrong} strokeWidth={1.5} />
          {Array.from({ length: 360 / STEP }, (_, i) => i * STEP).map((d) => {
            const major = d % 90 === 0;
            const a = pt(d, major ? 76 : 84);
            const b = pt(d, 90);
            return <Line key={d} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={major ? c.text : c.muted} strokeWidth={major ? 2 : 1} />;
          })}
          {tip && value !== null ? (
            <G>
              <Line x1={mid} y1={mid} x2={tip.x} y2={tip.y} stroke={c.btn} strokeWidth={5} strokeLinecap="round" />
              <Path d={`M${tip.x} ${tip.y} L${head(value - 12).x} ${head(value - 12).y} L${head(value + 12).x} ${head(value + 12).y} Z`} fill={c.btn} />
              <Circle cx={mid} cy={mid} r={7} fill={c.btn} />
            </G>
          ) : null}
        </Svg>
        <Text v="caption" style={{ position: "absolute", top: 4, alignSelf: "center" }}>up</Text>
      </View>
      <Text v="bodyStrong" aria-live="polite">{value === null ? "Direction not set" : `Faces ${faceWords(value)} (${value}°)`}</Text>
      {value !== null ? <LinkButton label="Clear the direction" onPress={() => onChange(null)} /> : null}
    </View>
  );
}
