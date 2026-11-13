import { useState } from "react";
import { View } from "react-native";
import { streakLabel } from "../core/streak";
import { MOTIVATION_KEY, NUDGE_KEY, useTodayInfo } from "../state/today";
import { useDayNotesStore } from "../state/dayNotes";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { BodySheet } from "./BodySheet";
import { Icon } from "./Icon";
import { Button, LinkButton, Sheet, Tap } from "./parts";
import { Dot, StreakSheet } from "./StreakSheet";
import { Text } from "./Text";

/**
 * One row under the Climb tab's summary line: the streak with this week's seven dots on the left, and the one line to say today on the
 * right: the rest nudge when it applies, otherwise the motivation line. It adds no height beyond that row and shows nothing when there is
 * nothing true to say. Tapping the streak opens the calendar; tapping the line opens why it was chosen.
 */
export function TodayRow() {
  const info = useTodayInfo();
  const [sheet, setSheet] = useState<null | "streak" | "why" | "body">(null);
  const patchSettings = useStore((s) => s.patchSettings);
  const line = info.nudge ?? info.motivation;
  const showStreak = info.streak.current > 0;
  if (!showStreak && !line) return null;

  const hide = () => { void useDayNotesStore.getState().snooze(info.nudge ? NUDGE_KEY : MOTIVATION_KEY, info.today); };

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, minHeight: 56 }}>
        {showStreak ? (
          <Tap accessibilityRole="button" accessibilityLabel={`Streak, ${streakLabel(info.streak)}. Open the calendar`} onPress={() => setSheet("streak")} style={{ gap: 5, minHeight: 44, justifyContent: "center" }}>
            <Text v="numeral" style={{ fontSize: 18 }}>{info.streak.current} {info.streak.current === 1 ? "day" : "days"}</Text>
            <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {info.dots.map((d) => <Dot key={d.day} mark={d.mark} size={9} />)}
            </View>
          </Tap>
        ) : null}
        {line ? (
          <>
            <Tap accessibilityRole="button" accessibilityLabel={`${line.text}. Why am I seeing this?`} onPress={() => setSheet("why")} style={{ flex: 1, minHeight: 44, justifyContent: "center", gap: 4 }}>
              <Text v="bodyStrong" numberOfLines={3} style={{ fontSize: 14, lineHeight: 18 }}>{line.text}</Text>
              {"progress" in line ? (
                <View style={{ height: 4, borderRadius: 2, backgroundColor: c.raised, overflow: "hidden" }}>
                  <View style={{ width: `${Math.round(line.progress * 100)}%`, height: 4, backgroundColor: c.text }} />
                </View>
              ) : null}
            </Tap>
            <Tap accessibilityRole="button" accessibilityLabel={info.nudge ? "Not today" : "Hide this for today"} onPress={hide} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={18} color={c.muted} />
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
            <Text v="caption">This is general advice from your log, not a rule. Climb how you like.</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              <Button variant="secondary" label="How do you feel today?" onPress={() => setSheet("body")} />
              <Button variant="secondary" label="Not today" onPress={() => { hide(); setSheet(null); }} />
              <LinkButton label="Don't show rest advice" icon="close" onPress={() => { patchSettings({ nudges: "off" }); setSheet(null); }} />
            </View>
          </View>
        ) : info.motivation ? (
          <View style={{ gap: 10 }}>
            <Text v="bodyStrong">{info.motivation.text}</Text>
            <Text v="secondary">{info.motivation.why}</Text>
            <Text v="caption">Worked out from your own log only. It never compares you with anyone. You can turn these off in Settings.</Text>
            <View style={{ gap: 8, marginTop: 6 }}>
              <Button variant="secondary" label="Hide for today" onPress={() => { hide(); setSheet(null); }} />
              <LinkButton label="Don't show these" icon="close" onPress={() => { patchSettings({ motivation: false }); setSheet(null); }} />
            </View>
          </View>
        ) : null}
      </Sheet>
      <BodySheet visible={sheet === "body"} onClose={() => setSheet(null)} day={info.today} today={info.today} />
    </>
  );
}
