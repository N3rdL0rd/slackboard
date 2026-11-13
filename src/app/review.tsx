import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDays, isDay, weekStartDay } from "../core/days";
import { shortDate } from "../core/goals";
import { bandForV } from "../core/grades";
import { weeklyReview } from "../core/review";
import { streakLabel } from "../core/streak";
import { ropedBand } from "../data/ropedGrades";
import { useDayNotes } from "../state/dayNotes";
import { useGoalLabels, useGoals } from "../state/goals";
import { useActivities, useToday, useWorkingGrades } from "../state/today";
import { Figure, ReviewCard } from "../ui/ReviewCard";
import { GradeChip, IconButton, LinkButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c } from "../theme";

/**
 * The weekly review: a few cards about one week (Monday to Sunday), from the log as it is now, with the week before and after one tap
 * away. An empty week says so in one line and shows nothing else.
 */
export default function Review() {
  const { day: param } = useLocalSearchParams<{ day?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const activities = useActivities();
  const notes = useDayNotes();
  const goals = useGoals();
  const labels = useGoalLabels();
  const working = useWorkingGrades();
  const thisWeek = weekStartDay(today);
  const [start, setStart] = useState(() => weekStartDay(param && isDay(param) ? param : today));
  const r = useMemo(() => weeklyReview({ activities, notes, goals, today, day: start, labels, working }), [activities, notes, goals, today, start, labels, working]);
  const title = start === thisWeek ? "This week" : `Week of ${shortDate(start)}`;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{title}</Text>
        <IconButton icon="chevL" label="Previous week" onPress={() => setStart(addDays(start, -7))} />
        <IconButton icon="chevR" label="Next week" onPress={() => start < thisWeek && setStart(addDays(start, 7))} color={start < thisWeek ? c.text : c.muted} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 + insets.bottom }}>
        <Text v="secondary">{`${shortDate(r.weekStart)} to ${shortDate(r.weekEnd)}`}</Text>
        {r.empty ? <Text v="body">Nothing logged this week. That is fine.</Text> : (
          <>
            <ReviewCard title="Your week in numbers">
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Figure value={r.days} label={r.days === 1 ? "day" : "days"} />
                <Figure value={r.sends} label={r.sends === 1 ? "send" : "sends"} />
                <Figure value={r.attempts} label={r.attempts === 1 ? "try" : "tries"} />
              </View>
              {r.hardestBoulder !== null || r.hardestRoped !== null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text v="secondary">Hardest</Text>
                  {r.hardestBoulder !== null ? <GradeChip band={bandForV(r.hardestBoulder)} label={labels.boulder(r.hardestBoulder)} /> : null}
                  {r.hardestRoped !== null ? <GradeChip band={ropedBand(r.hardestRoped)} label={labels.roped(r.hardestRoped)} /> : null}
                </View>
              ) : null}
              {r.streak.current > 0 ? <Text v="secondary">{`Streak: ${streakLabel(r.streak)}`}</Text> : null}
            </ReviewCard>
            {r.highlight ? <ReviewCard title="Highlight"><Text v="bodyStrong">{r.highlight}</Text></ReviewCard> : null}
            {r.compare ? <ReviewCard title="Against your recent average"><Text v="body">{r.compare}</Text><Text v="caption">Compared with the four weeks before it, from how much you did and how hard it was.</Text></ReviewCard> : null}
            {r.trainingEntries > 0 ? (
              <ReviewCard title="Training">
                <Text v="body">{`${r.trainingEntries} ${r.trainingEntries === 1 ? "exercise" : "exercises"} on ${r.trainingDays} ${r.trainingDays === 1 ? "day" : "days"}.`}</Text>
              </ReviewCard>
            ) : null}
            {r.goals.length ? (
              <ReviewCard title="Goals">
                {r.goals.map((g) => <View key={g.title} style={{ gap: 2 }}><Text v="bodyStrong">{g.title}</Text><Text v="secondary">{g.summary}</Text></View>)}
              </ReviewCard>
            ) : null}
            {r.body ? <ReviewCard title="Body"><Text v="body">{r.body}</Text></ReviewCard> : null}
          </>
        )}
        <LinkButton label="Year in review" icon="chevR" onPress={() => router.push("/year-review")} />
      </ScrollView>
    </View>
  );
}
