import { useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { adviceText, angleAdvice, angleSamples, RESULT_LABEL, SETTING_LABEL, WALL_STYLES, wallStyle, type OutsideLog } from "../core/outside";
import { bandForV, gradeColor } from "../core/grades";
import { shortDate } from "../core/shareCard";
import { useData } from "../state/data";
import { useOutsideLogs } from "../state/outside";
import { gradeOfEntry } from "../state/stats";
import { Button, GradeChip, IconButton, Tap } from "../ui/parts";
import { Icon } from "../ui/Icon";
import { JumpList } from "../ui/JumpToTop";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const vLabel = (shared: number) => `V${Math.floor(shared)}`;

const resultLine = (l: OutsideLog) => (l.result === "attempt" ? `${l.attempts} ${l.attempts === 1 ? "attempt" : "attempts"}` : l.result === "flash" ? RESULT_LABEL.flash : `Sent in ${l.attempts}`);

function Row({ log, onPress }: { log: OutsideLog; onPress: () => void }) {
  const place = [SETTING_LABEL[log.setting], log.venue, shortDate(log.climbedAt)].filter(Boolean).join(" \u00B7 ");
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${log.name || wallStyle(log.wall).label}, ${log.gradeLabel ?? "no grade"}, ${resultLine(log)}`} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text v="climbName" numberOfLines={1}>{log.name || wallStyle(log.wall).label}</Text>
        <Text v="secondary" numberOfLines={1}>{log.name ? `${wallStyle(log.wall).label} \u00B7 ` : ""}{place}</Text>
        {log.tags.length ? <Text v="caption" numberOfLines={1}>{log.tags.join(", ")}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 3, minWidth: 64 }}>
        {log.gradeLabel && log.grade != null ? <GradeChip band={bandForV(Math.floor(log.grade))} label={log.gradeLabel} /> : <Text v="bodyStrong" style={{ color: c.muted }}>No grade</Text>}
        <Text v="caption" style={{ color: c.text2 }}>{resultLine(log)}</Text>
      </View>
      {log.link ? <Icon name="share" size={18} color={c.muted} /> : null}
    </Tap>
  );
}

/** Climbs logged off the boards, and what together with the board sends they say about each wall angle. */
export default function OffBoard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logs = useOutsideLogs();
  const logbook = useData((d) => d.logbook);
  const advice = useMemo(() => angleAdvice(angleSamples(logbook, logs, gradeOfEntry), new Date()), [logbook, logs]);
  const sends = logs.filter((l) => l.result !== "attempt").length;
  const flashes = logs.filter((l) => l.result === "flash").length;
  const maxV = Math.max(1, ...(advice?.buckets.map((b) => b.working) ?? [1]));

  const header = (
    <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {([["Climbs", logs.length], ["Sends", sends], ["Flashes", flashes]] as const).map(([l, n]) => (
          <View key={l} style={{ flex: 1, backgroundColor: c.card, borderRadius: r.card, padding: 12, borderWidth: 1, borderColor: c.line }}>
            <Text v="numeral" style={{ fontSize: 34 }}>{n}</Text>
            <Text v="caption">{l}</Text>
          </View>
        ))}
      </View>
      <View style={{ backgroundColor: c.card, borderRadius: r.card, padding: 14, borderWidth: 1, borderColor: c.line, gap: 8 }}>
        <Text v="section">Your grade by wall angle</Text>
        {advice ? (
          <>
            {WALL_STYLES.map((w) => {
              const b = advice.buckets.find((x) => x.style === w.id);
              return (
                <View key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text v="secondary" style={{ width: 118 }}>{w.label}</Text>
                  {b ? <View style={{ height: 14, width: `${(b.working / maxV) * 52}%`, backgroundColor: bandForV(Math.floor(b.working)).bar, borderRadius: 4 }} /> : null}
                  {b ? <Text v="caption"><Text v="caption" style={{ color: gradeColor(b.working), fontFamily: "Barlow_600SemiBold" }}>{vLabel(b.working)}</Text>{` \u00B7 ${b.sends}`}</Text> : <Text v="caption">not enough sends</Text>}
                </View>
              );
            })}
            <Text v="secondary">{adviceText(advice, vLabel)}</Text>
            <Text v="caption">Your three hardest sends per angle, boards and here together. Outdoor counts +1 V, gym \u22120.5 V.</Text>
          </>
        ) : (
          <Text v="secondary">Three sends at each of two wall angles shows where you are strongest.</Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Off-board climbs</Text>
        <IconButton icon="plus" label="Log a climb" onPress={() => router.push("/outside")} />
      </View>
      <JumpList
        data={logs}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing logged yet</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>Gym problems and outdoor boulders go here, as sends, flashes or just attempts.</Text>
            <Button label="Log a climb" onPress={() => router.push("/outside")} />
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => <Row log={item} onPress={() => router.push({ pathname: "/outside", params: { id: item.id } })} />}
      />
    </View>
  );
}
