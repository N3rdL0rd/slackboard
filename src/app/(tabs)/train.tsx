import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dayOf } from "../../core/days";
import { dayTitle } from "../../core/logTimeline";
import { entryName, entryText } from "../../core/training";
import { useStore } from "../../state/store";
import { useToday } from "../../state/today";
import { useTraining } from "../../state/training";
import { Icon } from "../../ui/Icon";
import { Button, SectionLabel, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, font, r } from "../../theme";

const RECENT = 8;

/**
 * The Train tab: start a session, open the exercise library or the interval timer, and see what you did lately. Plans and the weekly
 * layout come later (docs/IMPLEMENTATION_PLAN.md); until then a session is whatever you pick for the day.
 */
export default function Train() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entries = useTraining();
  const units = useStore((s) => s.settings.units);
  const today = useToday();
  const recent = useMemo(() => entries.slice(0, RECENT), [entries]);
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, height: 56 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>Train</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <Button label="Start a session" onPress={() => router.push("/session")} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button variant="secondary" label="Exercises" onPress={() => router.push("/exercises")} /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" label="Interval timer" onPress={() => router.push("/timer")} /></View>
        </View>

        <View style={{ gap: 8 }}>
          <SectionLabel>Recent</SectionLabel>
          {recent.length === 0 ? (
            <View style={{ padding: 20, gap: 10, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name="muscle" size={28} color={c.text} />
                <Text style={{ fontFamily: font.wordmark, fontSize: 30, lineHeight: 38, color: c.text }}>Nothing logged yet</Text>
              </View>
              <Text v="secondary">Hangboard, pulling, core, mobility. Pick what you will do, run it set by set, and it lands in your Log. It counts as a climbing day for your streak.</Text>
            </View>
          ) : (
            <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
              {recent.map((e, i) => (
                <Tap key={e.id} accessibilityRole="button" accessibilityLabel={`${entryName(e)}. Open`} onPress={() => router.push({ pathname: "/training/[id]", params: { id: e.id } })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text v="climbName" numberOfLines={1}>{entryName(e)}</Text>
                    <Text v="secondary" numberOfLines={1}>{`${dayTitle(dayOf(e.performedAt), today)} \u00B7 ${entryText(e, units)}`}</Text>
                  </View>
                  <Icon name="chevR" size={20} color={c.muted} />
                </Tap>
              ))}
            </View>
          )}
        </View>
        <Text v="caption">Not training? Turn this tab off in Settings.</Text>
      </ScrollView>
    </View>
  );
}
