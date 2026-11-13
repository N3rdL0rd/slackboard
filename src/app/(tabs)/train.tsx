import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dayOf } from "../../core/days";
import { dayTitle } from "../../core/logTimeline";
import { entryName, entryText } from "../../core/training";
import { planActions, useCurrentPlan, usePlanner, usePlannerStore } from "../../state/planner";
import { useStore } from "../../state/store";
import { useToday } from "../../state/today";
import { useTraining } from "../../state/training";
import { Icon } from "../../ui/Icon";
import { BlockCard, PlanTodayCard, WeekStrip } from "../../ui/PlanCard";
import { Button, IconButton, LinkButton, SectionLabel, Sheet, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, font, r } from "../../theme";

const RECENT = 8;

/**
 * The Train tab. With a plan: today's session, the week, and what is next. Paused: one banner to resume. With no plan and no history: a
 * short welcome with three choices, none forced. Without a plan: start a session of your own, the exercises, and what you did lately.
 */
export default function Train() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entries = useTraining();
  const units = useStore((s) => s.settings.units);
  const today = useToday();
  const plan = useCurrentPlan();
  const { profile, loaded } = usePlanner();
  const actions = planActions();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const recent = useMemo(() => entries.slice(0, RECENT), [entries]);
  const isNew = loaded && !plan && entries.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, paddingTop: 8, height: 56 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>Train</Text>
        {plan ? <IconButton icon="more" label="Plan options" onPress={() => setMenu(true)} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        {isNew ? (
          <View style={{ padding: 20, gap: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="muscle" size={28} color={c.text} />
              <Text style={{ fontFamily: font.wordmark, fontSize: 30, lineHeight: 38, color: c.text }}>Get stronger</Text>
            </View>
            <Text v="secondary">Hangboard, pulling, core, mobility.</Text>
            <Button label="Build me a plan" onPress={() => router.push("/plan-setup")} />
            <Button variant="secondary" label="Just log training" onPress={() => router.push("/session")} />
            <Button variant="secondary" label="Browse exercises" onPress={() => router.push("/exercises")} />
          </View>
        ) : null}

        {plan && plan.status === "paused" ? (
          <View style={{ padding: 16, gap: 10, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.lineStrong }}>
            <Text v="section">Plan paused</Text>
            <Text v="secondary">Nothing is scheduled while it is paused, and no reminders. Pick it up whenever you like.</Text>
            <Button label="Resume" onPress={() => void actions.setStatus("active")} />
          </View>
        ) : null}

        {plan && plan.status === "active" && profile ? (
          <>
            <BlockCard plan={plan} today={today} />
            <PlanTodayCard plan={plan} profile={profile} today={today} />
            <View style={{ gap: 8 }}>
              <SectionLabel>This week</SectionLabel>
              <WeekStrip plan={plan} profile={profile} today={today} />
            </View>
          </>
        ) : null}

        {!isNew ? (
          <>
            <Button variant={plan ? "secondary" : "primary"} label="Start a session" onPress={() => router.push("/session")} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Button variant="secondary" label="Exercises" onPress={() => router.push("/exercises")} /></View>
              <View style={{ flex: 1 }}><Button variant="secondary" label="Interval timer" onPress={() => router.push("/timer")} /></View>
            </View>
            {!plan ? <LinkButton label="Build me a plan" icon="chevR" onPress={() => router.push("/plan-setup")} /> : null}
          </>
        ) : null}

        {!isNew ? (
          <View style={{ gap: 8 }}>
            <SectionLabel>Recent</SectionLabel>
            {recent.length === 0 ? <Text v="secondary">Nothing logged yet. Sessions you run land here and in your Log, and count as a climbing day for your streak.</Text> : (
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
        ) : null}
        <Text v="caption">Not training? Turn this tab off in Settings.</Text>
      </ScrollView>

      <Sheet visible={menu} onClose={() => { setMenu(false); setConfirm(false); }} title={confirm ? "Delete this plan?" : "Plan options"}
        footer={confirm && plan ? <Button variant="danger" label="Delete" onPress={() => { void usePlannerStore.getState().removePlan(plan.id); setMenu(false); setConfirm(false); }} /> : undefined}>
        {confirm ? <Text v="secondary">The plan and its sessions are removed. Training you logged stays in your log.</Text> : (
          <View style={{ gap: 8 }}>
            {plan?.status === "active" ? <Button variant="secondary" label="Pause the plan" onPress={() => { void actions.setStatus("paused"); setMenu(false); }} /> : null}
            <Button variant="secondary" label="Rebuild the plan" onPress={() => { setMenu(false); router.push("/plan-setup"); }} />
            <Button variant="secondary" label="Tests" onPress={() => { setMenu(false); router.push("/plan-test"); }} />
            <LinkButton label="Delete the plan" icon="trash" danger onPress={() => setConfirm(true)} />
          </View>
        )}
      </Sheet>
    </View>
  );
}
