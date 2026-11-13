import { useRouter } from "expo-router";
import { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { describeRoped, fromMetres, ropedStats, ropedTitle, ROPED_WEEKS_SHOWN, type RopedLog } from "../core/roped";
import { shortDate } from "../core/shareCard";
import { ropedBand, ropedLabel } from "../data/ropedGrades";
import { useRopedLogs } from "../state/roped";
import { useStore } from "../state/store";
import { Button, GradeChip, IconButton, Tap } from "../ui/parts";
import { Sparkline } from "../ui/charts";
import { JumpList } from "../ui/JumpToTop";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

function Row({ log, onPress }: { log: RopedLog; onPress: () => void }) {
  const place = [log.venue, shortDate(log.climbedAt)].filter(Boolean).join(" \u00B7 ");
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${ropedTitle(log)}, ${log.gradeLabel}, ${describeRoped(log)}`} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text v="climbName" numberOfLines={1}>{ropedTitle(log)}</Text>
        <Text v="secondary" numberOfLines={1}>{describeRoped(log)}</Text>
        <Text v="caption" numberOfLines={1}>{place}</Text>
      </View>
      <GradeChip band={ropedBand(log.grade)} label={log.gradeLabel} />
    </Tap>
  );
}

/** The roped climbs the user has logged, and what they say: routes, hardest send, the pyramid by result, and the last weeks. */
export default function RopedClimbs() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logs = useRopedLogs();
  const unit = useStore((s) => s.settings.units.length);
  const stats = useMemo(() => ropedStats(logs, new Date()), [logs]);
  const last = logs[0];
  // The notation the user used last is the one the pyramid is labelled in.
  const system = last?.gradeSystem ?? "yds";
  const label = (value: number) => ropedLabel(value, system) ?? "";
  const rows = [...stats.pyramid].reverse().slice(0, 12);
  const mostAtGrade = Math.max(1, ...rows.map((p) => p.onsight + p.flash + p.redpoint));
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.routes));
  const chartW = width - 32 - 28;
  const length = stats.metres > 0 ? `${fromMetres(stats.metres, unit).toLocaleString("en-US")} ${unit === "ft" ? "ft" : "m"}` : "-";

  const header = (
    <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {([["Routes", String(stats.routes)], ["Pitches", String(stats.pitches)], ["Length", length]] as const).map(([l, n]) => (
          <View key={l} style={{ flex: 1, backgroundColor: c.card, borderRadius: r.card, padding: 12, borderWidth: 1, borderColor: c.line }}>
            <Text v="numeral" style={{ fontSize: 30 }} numberOfLines={1} adjustsFontSizeToFit>{n}</Text>
            <Text v="caption">{l}</Text>
          </View>
        ))}
      </View>
      {last ? (
        <Button label={`Another at ${last.gradeLabel}`} onPress={() => router.push({ pathname: "/roped", params: { repeat: last.id } })} />
      ) : null}
      {stats.hardest ? (
        <View style={{ backgroundColor: c.card, borderRadius: r.card, padding: 14, borderWidth: 1, borderColor: c.line, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <GradeChip band={ropedBand(stats.hardest.grade)} label={label(stats.hardest.grade)} large />
            <View style={{ flex: 1 }}>
              <Text v="section">Hardest send</Text>
              <Text v="caption">{stats.onsights} onsights, {stats.flashes} flashes, {stats.sends} {stats.sends === 1 ? "send" : "sends"} in all</Text>
            </View>
          </View>
        </View>
      ) : null}
      {rows.length ? (
        <View style={{ backgroundColor: c.card, borderRadius: r.card, padding: 14, borderWidth: 1, borderColor: c.line, gap: 8 }}>
          <Text v="section">Sends by grade</Text>
          {rows.map((p) => {
            const total = p.onsight + p.flash + p.redpoint;
            const bar = ropedBand(p.grade).bar;
            const unitW = (chartW - 120) / mostAtGrade;
            return (
              <View key={p.grade} accessible accessibilityLabel={`${label(p.grade)}: ${p.onsight} onsight, ${p.flash} flash, ${p.redpoint} redpoint`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text v="bodyStrong" style={{ width: 52, color: bar }}>{label(p.grade)}</Text>
                <View style={{ flexDirection: "row", height: 14, borderRadius: 4, overflow: "hidden" }}>
                  {p.onsight ? <View style={{ width: p.onsight * unitW, backgroundColor: bar }} /> : null}
                  {p.flash ? <View style={{ width: p.flash * unitW, backgroundColor: bar, opacity: 0.75 }} /> : null}
                  {p.redpoint ? <View style={{ width: p.redpoint * unitW, backgroundColor: bar, opacity: 0.5 }} /> : null}
                </View>
                <Text v="caption">{total}</Text>
              </View>
            );
          })}
          <Text v="caption">Brightest is onsight, then flash, then redpoint. Each autobelay lap counts once.</Text>
        </View>
      ) : null}
      {stats.sends > 0 ? (
        <View style={{ backgroundColor: c.card, borderRadius: r.card, padding: 14, borderWidth: 1, borderColor: c.line, gap: 10 }}>
          <Text v="section">Last {ROPED_WEEKS_SHOWN} weeks</Text>
          <View accessible accessibilityLabel={`Routes per week: ${stats.weeks.map((w) => w.routes).join(", ")}`} style={{ flexDirection: "row", alignItems: "flex-end", height: 64, gap: 4 }}>
            {stats.weeks.map((w) => (
              <View key={w.start} style={{ flex: 1, height: Math.max(3, (w.routes / maxWeek) * 64), borderRadius: 3, backgroundColor: w.routes ? c.text : c.raised }} />
            ))}
          </View>
          <Text v="caption">Routes per week. Most in a week: {Math.max(...stats.weeks.map((w) => w.routes))}.</Text>
          {stats.weeks.filter((w) => w.hardest != null).length >= 2 ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Sparkline values={stats.weeks.map((w) => w.hardest)} width={chartW} height={48} /></View>
          ) : null}
          <Text v="caption">{(() => {
            const hardest = stats.weeks[stats.weeks.length - 1].hardest;
            const now = hardest != null ? label(hardest) : null;
            if (stats.weeks.filter((w) => w.hardest != null).length >= 2) return `Hardest send each week${now ? `, this week ${now}` : ""}.`;
            return `${now ? `Hardest send this week: ${now}. ` : ""}A line of your hardest send each week appears once two weeks have a send.`;
          })()}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Roped climbs</Text>
        <IconButton icon="plus" label="Log a roped climb" onPress={() => router.push("/roped")} />
      </View>
      <JumpList
        data={logs}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing logged yet</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>Sport, trad, top rope and autobelay climbs go here, graded in YDS or French. They stay on this phone.</Text>
            <Button label="Log a roped climb" onPress={() => router.push("/roped")} />
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => <Row log={item} onPress={() => router.push({ pathname: "/roped", params: { id: item.id } })} />}
      />
    </View>
  );
}
