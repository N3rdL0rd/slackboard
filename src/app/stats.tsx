import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gradeColor } from "../core/grades";
import { WORKING_WINDOW } from "../core/stats";
import { grades } from "../data/grades";
import { commonLabel, trendLabel, useOverview } from "../state/stats";
import { useStore } from "../state/store";
import { useOutsideLogs } from "../state/outside";
import { ProgressionChart, VolumeBars } from "../ui/charts";
import { IconButton, Segmented, SectionLabel, SwitchRow } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

type Range = "13" | "26" | "52" | "all";
const RANGES: { value: Range; label: string }[] = [{ value: "13", label: "3 mo" }, { value: "26", label: "6 mo" }, { value: "52", label: "1 yr" }, { value: "all", label: "All" }];

/** What you have done: totals, grade progression, weekly volume and a grade pyramid. */
export default function Stats() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const display = useStore((s) => s.settings.gradeDisplay);
  const includeOff = useStore((s) => s.settings.statsOffBoard !== false);
  const patchSettings = useStore((s) => s.patchSettings);
  const offCount = useOutsideLogs().length;
  const [range, setRange] = useState<Range>("26");
  const o = useOverview(range === "all" ? 100000 : Number(range));
  const label = (g: number) => commonLabel(g, display);
  const trend = trendLabel(o);
  const w = width - 32 - 24;
  const maxGrade = Math.max(1, ...o.byGrade.map((g) => g.sends));
  const pct = (x: number | null) => (x == null ? "-" : `${Math.round(x * 100)}%`);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="screenTitle" style={{ flex: 1 }}>Your stats</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}>
        {o.sends === 0 && o.attempts === 0 ? (
          <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing logged yet</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>Log a send or an attempt from any climb and your progress shows up here.</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Tile label="Sends" value={String(o.sends)} />
              <Tile label="Attempts" value={String(o.attempts)} />
              <Tile label="Sessions" value={String(o.sessions)} />
              <Tile label="Flash rate" value={pct(o.flashRate)} />
              <Tile label="Different climbs" value={String(o.uniqueClimbs)} />
              <Tile label="Week streak" value={String(o.streakWeeks)} />
            </View>

            {o.hardest && (
              <View style={{ marginTop: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text v="caption">Hardest send</Text>
                  <Text v="climbName" numberOfLines={1}>{o.hardest.name}</Text>
                  <Text v="caption">{o.hardest.climbedAt.slice(0, 10)} at {o.hardest.angle}°</Text>
                </View>
                <Text v="numeral" style={{ fontSize: 34, color: gradeColor(o.hardest.grade) }}>{label(o.hardest.grade)}</Text>
              </View>
            )}

            {offCount > 0 ? (
              <View style={{ marginTop: 12, paddingHorizontal: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
                <SwitchRow label="Include gym and outdoor climbs" help={"Counted with your board sends. Outdoor counts +1 V and gym \u22120.5 V."} value={includeOff} onChange={(v) => patchSettings({ statsOffBoard: v })} />
              </View>
            ) : null}

            <SectionLabel>Progression</SectionLabel>
            <Segmented<Range> options={RANGES} value={range} onChange={setRange} />
            <View style={{ marginTop: 12, padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <Text v="numeral" style={{ fontSize: 30, color: o.working != null ? gradeColor(o.working) : c.text }}>{o.working != null ? label(o.working) : "-"}</Text>
                <Text v="caption" style={{ flex: 1 }}>{trend ?? "working grade"}</Text>
              </View>
              <ProgressionChart weeks={o.weeks} width={w} height={190} label={label} />
              <Text v="caption" style={{ marginTop: 6 }}>
                The line is your working grade: the average of your three hardest sends over {WORKING_WINDOW} weeks. Dots are each week's hardest send.
              </Text>
            </View>

            <SectionLabel>Sends per week</SectionLabel>
            <View style={{ padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <VolumeBars weeks={o.weeks} width={w} height={90} />
              <Text v="caption" style={{ marginTop: 6 }}>Last 30 days: {o.last30.sends} sends over {o.last30.sessions} {o.last30.sessions === 1 ? "session" : "sessions"}.</Text>
            </View>

            <SectionLabel>Sends by grade</SectionLabel>
            <View style={{ padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 8 }}>
              {[...o.byGrade].reverse().map((g) => (
                <View key={g.v} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text v="bodyStrong" style={{ width: 36, color: gradeColor(g.v) }}>V{g.v}</Text>
                  <View style={{ flex: 1, height: 16, justifyContent: "center" }}>
                    <View style={{ width: `${Math.max(3, (g.sends / maxGrade) * 100)}%`, height: 16, borderRadius: 4, backgroundColor: grades.band(grades.rangeForV(g.v, g.v)[0]).bar }} />
                  </View>
                  <Text v="secondary" style={{ width: 36, textAlign: "right" }}>{g.sends}</Text>
                </View>
              ))}
              {o.byGrade.length === 0 ? <Text v="secondary">Grades appear once you log a send with a grade.</Text> : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "31%", flexGrow: 1, padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text v="numeral" style={{ fontSize: 28 }}>{value}</Text>
      <Text v="caption" numberOfLines={1}>{label}</Text>
    </View>
  );
}
