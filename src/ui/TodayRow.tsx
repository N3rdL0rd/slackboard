import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { streakLabel } from "../core/streak";
import { MOTIVATION_KEY, NUDGE_KEY, useTodayInfo } from "../state/today";
import { useDayNotesStore } from "../state/dayNotes";
import { c, r } from "../theme";
import { BodySheet } from "./BodySheet";
import { Icon } from "./Icon";
import { Button, Sheet, Tap } from "./parts";
import { ProgressRing } from "./ProgressRing";
import { Dot, StreakSheet } from "./StreakSheet";
import { Text } from "./Text";

/**
 * One row under the Climb tab's summary line: the streak with this week's seven dots on the left, and on the right the one thing to say
 * today. That is the rest nudge when it applies (the goal then sits beside it as a ring), otherwise the goal furthest along, with its
 * progress, otherwise the motivation line. Tapping the goal, in either form, opens Goals; tapping the streak opens the calendar; tapping
 * a nudge or motivation line opens why it was chosen.
 */
export function TodayRow() {
  const info = useTodayInfo();
  const router = useRouter();
  const [sheet, setSheet] = useState<null | "streak" | "why" | "body">(null);
  const goal = info.goal;
  // The goal is the line unless a rest nudge needs the space; then the goal stays visible as a ring.
  const goalLine = !info.nudge && goal ? goal : null;
  const line = info.nudge ?? (goalLine ? null : info.motivation);
  const showStreak = info.streak.current > 0;
  if (!showStreak && !line && !goal) return null;

  const hide = () => { void useDayNotesStore.getState().snooze(info.nudge ? NUDGE_KEY : MOTIVATION_KEY, info.today); };

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, minHeight: 56 }}>
        {goal && !goalLine ? (
          <Tap accessibilityRole="button" accessibilityLabel={`${goal.title}. ${goal.summary}. Open goals`} onPress={() => router.push("/goals")} style={{ minHeight: 44, justifyContent: "center" }}>
            <ProgressRing progress={goal.progress} size={48} stroke={5} label={goal.label} />
          </Tap>
        ) : null}
        {showStreak ? (
          <Tap accessibilityRole="button" accessibilityLabel={`Streak, ${streakLabel(info.streak)}. Open the calendar`} onPress={() => setSheet("streak")} style={{ gap: 5, minHeight: 44, justifyContent: "center" }}>
            <Text v="numeral" style={{ fontSize: 18 }}>{info.streak.current} {info.streak.current === 1 ? "day" : "days"}</Text>
            <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {info.dots.map((d) => <Dot key={d.day} mark={d.mark} size={9} />)}
            </View>
          </Tap>
        ) : null}
        {goalLine ? (
          <Tap accessibilityRole="button" accessibilityLabel={`${goalLine.title}. ${goalLine.summary}. Open goals`} onPress={() => router.push("/goals")} style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 3 }}>
            <Text v="bodyStrong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>{goalLine.title}</Text>
            <Text v="caption" numberOfLines={1}>{goalLine.summary}</Text>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: c.raised, overflow: "hidden" }}>
              <View style={{ width: `${Math.round(goalLine.progress * 100)}%`, height: 4, backgroundColor: c.text }} />
            </View>
          </Tap>
        ) : line ? (
          <>
            <Tap accessibilityRole="button" accessibilityLabel={`${line.text}. Why am I seeing this?`} onPress={() => setSheet("why")} style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 4 }}>
              <Text v="bodyStrong" numberOfLines={3} style={{ fontSize: 14, lineHeight: 18 }}>{line.text}</Text>
              {"progress" in line ? (
                <View style={{ height: 4, borderRadius: 2, backgroundColor: c.raised, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(line.progress * 100)}%`, height: 4, backgroundColor: c.text }} />
                </View>
              ) : null}
            </Tap>
          </>
        ) : <View style={{ flex: 1 }} />}
      </View>

      <StreakSheet visible={sheet === "streak"} onClose={() => setSheet(null)} streak={info.streak} days={info.climbingDays} today={info.today} />
      <Sheet visible={sheet === "why" && !!line} onClose={() => setSheet(null)} title="Why am I seeing this?">
        {info.nudge ? (
          <View style={{ gap: 10 }}>
            <Text v="bodyStrong">{info.nudge.text}</Text>
            {info.nudge.why.map((w) => <Text key={w} v="secondary">{w}</Text>)}
            <Text v="caption">General advice, not a rule.</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              <Button variant="secondary" label="How do you feel today?" onPress={() => setSheet("body")} />
              <Button variant="secondary" label="Not today" onPress={() => { hide(); setSheet(null); }} />
            </View>
          </View>
        ) : info.motivation ? (
          <View style={{ gap: 10 }}>
            <Text v="bodyStrong">{info.motivation.text}</Text>
            <Text v="secondary">{info.motivation.why}</Text>
            <Text v="caption">Worked out from your own log only. It never compares you with anyone. You can turn these off in Settings.</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              <Button variant="secondary" label="Hide for today" onPress={() => { hide(); setSheet(null); }} />
            </View>
          </View>
        ) : null}
      </Sheet>
      <BodySheet visible={sheet === "body"} onClose={() => setSheet(null)} day={info.today} today={info.today} />
    </>
  );
}
