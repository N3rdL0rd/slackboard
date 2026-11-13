import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import { addDays } from "../core/days";
import {
  bestBoulderV, draftProblem, GOAL_TEMPLATES, goalTitle, makeWindow, MAX_COUNT, MAX_DAYS, MAX_TITLE, newGoal, type GoalDraft, type GoalScope, type GoalSpec, type GoalTemplate, type WindowKind,
} from "../core/goals";
import { ROPED_GRADES } from "../data/ropedGrades";
import { useGoalLabels, useGoalsStore } from "../state/goals";
import { useActivities, useToday } from "../state/today";
import { Icon } from "../ui/Icon";
import { Button, Chip, IconButton, SectionLabel, Segmented, SwitchRow, Tap } from "../ui/parts";
import { Stepper } from "../ui/Stepper";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const WINDOW_CHIPS: { kind: WindowKind; label: string }[] = [
  { kind: "week", label: "This week" }, { kind: "month", label: "This month" }, { kind: "until", label: "Until a date" }, { kind: "none", label: "No end" },
];
/** "Until a date" offers a few dates ahead; they are chosen by tap, so it works the same on every phone. */
const UNTIL_CHOICES: { label: string; days: number }[] = [{ label: "2 weeks", days: 14 }, { label: "1 month", days: 30 }, { label: "3 months", days: 91 }, { label: "6 months", days: 182 }];
const ROPED_MIN = ROPED_GRADES[0].value;
const ROPED_MAX = ROPED_GRADES[ROPED_GRADES.length - 1].value;

/** A step that grows with the number, so reaching 200 is not 200 taps. */
const stepFor = (n: number): number => (n >= 100 ? 10 : n >= 20 ? 5 : 1);

