import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import { parseStamp, stampOf } from "../core/days";
import { measure, newGoal, retryDraft, type Goal } from "../core/goals";
import { useGoalLabels, useGoals, useGoalsStore } from "../state/goals";
import { useActivities, useToday } from "../state/today";
import { Icon } from "../ui/Icon";
import { Button, IconButton, LinkButton, SectionLabel, Sheet, Tap } from "../ui/parts";
import { ProgressRing } from "../ui/ProgressRing";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const dateText = (stamp: string) => parseStamp(stamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The user's goals: active ones with a ring and a plain sentence, then the ones reached, then the ones that ended. */
export default function Goals() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goals = useGoals();
  const activities = useActivities();
  const today = useToday();
  const labels = useGoalLabels();
  const [open, setOpen] = useState<Goal | null>(null);
  const [confirm, setConfirm] = useState(false);
  const ctx = useMemo(() => ({ activities, today, labels }), [activities, today, labels]);
  const active = goals.filter((g) => g.status === "active" || g.status === "paused");
  const reached = goals.filter((g) => g.status === "achieved");
  const ended = goals.filter((g) => g.status === "missed");

  const close = () => { setOpen(null); setConfirm(false); };
  const tickOff = (g: Goal) => {
    const done: Goal = { ...g, status: "achieved", achievedAt: stampOf(new Date()) };
    void useGoalsStore.getState().apply({ goals, achieved: [done], changed: [done] });
    close();
  };
  const setStatus = (g: Goal, status: Goal["status"]) => { void useGoalsStore.getState().save({ ...g, status }); close(); };
  const again = (g: Goal) => {
    const d = retryDraft(g, today);
    void useGoalsStore.getState().save(newGoal(randomHex(16), d, g.title, labels, new Date()));
    close();
  };
  const remove = (g: Goal) => { void useGoalsStore.getState().remove(g.id); close(); };

  const card = (g: Goal) => {
    const p = measure(g, ctx);
    const sub = g.status === "achieved" ? `Done ${g.achievedAt ? dateText(g.achievedAt) : ""}` : g.status === "missed" ? `Ended. ${p.summary}` : g.status === "paused" ? `Paused. ${p.summary}` : p.summary;
    return (
      <Tap key={g.id} accessibilityRole="button" accessibilityLabel={`${g.title}. ${sub}. Options`} onPress={() => setOpen(g)}
        style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, opacity: g.status === "paused" ? 0.7 : 1 }}>
        {g.status === "achieved" ? <Icon name="check" size={28} color={c.starOn} /> : <ProgressRing progress={p.progress} size={44} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="climbName" numberOfLines={2}>{g.title}</Text>
          <Text v="secondary">{sub}</Text>
        </View>
        <Icon name="chevR" size={20} color={c.muted} />
      </Tap>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Goals</Text>
        <IconButton icon="plus" label="New goal" onPress={() => router.push("/goal-new")} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 + insets.bottom }}>
        {goals.length === 0 ? (
          <View style={{ gap: 12, padding: 20, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <Text v="bodyStrong">No goals yet</Text>
            <Text v="secondary">A goal is optional. Pick one, and the app counts it from your log, so there is nothing extra to enter.</Text>
            <Button label="New goal" onPress={() => router.push("/goal-new")} />
          </View>
        ) : null}
        {active.length ? <><SectionLabel>Active</SectionLabel>{active.map(card)}</> : null}
        {reached.length ? <><SectionLabel>Reached</SectionLabel>{reached.map(card)}</> : null}
        {ended.length ? <><SectionLabel>Ended</SectionLabel>{ended.map(card)}</> : null}
      </ScrollView>

      <Sheet visible={open !== null} onClose={close} title={confirm ? "Delete this goal?" : open?.title ?? ""}
        footer={confirm && open ? <Button variant="danger" label="Delete" onPress={() => remove(open)} /> : undefined}>
        {open && confirm ? <Text v="secondary">It is removed from your list. Your climbs and training are not touched.</Text> : null}
        {open && !confirm ? (
          <View style={{ gap: 10 }}>
            <Text v="secondary">{measure(open, ctx).summary}</Text>
            {open.spec.type === "custom" && open.status === "active" ? <Button label="Mark as done" onPress={() => tickOff(open)} /> : null}
            {open.status === "active" ? <Button variant="secondary" label="Pause" onPress={() => setStatus(open, "paused")} /> : null}
            {open.status === "paused" ? <Button label="Resume" onPress={() => setStatus(open, "active")} /> : null}
            {open.status === "missed" ? <Button label="Try again" onPress={() => again(open)} /> : null}
            <LinkButton label="Delete" icon="trash" danger onPress={() => setConfirm(true)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
