import { View } from "react-native";
import { c, r } from "../theme";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Tap } from "./parts";
import { Text } from "./Text";

/** A value with a minus and a plus beside it: the fast way to adjust a number between sets. */
export function Stepper({ label, value, onChange, min, max, step }: {
  label: string; value: string; onChange: (direction: 1 | -1) => void; min?: boolean; max?: boolean; step?: string;
}) {
  const btn = (dir: 1 | -1, off: boolean | undefined) => (
    <Tap
      accessibilityRole="button" accessibilityLabel={`${dir === 1 ? "More" : "Less"} ${label}${step ? `, ${step}` : ""}`} disabled={off}
      onPress={() => { haptic.light(); onChange(dir); }}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: c.raised, borderWidth: 1, borderColor: c.line, opacity: off ? 0.35 : 1 }}>
      <Icon name={dir === 1 ? "plus" : "minus"} size={20} color={c.text} />
    </Tap>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 }} accessible accessibilityLabel={`${label} ${value}`}
      accessibilityActions={[{ name: "increment", label: `More ${label}` }, { name: "decrement", label: `Less ${label}` }]}
      onAccessibilityAction={(e) => onChange(e.nativeEvent.actionName === "increment" ? 1 : -1)}>
      <Text v="secondary" style={{ width: 70 }}>{label}</Text>
      {btn(-1, min)}
      <Text v="numeral" style={{ flex: 1, textAlign: "center", fontSize: 30 }}>{value}</Text>
      {btn(1, max)}
    </View>
  );
}
