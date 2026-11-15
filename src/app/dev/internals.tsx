import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { climbingDays } from "../../core/activity";
import { addDays, weekStartDay } from "../../core/days";
import { fixed } from "../../core/devFormat";
import { LOAD, baselineLoad, isSpike, loadByDay, weekLoad } from "../../core/load";
import { LOCAL_SCHEMA_VERSION, localTables, storedLocalVersion } from "../../core/localMigrations";
import { milestoneCandidates, pickMilestone } from "../../core/milestones";
import { ropedWorking } from "../../core/roped";
import { ropedAsV } from "../../core/ropedEquivalence";
import { streakInfo } from "../../core/streak";
import { getLocalDb } from "../../data/sqlite";
import { commonLabel, useOverview } from "../../state/stats";
import { useStore } from "../../state/store";
import { useCurrentPlan } from "../../state/planner";
import { useRopedLogs } from "../../state/roped";
import { useActivities, useToday, useWorkingGrades } from "../../state/today";
import { IconButton, SectionLabel } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { DevRow } from "../../ui/dev/DevRow";
import { c, r } from "../../theme";

function Card({ children }: { children: React.ReactNode }) {
  return <View style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 12, gap: 2 }}>{children}</View>;
}

/** The numbers the app works out from your data, with the reasons, read-only. For checking that they are right. */
export default function Internals() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const activities = useActivities();
  const working = useWorkingGrades();
  const overview = useOverview(8);
  const settings = useStore((s) => s.settings);
  const roped = useRopedLogs();
  const plan = useCurrentPlan();
  const display = settings.gradeDisplay;

  const streak = useMemo(() => streakInfo(climbingDays(activities), today), [activities, today]);
  const byDay = useMemo(() => loadByDay(activities, working), [activities, working]);
  const weekStart = weekStartDay(today);
  const candidates = useMemo(() => milestoneCandidates({ activities, today, streak }), [activities, today, streak]);
  const picked = useMemo(() => pickMilestone(candidates, today), [candidates, today]);
  const ropedW = ropedWorking(roped, new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i));

  const [counts, setCounts] = useState<{ name: string; n: number }[] | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      const db = await getLocalDb();
      setVersion(await storedLocalVersion(db));
      const out: { name: string; n: number }[] = [];
      for (const t of localTables()) {
        const row = (await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t.name}`))[0];
        out.push({ name: t.name, n: row?.n ?? 0 });
      }
      setCounts(out);
    })();
  }, []);

  const w = (g: number | null) => (g === null ? "none" : `${commonLabel(g, display)} (${fixed(g, 2)})`);
  const planCounts = plan ? plan.sessions.reduce<Record<string, number>>((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {}) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Internal values</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 + insets.bottom }}>
        <SectionLabel>Streak</SectionLabel>
        <DevRow label="Today" value={today} />
        <DevRow label="State" value={streak.state} wide />
        <DevRow label="Current" value={`${streak.current} climbing days over ${streak.span}`} wide />
        <DevRow label="Longest" value={`${streak.longest} over ${streak.longestSpan}`} wide />
        <DevRow label="Last day" value={streak.lastDay ?? "none"} wide />
        <DevRow label="Deadline" value={streak.deadline ?? "none"} hint="last day that keeps it" wide />

        <SectionLabel>Working grade</SectionLabel>
        <DevRow label="Boulder (shared)" value={w(overview.working)} hint={`trend ${overview.trend === null ? "none" : fixed(overview.trend, 2)}`} wide />
        <DevRow label="Per discipline" value={`boulder ${working.boulder == null ? "none" : fixed(working.boulder, 2)}, roped ${working.roped == null ? "none" : fixed(working.roped, 1)}`} wide />
        <DevRow label="Roped (IRCRA)" value={ropedW === null ? "none" : fixed(ropedW, 2)} hint={ropedW === null ? undefined : `as V ${fixed(ropedAsV(ropedW, settings.ropedEquivalence), 2)}`} wide />
        <DevRow label="Count roped" value={settings.ropedWorking ? `on, pair ${settings.ropedEquivalence.ircra} = V${settings.ropedEquivalence.v}` : "off"} wide />
        <DevRow label="Sends, tries" value={`${overview.sends}, ${overview.attempts}`} hint={`flash ${overview.flashRate === null ? "-" : Math.round(overview.flashRate * 100)}%`} wide />
        <DevRow label="Hardest" value={overview.hardest ? `${overview.hardest.name}, ${commonLabel(overview.hardest.grade, display)}` : "none"} wide />

        <SectionLabel>Load model</SectionLabel>
        <DevRow label="This week" value={fixed(weekLoad(byDay, weekStart), 1)} wide />
        <DevRow label="Usual week" value={fixed(baselineLoad(byDay, weekStart), 1)} hint={`floor ${LOAD.baselineFloor ?? "?"}`} wide />
        <DevRow label="Spike" value={isSpike(byDay, weekStart) ? "yes" : "no"} wide />
        {days.map((d) => <DevRow key={d} label={d} value={`${fixed(byDay.get(d) ?? 0, 2)}`} hint={`${activities.filter((a) => a.day === d).length} entries`} />)}

        <SectionLabel>Milestone</SectionLabel>
        <DevRow label="Chosen" value={picked ? picked.text : "none"} wide />
        {candidates.slice(0, 12).map((m) => (
          <Card key={m.id}>
            <Text v="bodyStrong">{m.text}</Text>
            <Text v="caption">{m.kind} · {m.current} of {m.target} · {Math.round(m.progress * 100)}%{m.id === picked?.id ? " · chosen" : ""}</Text>
            <Text v="caption">{m.why}</Text>
          </Card>
        ))}
        {candidates.length === 0 ? <Text v="secondary">No candidates.</Text> : null}

        <SectionLabel>Plan</SectionLabel>
        {plan ? (
          <>
            <DevRow label="Status" value={plan.status} wide />
            <DevRow label="Starts" value={plan.startDay} wide />
            <DevRow label="Block" value={`${plan.block.kind}, ${plan.block.weeks} weeks, emphasis ${plan.block.emphasis}`} wide />
            <DevRow label="Sessions" value={Object.entries(planCounts ?? {}).map(([k, v]) => `${v} ${k}`).join(", ")} wide />
          </>
        ) : <Text v="secondary">No plan.</Text>}

        <SectionLabel>Settings</SectionLabel>
        <Card><Text v="caption" selectable>{JSON.stringify(settings, null, 1)}</Text></Card>

        <SectionLabel>Local data</SectionLabel>
        <DevRow label="Schema version" value={version === null ? "..." : `${version} (this build ${LOCAL_SCHEMA_VERSION})`} wide />
        {counts?.map((t) => <DevRow key={t.name} label={t.name.replace(/^l_/, "")} value={String(t.n)} />)}
      </ScrollView>
    </View>
  );
}
