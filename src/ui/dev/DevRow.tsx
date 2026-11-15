import { View } from "react-native";
import { c } from "../../theme";
import { Text } from "../Text";

/** One labelled value in a developer list. */
export function DevRow({ label, value, hint, wide }: { label: string; value: string; hint?: string; wide?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text v="secondary" style={{ width: wide ? 160 : 120 }}>{label}</Text>
      <Text v="bodyStrong" style={{ flex: 1 }}>{value}</Text>
      {hint ? <Text v="caption" style={{ maxWidth: 140 }}>{hint}</Text> : null}
    </View>
  );
}
