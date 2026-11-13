import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { c } from "../theme";
import { Text } from "./Text";

/** A ring that fills as a goal gets nearer. A label (a count, say) sits in the middle. It only shows progress; it never changes colour to warn. */
export function ProgressRing({ progress, size = 44, stroke = 5, label, color = c.text }: { progress: number; size?: number; stroke?: number; label?: string; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.raised} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ * p} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {label ? <Text v="numeral" style={{ fontSize: size * 0.34 }}>{label}</Text> : null}
    </View>
  );
}
