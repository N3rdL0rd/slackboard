import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import { addDays, dayOf, stampOf } from "../core/days";
import { buildPlan, DEFAULT_PROFILE, latestTests, planStart, weekdayName, type Emphasis, type Profile } from "../core/planner";
import { formatWeight, roundTo, weightIn, weightStep, weightToKg } from "../core/units";
import { EQUIPMENT, exerciseById, type Equipment } from "../data/exercises";
import { TESTS } from "../data/protocols";
import { usePlanner, usePlannerStore, useStyleInsight } from "../state/planner";
import { useStore } from "../state/store";
import { Button, Chip, IconButton, Segmented, SectionLabel } from "../ui/parts";
import { Stepper } from "../ui/Stepper";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const STEPS = ["Goal", "What you have", "How often", "What we saw", "Tests", "Review"] as const;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKS_AHEAD = [6, 8, 10, 12];
type DayState = "free" | "train" | "climb";

/**
 * Plan setup: six short steps, each with a default so Next always works, and each can be revisited. The last step shows the first block
 * before anything is saved. Nothing is final: the plan can be rebuilt from the Train tab.
 */
export default function PlanSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const units = useStore((s) => s.settings.units);
  const { profile: saved, tests, loaded } = usePlanner();
  const insight = useStyleInsight();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(DEFAULT_PROFILE);
  const [weeks, setWeeks] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (loaded && saved) setP(saved); }, [loaded, saved]);

  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const today = dayOf(new Date());
  const start = planStart(today);
  const dayState = (d: number): DayState => (p.trainDays.includes(d) ? "train" : p.climbDays.includes(d) ? "climb" : "free");
  const cycle = (d: number) => {
    const next: DayState = dayState(d) === "free" ? "train" : dayState(d) === "train" ? "climb" : "free";
    const trainDays = p.trainDays.filter((x) => x !== d).concat(next === "train" ? [d] : []).sort((a, b) => a - b);
    const climbDays = p.climbDays.filter((x) => x !== d).concat(next === "climb" ? [d] : []).sort((a, b) => a - b);
    set({ trainDays, climbDays, daysPerWeek: Math.max(1, Math.min(6, trainDays.length)) });
  };
  const toggleEquipment = (e: Equipment) => set({ equipment: p.equipment.includes(e) ? p.equipment.filter((x) => x !== e) : [...p.equipment, e] });
  const bump = (dir: 1 | -1) => {
    const stepW = weightStep(units.weight);
    set({ bodyKg: Math.max(30, Math.min(200, weightToKg(roundTo(weightIn(p.bodyKg ?? 70, units.weight) + dir * stepW, stepW), units.weight))) });
  };

  const profile: Profile = useMemo(() => ({ ...p, goalDate: weeks ? addDays(start, weeks * 7 - 1) : null }), [p, weeks, start]);
  const latest = useMemo(() => latestTests(tests), [tests]);
  const draft = useMemo(() => {
    if (step < 5) return null;
    let n = 0;
    return buildPlan({ id: "preview", today, now: new Date(), profile, tests: latest, logsEmphasis: insight.emphasis, newId: () => `p${++n}`, createdAt: stampOf(new Date()) });
  }, [step, today, profile, latest, insight.emphasis]);

  const begin = async () => {
    setBusy(true);
    let n = 0;
    const id = randomHex(16);
    const plan = buildPlan({ id, today, now: new Date(), profile, tests: latest, logsEmphasis: insight.emphasis, newId: () => `${id}-${++n}`, createdAt: stampOf(new Date()) });
    await usePlannerStore.getState().saveProfile(profile);
    await usePlannerStore.getState().startPlan(plan);
    router.replace("/train");
  };

  const firstWeek = draft ? draft.sessions.filter((s) => s.week === Math.min(2, draft.block.weeks)) : [];
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label={step === 0 ? "Back" : "Previous step"} onPress={() => (step === 0 ? router.back() : setStep(step - 1))} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{STEPS[step]}</Text>
        <Text v="secondary" style={{ paddingRight: 16 }}>{`${step + 1} of ${STEPS.length}`}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <Segmented<"general" | "date"> options={[{ value: "general", label: "Get stronger" }, { value: "date", label: "A dated goal" }]} value={weeks ? "date" : "general"} onChange={(v) => setWeeks(v === "date" ? 8 : null)} />
            {weeks ? (
              <View style={{ gap: 8 }}>
                <SectionLabel>The block ends in</SectionLabel>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {WEEKS_AHEAD.map((w) => <Chip key={w} label={`${w} weeks`} selected={weeks === w} onPress={() => setWeeks(w)} />)}
                </View>
                <Text v="caption">The last week is a light week, so your strongest weeks land before your date.</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <SectionLabel>Equipment</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {EQUIPMENT.map((e) => <Chip key={e.value} label={e.label} selected={p.equipment.includes(e.value)} onPress={() => toggleEquipment(e.value)} />)}
            </View>
            <Text v="caption">The plan only uses what you pick. With no hangboard, finger days become pulling and core.</Text>
            <SectionLabel>Body weight</SectionLabel>
            {p.bodyKg === null ? <Button variant="secondary" label="Add my body weight" onPress={() => set({ bodyKg: 70 })} /> : (
              <>
                <Stepper label="Weight" value={formatWeight(p.bodyKg, units.weight)} onChange={bump} />
                <Chip label="Skip it" onPress={() => set({ bodyKg: null })} />
              </>
            )}
            <Text v="caption">Used to set hang loads.</Text>
            <SectionLabel>Finger training so far</SectionLabel>
            <Segmented<Profile["fingerHistory"]> options={[{ value: "new", label: "New to it" }, { value: "some", label: "Some" }, { value: "regular", label: "Regular" }]} value={p.fingerHistory} onChange={(fingerHistory) => set({ fingerHistory })} />
            <Text v="caption">New, or coming back from a break, starts gently: bigger edges, two sets, no added weight.</Text>
            <SectionLabel>Anything to be careful about?</SectionLabel>
            <TextInput value={p.injury} onChangeText={(injury) => set({ injury: injury.slice(0, 500) })} placeholder="An injury or sore spot (optional)" placeholderTextColor={c.placeholder} accessibilityLabel="Injury or sore spot"
              style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, fontSize: 16 }} />
            <Text v="caption">Starts the plan gently. Stop if it hurts.</Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text v="secondary">Tap each day: once for a training day, twice for a day you already climb, three times to clear it.</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {WEEKDAYS.map((w, d) => {
                const st = dayState(d);
                return (
                  <View key={d} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                    <Chip label={w} selected={st === "train"} onPress={() => cycle(d)} style={{ minWidth: 40, paddingHorizontal: 0, justifyContent: "center", borderStyle: st === "climb" ? "dashed" : "solid" }} />
                    <Text v="caption" style={{ fontSize: 11 }}>{st === "train" ? "Train" : st === "climb" ? "Climb" : ""}</Text>
                  </View>
                );
              })}
            </View>
            <Text v="caption">{p.trainDays.length ? `${p.trainDays.length} training ${p.trainDays.length === 1 ? "day" : "days"} a week.` : "Pick at least one training day."}</Text>
            <Stepper label="Minutes" value={`${p.minutes} min`} min={p.minutes <= 20} max={p.minutes >= 180} onChange={(d) => set({ minutes: Math.max(20, Math.min(180, p.minutes + d * 5)) })} />
            <Text v="caption">Sessions are trimmed to fit: shoulder and core extras go first, never the main work.</Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <View style={{ gap: 6, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              {insight.findings.map((f) => <Text key={f} v="body">{f}</Text>)}
            </View>
            <SectionLabel>That's not right? Say what you need</SectionLabel>
            <Segmented<"logs" | Emphasis> options={[{ value: "logs", label: "Go by my log" }, { value: "strength", label: "Strength" }, { value: "endurance", label: "Endurance" }, { value: "balanced", label: "Balance" }]} value={p.emphasis ?? "logs"} onChange={(v) => set({ emphasis: v === "logs" ? null : v })} />
            <Text v="caption">Overrides what the log suggests.</Text>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text v="secondary">Optional. Gives real loads and shows progress.</Text>
            <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
              {TESTS.map((t, i) => (
                <View key={t.kind} style={{ padding: 14, gap: 2, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider }}>
                  <Text v="climbName">{t.label}</Text>
                  <Text v="secondary">{latest[t.kind] !== undefined ? `Last result: ${latest[t.kind]} ${t.unit}` : `Not tested. ${t.measures}.`}</Text>
                </View>
              ))}
            </View>
            <Button label="Test now" variant="secondary" onPress={() => router.push("/plan-test")} />
            <Text v="caption">Skipping is fine: the plan then uses conservative defaults, clearly labelled in each session.</Text>
          </>
        ) : null}

        {step === 5 && draft ? (
          <>
            <View style={{ padding: 16, gap: 6, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <Text v="climbName">{`${draft.block.weeks} weeks: ${{ starter: "a gentle start", strength: "strength", endurance: "endurance", balanced: "strength, then endurance" }[draft.block.kind]}`}</Text>
              {draft.block.phases.map((ph) => <Text key={ph.name} v="secondary">{`Weeks ${ph.startWeek} to ${ph.startWeek + ph.weeks - 1}: ${ph.name}`}</Text>)}
              <Text v="secondary">{`Light weeks: ${draft.block.deloadWeeks.join(", ")}. Retest in week ${draft.block.retestWeek}.`}</Text>
            </View>
            <SectionLabel>A typical week</SectionLabel>
            <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
              {firstWeek.length === 0 ? <Text v="secondary" style={{ padding: 14 }}>No sessions fit the days you chose. Go back and pick a training day.</Text> : null}
              {firstWeek.map((s, i) => (
                <View key={s.id} style={{ padding: 14, flexDirection: "row", gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider }}>
                  <Text v="bodyStrong" style={{ width: 92 }}>{weekdayName(s.day)}</Text>
                  <Text v="body" style={{ flex: 1 }}>{`${s.title} \u00B7 ${s.minutes} min`}</Text>
                </View>
              ))}
            </View>
            <SectionLabel>Why</SectionLabel>
            {draft.block.reasons.map((x) => <Text key={x} v="secondary">{x}</Text>)}
            <Text v="caption">{`Exercises come from the library (${exerciseById("max-hang")?.name} and others). Nothing here is final: you can move, skip, lighten or rebuild.`}</Text>
          </>
        ) : null}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.ground, flexDirection: "row", gap: 10 }}>
        {step < 5 ? <View style={{ flex: 1 }}><Button label="Next" disabled={step === 2 && p.trainDays.length === 0} onPress={() => setStep(step + 1)} /></View>
          : <View style={{ flex: 1 }}><Button label={busy ? "Starting" : "Start the plan"} disabled={busy || firstWeek.length === 0} onPress={() => void begin()} /></View>}
      </View>
    </View>
  );
}
