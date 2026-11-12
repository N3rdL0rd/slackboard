import { useRouter } from "expo-router";
import { View } from "react-native";
import { gradeColor } from "../core/grades";
import { commonLabel, useOverview } from "../state/stats";
import { useStore } from "../state/store";
import { c } from "../theme";
import { Icon } from "./Icon";
import { Spinner, Tap } from "./parts";
import { Text } from "./Text";

/** The line under the search field: your last 30 days and working grade (tap for Stats), how many climbs the list holds, and the filters that are on. */
export function ClimbSummary({ total, loading, pending, filterCount, onFilters, onReset }: {
  total: number;
  loading: boolean;
  pending: boolean;
  filterCount: number;
  onFilters: () => void;
  onReset: () => void;
}) {
  const router = useRouter();
  const o = useOverview(16);
  const display = useStore((s) => s.settings.gradeDisplay);
  const working = o.working != null ? commonLabel(o.working, display) : null;
  const count = loading ? " " : pending ? "Updating" : `${total.toLocaleString("en-US")} climbs`;
  const counts = (
    <>
      {pending ? <Spinner /> : null}
      <Text v="caption" numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, color: c.text2 }}>{count}</Text>
    </>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10, minHeight: 44 }}>
      {o.sends > 0 ? (
        <Tap accessibilityRole="button" accessibilityLabel={`Your stats. ${o.last30.sends} sends in the last 30 days${working ? `, working grade ${working}` : ""}. Open`}
          onPress={() => router.push("/stats")} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}>
          <Text v="numeral" style={{ fontSize: 20 }}>{o.last30.sends}</Text>
          <Text v="caption" style={{ fontSize: 14, color: c.text2 }}>sends</Text>
          {working ? <Text v="numeral" style={{ fontSize: 20, color: gradeColor(o.working!) }}>{working}</Text> : null}
          {working ? <Text v="caption" style={{ fontSize: 14, color: c.text2 }}>working</Text> : null}
          <Text v="caption" style={{ color: c.muted }}>·</Text>
          {counts}
          <Icon name="chevR" size={16} color={c.muted} />
        </Tap>
      ) : (
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }}>{counts}</View>
      )}
      {filterCount > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", height: 36, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
          <Tap accessibilityRole="button" accessibilityLabel={`${filterCount} filters on. Change`} onPress={onFilters} style={{ height: 36, justifyContent: "center", paddingLeft: 12, paddingRight: 6 }}>
            <Text v="bodyStrong" style={{ fontSize: 14 }}>{filterCount} {filterCount === 1 ? "filter" : "filters"}</Text>
          </Tap>
          <Tap accessibilityRole="button" accessibilityLabel="Reset filters" onPress={onReset} style={{ height: 36, width: 32, alignItems: "center", justifyContent: "center", marginRight: 2 }}>
            <Icon name="close" size={14} color={c.text} />
          </Tap>
        </View>
      ) : null}
    </View>
  );
}
