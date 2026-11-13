import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shortDate } from "../core/goals";
import { bandForV } from "../core/grades";
import { latestYear, yearlyReview, yearsWithEntries } from "../core/review";
import { ropedBand } from "../data/ropedGrades";
import { useGoalLabels, useGoals } from "../state/goals";
import { useActivities, useToday } from "../state/today";
import { Sparkline } from "../ui/charts";
import { Figure, ReviewCard } from "../ui/ReviewCard";
import { IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c } from "../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate();

/** Bars for a grade pyramid: each row is a grade, its length the number of sends. */
function Pyramid({ rows, width }: { rows: { grade: number; count: number; label: string; color: string }[]; width: number }) {
  const max = Math.max(1, ...rows.map((x) => x.count));
  return (
    <View style={{ gap: 4 }}>
      {rows.slice(0, 10).map((x) => (
        <View key={x.grade} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text v="bodyStrong" style={{ width: 56, color: x.color }}>{x.label}</Text>
          <View style={{ height: 14, borderRadius: 4, width: Math.max(6, ((width - 56 - 40) * x.count) / max), backgroundColor: x.color }} />
          <Text v="secondary">{x.count}</Text>
        </View>
      ))}
    </View>
  );
}

/** The year in review: totals, the grade pyramid, a month-by-month heatmap of climbing days, your best week, top climbs and landmarks. */
export default function YearReview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const today = useToday();
  const activities = useActivities();
  const goals = useGoals();
  const labels = useGoalLabels();
  const years = useMemo(() => yearsWithEntries(activities), [activities]);
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? latestYear(activities, today);
  const y = useMemo(() => yearlyReview({ activities, goals, year, labels }), [activities, goals, year, labels]);
  const older = years.filter((v) => v < year).slice(-1)[0];
  const newer = years.filter((v) => v > year)[0];
  const inner = width - 32 - 32;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{`${year} in review`}</Text>
        <IconButton icon="chevL" label="Earlier year" onPress={() => older && setPicked(older)} color={older ? c.text : c.muted} />
        <IconButton icon="chevR" label="Later year" onPress={() => newer && setPicked(newer)} color={newer ? c.text : c.muted} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 + insets.bottom }}>
        {y.empty ? <Text v="body">Nothing logged in {year}.</Text> : (
          <>
            <ReviewCard title="Totals">
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Figure value={y.days} label="days" />
                <Figure value={y.sends} label="sends" />
                <Figure value={y.attempts} label="tries" />
              </View>
              <Text v="secondary">{[`${y.byKind.board} on boards`, `${y.byKind.offBoard} gym and outdoor`, `${y.byKind.roped} roped`, `${y.byKind.training} training`].join(" \u00B7 ")}</Text>
            </ReviewCard>

            {y.pyramid.boulder.length ? <ReviewCard title="Boulder grades"><Pyramid width={inner} rows={y.pyramid.boulder.map((p) => ({ ...p, label: labels.boulder(p.grade), color: bandForV(p.grade).bar }))} /></ReviewCard> : null}
            {y.pyramid.roped.length ? <ReviewCard title="Roped grades"><Pyramid width={inner} rows={y.pyramid.roped.map((p) => ({ ...p, label: labels.roped(p.grade), color: ropedBand(p.grade).bar }))} /></ReviewCard> : null}

            <ReviewCard title="Days you climbed">
              <View style={{ gap: 3 }} accessibilityLabel={`Climbing days by month: ${y.months.map((m) => `${MONTHS[m.month - 1]} ${m.days.length}`).join(", ")}`}>
                {y.months.map((m) => (
                  <View key={m.month} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text v="caption" style={{ width: 30 }}>{MONTHS[m.month - 1]}</Text>
                    <View style={{ flexDirection: "row", gap: 1 }}>
                      {Array.from({ length: daysIn(year, m.month) }, (_, i) => (
                        <View key={i} style={{ width: Math.max(5, Math.floor((inner - 36 - 31) / 31)), height: 10, borderRadius: 2, backgroundColor: m.days.includes(i + 1) ? c.starOn : c.raised }} />
                      ))}
                    </View>
                  </View>
                ))}
              </View>
              <Text v="secondary">{`Longest streak: ${y.longestStreak} ${y.longestStreak === 1 ? "day" : "days"}`}</Text>
              {y.bestWeek ? <Text v="secondary">{`Best week: ${shortDate(y.bestWeek.weekStart)}, ${y.bestWeek.days} ${y.bestWeek.days === 1 ? "day" : "days"}, ${y.bestWeek.sends} ${y.bestWeek.sends === 1 ? "send" : "sends"}`}</Text> : null}
            </ReviewCard>

            {y.progression.filter((v) => v !== null).length >= 2 ? (
              <ReviewCard title="Hardest boulder each month">
                <Sparkline values={y.progression} width={inner} height={64} />
              </ReviewCard>
            ) : null}

            {y.hardestBoulder || y.hardestRoped ? (
              <ReviewCard title="Hardest sends">
                {y.hardestBoulder ? <Text v="body">{`${labels.boulder(y.hardestBoulder.grade)} boulder, ${shortDate(y.hardestBoulder.day)}`}</Text> : null}
                {y.hardestRoped ? <Text v="body">{`${labels.roped(y.hardestRoped.grade)} route, ${shortDate(y.hardestRoped.day)}`}</Text> : null}
              </ReviewCard>
            ) : null}

            {y.topClimbs.length || y.topPlace ? (
              <ReviewCard title="Favourites">
                {y.topClimbs.map((t) => <Text key={t.title} v="body">{`${t.title}, ${t.count} times`}</Text>)}
                {y.topPlace ? <Text v="secondary">{`Most visited: ${y.topPlace.name}, ${y.topPlace.count} ${y.topPlace.count === 1 ? "entry" : "entries"}`}</Text> : null}
              </ReviewCard>
            ) : null}

            {y.firsts.length || y.sendMilestones.length || y.goalsReached.length ? (
              <ReviewCard title="Along the way">
                {y.sendMilestones.map((m) => <Text key={m.count} v="body">{`Send number ${m.count}, ${shortDate(m.day)}`}</Text>)}
                {y.firsts.slice(-6).map((f) => <Text key={f.text} v="body">{`${f.text}, ${shortDate(f.day)}`}</Text>)}
                {y.goalsReached.map((g) => <Text key={g.title + g.day} v="body">{`Goal reached: ${g.title}, ${shortDate(g.day)}`}</Text>)}
              </ReviewCard>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
