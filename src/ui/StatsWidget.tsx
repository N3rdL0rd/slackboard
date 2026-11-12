import { useRouter } from "expo-router";
import { Tap } from "./parts";
import { View } from "react-native";
import { gradeColor } from "../core/grades";
import { commonLabel, trendLabel, useOverview } from "../state/stats";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { Sparkline } from "./charts";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** A one-line summary of the logbook for the top of the Climbs tab. Tap for the full stats. */
export function StatsWidget() {
  const router = useRouter();
  const o = useOverview(16);
  const display = useStore((s) => s.settings.gradeDisplay);
  if (o.sends === 0) return null;
  const working = o.working != null ? commonLabel(o.working, display) : null;
  const trend = trendLabel(o);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Your stats. ${o.last30.sends} sends in the last 30 days${working ? `, working grade ${working}` : ""}. Open`}
      onPress={() => router.push("/stats")}
      style={{ marginHorizontal: 16, marginTop: 10, height: 64, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 12 }}>
      <View style={{ minWidth: 86 }}>
        <Text v="numeral" style={{ fontSize: 26 }}>{o.last30.sends}</Text>
        <Text v="caption">sends in 30 days</Text>
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>
        <Sparkline values={o.weeks.map((w) => w.working)} width={96} height={36} />
      </View>
      <View style={{ alignItems: "flex-end", minWidth: 70 }}>
        <Text v="numeral" style={{ fontSize: 26, color: o.working != null ? gradeColor(o.working) : c.text }}>{working ?? "-"}</Text>
        <Text v="caption" numberOfLines={1}>{trend ?? "working grade"}</Text>
      </View>
      <Icon name="chevR" size={18} color={c.muted} />
    </Tap>
  );
}