/** A new goal: pick a template (or custom), adjust it, and save. The title is written from the choices, so there is nothing to type. */
export default function GoalNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const labels = useGoalLabels();
  const activities = useActivities();
  const [template, setTemplate] = useState<GoalTemplate | null>(null);
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [custom, setCustom] = useState("");
  const [until, setUntil] = useState(UNTIL_CHOICES[1].days);
  const [busy, setBusy] = useState(false);
  const best = useMemo(() => bestBoulderV(activities), [activities]);

  const pick = (t: GoalTemplate) => { setTemplate(t); setDraft(t.draft(today, best)); };
  const spec = draft?.spec;
  const setSpec = (s: GoalSpec) => draft && setDraft({ ...draft, spec: s });
  const setWindow = (kind: WindowKind, days = until) => draft && setDraft({ ...draft, windowKind: kind, window: makeWindow(kind, today, kind === "until" ? addDays(today, days) : undefined) });

  const title = draft ? (draft.spec.type === "custom" ? custom.trim() : goalTitle(draft.spec, draft.window, labels)) : "";
  const problem = draft ? draftProblem(draft, custom) : null;
  const save = async () => {
    if (!draft || problem) return;
    setBusy(true);
    await useGoalsStore.getState().save(newGoal(randomHex(16), draft, custom, labels, new Date()));
    router.replace("/goals");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => (draft ? (setDraft(null), setTemplate(null)) : router.back())} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{draft ? "Your goal" : "New goal"}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {!draft ? (
          <>
            <Text v="secondary">Pick one to start from. You can change anything on the next screen.</Text>
            {GOAL_TEMPLATES.map((t) => (
              <Tap key={t.id} accessibilityRole="button" accessibilityLabel={`${t.label}. ${t.hint}`} onPress={() => pick(t)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text v="climbName">{t.label}</Text>
                  <Text v="secondary">{t.hint}</Text>
                </View>
                <Icon name="chevR" size={20} color={c.muted} />
              </Tap>
            ))}
          </>
        ) : null}

        {draft && spec ? (
          <>
            <View style={{ padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <Text v="climbName">{title || "Write your goal below"}</Text>
            </View>

            {spec.type === "custom" ? (
              <TextInput value={custom} onChangeText={(t) => setCustom(t.slice(0, MAX_TITLE))} placeholder="What do you want to do?" placeholderTextColor={c.placeholder} accessibilityLabel="Goal"
                style={{ minHeight: 56, paddingHorizontal: 14, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, fontSize: 16 }} />
            ) : null}

            {spec.type === "grade" ? (
              <View style={{ gap: 8 }}>
                <SectionLabel>Where</SectionLabel>
                <Segmented<"board" | "boulder" | "roped"> options={[{ value: "boulder", label: "Boulders" }, { value: "board", label: "My board" }, { value: "roped", label: "Roped" }]} value={spec.scope}
                  onChange={(scope) => setSpec({ type: "grade", scope, grade: scope === "roped" ? 13 : Math.max(1, (best ?? 0) + 1) })} />
                <Stepper label="Grade" value={spec.scope === "roped" ? labels.roped(spec.grade) : labels.boulder(spec.grade)}
                  min={spec.grade <= (spec.scope === "roped" ? ROPED_MIN : 0)} max={spec.grade >= (spec.scope === "roped" ? ROPED_MAX : 17)}
                  onChange={(d) => setSpec({ ...spec, grade: spec.grade + d })} />
                <Text v="caption">Only sends from the day you set the goal count.</Text>
              </View>
            ) : null}

            {spec.type === "volume" ? (
              <View style={{ gap: 8 }}>
                <SectionLabel>What to count</SectionLabel>
                <Segmented<"sends" | "days"> options={[{ value: "sends", label: "Sends" }, { value: "days", label: "Climbing days" }]} value={spec.metric}
                  onChange={(metric) => setSpec({ ...spec, metric, count: metric === "days" ? Math.min(spec.count, 7) : spec.count })} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(["any", "board", "boulder", "roped"] as GoalScope[]).filter((s) => spec.metric === "sends" || s !== "board").map((s) => (
                    <Chip key={s} label={{ any: "Anything", board: "My board", boulder: "Boulders", roped: "Roped" }[s]} selected={spec.scope === s} onPress={() => setSpec({ ...spec, scope: s })} />
                  ))}
                </View>
                <Stepper label="Target" value={String(spec.count)} min={spec.count <= 1} max={spec.count >= (spec.metric === "days" ? 7 : MAX_COUNT)}
                  onChange={(d) => setSpec({ ...spec, count: Math.max(1, Math.min(spec.metric === "days" ? 7 : MAX_COUNT, spec.count + d * stepFor(spec.count - (d < 0 ? 1 : 0)))) })} />
              </View>
            ) : null}

            {spec.type === "streak" ? (
              <Stepper label="Days" value={String(spec.days)} min={spec.days <= 2} max={spec.days >= MAX_DAYS} step="one day"
                onChange={(d) => setSpec({ type: "streak", days: Math.max(2, Math.min(MAX_DAYS, spec.days + d * stepFor(spec.days - (d < 0 ? 1 : 0)))) })} />
            ) : null}

            {spec.type === "training" ? (
              <View style={{ gap: 8 }}>
                <Stepper label="Days" value={String(spec.days)} min={spec.days <= 1} max={spec.days >= 7} onChange={(d) => setSpec({ ...spec, days: spec.days + d })} />
                <SwitchRow label="Finger work only" help="Hangboard and other finger-intense exercises" value={spec.fingers} onChange={(fingers) => setSpec({ ...spec, fingers })} />
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <SectionLabel>When</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {WINDOW_CHIPS.filter((w) => spec.type !== "custom" || w.kind !== "week").map((w) => <Chip key={w.kind} label={w.label} selected={draft.windowKind === w.kind} onPress={() => setWindow(w.kind)} />)}
              </View>
              {draft.windowKind === "until" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {UNTIL_CHOICES.map((u) => <Chip key={u.days} label={u.label} selected={until === u.days} onPress={() => { setUntil(u.days); setWindow("until", u.days); }} />)}
                </View>
              ) : null}
              <Text v="caption">A goal that is not reached in time just ends. You can try it again.</Text>
            </View>

            {problem ? <Text v="caption" style={{ color: c.danger }}>{problem}</Text> : null}
          </>
        ) : null}
      </ScrollView>
      {draft ? (
        <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.ground }}>
          <Button label={busy ? "Saving" : "Save goal"} disabled={busy || problem !== null} onPress={() => void save()} />
        </View>
      ) : null}
    </View>
  );
}
