import { useKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppState, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import { AREAS, AREA_LABEL, fingerHoldOff, noteFor, reportPain, type Area, type PainKind } from "../core/body";
import { currentTarget, isTimed, setsDoneIn, startRunner, step, toEntries, type RunnerItem, type RunnerState } from "../core/sessionRunner";
import { localStamp } from "../core/shareCard";
import { entryName, entryText, lastTime, MAX_EDGE_MM, MAX_LOAD_KG, MAX_REPS, MAX_TIME_S, targetsFor, type SetTarget } from "../core/training";
import { formatWeight, roundTo, weightIn, weightStep, weightToKg } from "../core/units";
import type { Units } from "../core/settings";
import { exerciseById, GRIP_LABEL, type Exercise, type Grip } from "../data/exercises";
import { restEndAlert } from "../core/notifications";
import { useDayNotes, useDayNotesStore } from "../state/dayNotes";
import { cancelRestEnd, scheduleRestEnd } from "../state/notifications";
import { useStore } from "../state/store";
import { useToday } from "../state/today";
import { useTraining, useTrainingStore } from "../state/training";
import { ExerciseList } from "../ui/ExerciseList";
import { haptic } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { Button, Chip, IconButton, LinkButton, SectionLabel, Segmented, Sheet, Spinner, Tap } from "../ui/parts";
import { Stepper } from "../ui/Stepper";
import { Text } from "../ui/Text";
import { c, font, r, role } from "../theme";

const clock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** What a set asks for, in a phrase: "6 \u00D7 7 s on, 3 s off", "10 s hold", "5 reps". */
function describeTarget(t: SetTarget): string {
  if (t.onS === null) return t.reps === null ? "Do the set" : `${t.reps} reps`;
  if ((t.reps ?? 1) > 1) return `${t.reps} \u00D7 ${t.onS} s on, ${t.offS ?? 0} s off`;
  return `${t.onS} s hold`;
}

/** A load stepped by one tap in the user's own unit, kept to a number a plate or a pulley can be set to. */
function bumpLoad(kg: number | null, dir: 1 | -1, units: Units): number {
  const step = weightStep(units.weight);
  const next = roundTo(weightIn(kg ?? 0, units.weight) + dir * step, step);
  return Math.max(-MAX_LOAD_KG, Math.min(MAX_LOAD_KG, weightToKg(next, units.weight)));
}

/** The fields of the next set, which the user adjusts between sets. Only the fields this exercise uses. */
function TargetEditor({ ex, t, units, onPatch }: { ex: Exercise; t: SetTarget; units: Units; onPatch: (p: Partial<SetTarget>) => void }) {
  const has = (f: Exercise["fields"][number]) => ex.fields.includes(f);
  return (
    <View style={{ gap: 4 }}>
      {has("loadKg") ? (
        <Stepper label="Load" value={t.loadKg === null || t.loadKg === 0 ? "BW" : formatWeight(t.loadKg, units.weight, { signed: true })}
          step={units.weight === "lb" ? "1 lb" : "half a kilo"} onChange={(d) => onPatch({ loadKg: bumpLoad(t.loadKg, d, units) })} />
      ) : null}
      {has("timeS") && t.onS !== null ? (
        <Stepper label="Time" value={`${t.onS} s`} min={t.onS <= 1} max={t.onS >= MAX_TIME_S}
          onChange={(d) => onPatch({ onS: Math.max(1, Math.min(MAX_TIME_S, t.onS! + d * (t.onS! >= 30 ? 5 : 1))) })} />
      ) : null}
      {has("reps") && t.reps !== null ? (
        <Stepper label="Reps" value={String(t.reps)} min={t.reps <= 1} max={t.reps >= MAX_REPS} onChange={(d) => onPatch({ reps: Math.max(1, Math.min(MAX_REPS, t.reps! + d)) })} />
      ) : null}
      {has("edgeMm") ? (
        <Stepper label="Edge" value={`${t.edgeMm ?? 20} mm`} min={(t.edgeMm ?? 20) <= 1} max={(t.edgeMm ?? 20) >= MAX_EDGE_MM}
          onChange={(d) => onPatch({ edgeMm: Math.max(1, Math.min(MAX_EDGE_MM, (t.edgeMm ?? 20) + d)) })} />
      ) : null}
      <Stepper label="Rest" value={clock(t.restS * 1000)} min={t.restS <= 0} max={t.restS >= 600} step="15 seconds"
        onChange={(d) => onPatch({ restS: Math.max(0, Math.min(600, t.restS + d * 15)) })} />
      {has("grip") ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
          {(Object.keys(GRIP_LABEL) as Grip[]).filter((g) => g !== "none").map((g) => (
            <Chip key={g} label={GRIP_LABEL[g]} selected={t.grip === g} onPress={() => onPatch({ grip: g })} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Pick the exercises for today, in the order they will be done. */
function Picker({ picked, setPicked, onStart }: { picked: string[]; setPicked: (ids: string[]) => void; onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const notes = useDayNotes();
  const today = useToday();
  const hold = fingerHoldOff(notes, today);
  const fingerPicked = picked.some((id) => exerciseById(id)?.fingerIntense);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text v="secondary">Tap the exercises for today, in the order you will do them.</Text>
        <ExerciseList
          onPress={(e) => setPicked(picked.includes(e.id) ? picked.filter((x) => x !== e.id) : [...picked, e.id])}
          trailing={(e) => {
            const n = picked.indexOf(e.id) + 1;
            return n > 0 ? <Text v="numeral" style={{ fontSize: 26, color: c.starOn }}>{n}</Text> : <Icon name="plus" size={20} color={c.muted} />;
          }}
        />
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 8, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.ground }}>
        {fingerPicked && hold.holdOff ? (
          <Text v="caption" style={{ color: c.danger }}>{`You noted sharp finger pain recently, so finger work is on hold${hold.until ? ` until ${hold.until}` : ""}. It's your call.`}</Text>
        ) : null}
        <Button label={picked.length ? `Start with ${picked.length} ${picked.length === 1 ? "exercise" : "exercises"}` : "Pick an exercise"} disabled={picked.length === 0} onPress={onStart} />
      </View>
    </View>
  );
}

/** Something hurts: say where and how, it goes on today's body note, and you decide what happens next. It never argues. */
function HurtSheet({ visible, onClose, onChoose }: { visible: boolean; onClose: () => void; onChoose: (area: Area, kind: PainKind, next: "keep" | "skip" | "end") => void }) {
  const [area, setArea] = useState<Area>("fingers");
  const [kind, setKind] = useState<PainKind>("achy");
  return (
    <Sheet visible={visible} onClose={onClose} title="Something hurts">
      <View style={{ gap: 14 }}>
        <Text v="secondary">It goes on today's body check-in. Nothing else changes unless you choose it.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {AREAS.map((a) => <Chip key={a} label={AREA_LABEL[a]} selected={area === a} onPress={() => setArea(a)} />)}
        </ScrollView>
        <Segmented<PainKind> options={[{ value: "achy", label: "Achy" }, { value: "sharp", label: "Sharp" }]} value={kind} onChange={setKind} />
        <Button label="Log it and keep going" variant="secondary" onPress={() => onChoose(area, kind, "keep")} />
        <Button label="Log it and skip this exercise" variant="secondary" onPress={() => onChoose(area, kind, "skip")} />
        <Button label="Log it and end the session" variant="danger" onPress={() => onChoose(area, kind, "end")} />
      </View>
    </Sheet>
  );
}

/** A plain text action for the bottom row: three of them share the width, so they never wrap onto a second line or run off the screen. */
function TextAction({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
      <Text v="bodyStrong" style={{ fontSize: 14, color: danger ? c.danger : c.text2 }} numberOfLines={1}>{label}</Text>
    </Tap>
  );
}

/** The running session: one exercise at a time, the screen kept awake, cues by haptic, colour and text (the gym is loud). */
function Runner({ items, startedAt, idFor, onFinished }: { items: RunnerItem[]; startedAt: string; idFor: (i: number) => string; onFinished: (s: RunnerState) => void }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const units = useStore((s) => s.settings.units);
  const notes = useDayNotes();
  const today = useToday();
  const [state, dispatch] = useReducer(step, items, startRunner);
  const [hurt, setHurt] = useState(false);

  // If the phone is put away mid-rest, one alert says when it ends (when the user turned that on). It is cancelled on return.
  const restAlert = useStore((s) => s.settings.notifications.sessionRest);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (a) => {
      if (a === "active") { void cancelRestEnd(); return; }
      const st = latest.current;
      if (!restAlert || st.phase !== "rest" || st.paused) return;
      const name = exerciseById(st.items[st.item].exerciseId)?.name ?? "Next set";
      const alert = restEndAlert(new Date(), st.remainingMs, `${name}, set ${st.set + 1} of ${st.items[st.item].sets.length}`);
      if (alert) void scheduleRestEnd(alert.fireAt, alert.title, alert.body);
    });
    return () => { sub.remove(); void cancelRestEnd(); };
  }, [restAlert]);

  // Real time passed, not the number of ticks, so a phone that stalls for a moment catches up.
  useEffect(() => {
    let last = Date.now();
    const timer = setInterval(() => { const now = Date.now(); dispatch({ type: "tick", ms: now - last }); last = now; }, 200);
    return () => clearInterval(timer);
  }, []);

  // Saved as it goes: each finished set updates the session's entries, so leaving never loses it.
  useEffect(() => {
    if (state.done.length === 0) return;
    void useTrainingStore.getState().saveAll(toEntries(state, startedAt, null, idFor));
  }, [state.done.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (state.phase === "finished") onFinished(state); }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cues: a firm tap at each phase change, a lighter one for each of the last three seconds.
  const lastKey = useRef(`${state.item}.${state.set}.${state.rep}.${state.phase}`);
  const lastSecond = useRef(-1);
  useEffect(() => {
    const key = `${state.item}.${state.set}.${state.rep}.${state.phase}`;
    if (key !== lastKey.current) { lastKey.current = key; lastSecond.current = -1; if (state.phase === "finished") haptic.done(); else haptic.heavy(); }
    if ((state.phase === "on" || state.phase === "off" || state.phase === "rest") && !state.paused) {
      const s = Math.ceil(state.remainingMs / 1000);
      if (s >= 1 && s <= 3 && s !== lastSecond.current) { lastSecond.current = s; haptic.medium(); }
    }
  }, [state]);

  const t = currentTarget(state);
  const item = state.items[state.item];
  const ex = item ? exerciseById(item.exerciseId) : undefined;
  if (!t || !item || !ex) return null;

  const hold = fingerHoldOff(notes, today);
  const working = state.phase === "on" || state.phase === "off" || state.phase === "work";
  const next = state.items[state.item + 1];
  const color = state.phase === "on" || state.phase === "work" ? role.start.color : state.phase === "ready" ? c.text2 : role.middle.color;
  const phaseLabel = state.phase === "on" ? "Hang" : state.phase === "work" ? "Go" : state.phase === "off" ? "Off" : state.phase === "rest" ? "Rest" : "Ready";
  const big = state.phase === "work" ? clock(state.elapsedMs) : state.phase === "ready" ? (isTimed(t) ? clock((t.onS ?? 0) * 1000) : `${t.reps ?? ""}`) : clock(state.remainingMs);

  const choose = (area: Area, kind: PainKind, nextStep: "keep" | "skip" | "end") => {
    void useDayNotesStore.getState().save(reportPain(noteFor(notes, today), today, area, kind));
    setHurt(false);
    if (nextStep === "skip") dispatch({ type: "skipExercise" });
    else if (nextStep === "end") dispatch({ type: "finish" });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <View style={{ gap: 2 }}>
          <Text v="screenTitle" numberOfLines={2}>{ex.name}</Text>
          <Text v="secondary">{`Set ${Math.min(state.set + 1, item.sets.length)} of ${item.sets.length} \u00B7 exercise ${state.item + 1} of ${state.items.length}${setsDoneIn(state, state.item) ? ` \u00B7 ${setsDoneIn(state, state.item)} done` : ""}`}</Text>
        </View>

        <View style={{ alignItems: "center", paddingVertical: 20, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.displaySemi, fontSize: 26, letterSpacing: 1.5, color, textTransform: "uppercase" }}>
            {state.paused ? "Paused" : phaseLabel}{state.phase === "on" && (t.reps ?? 1) > 1 ? ` ${state.rep + 1} of ${t.reps}` : ""}
          </Text>
          <Text accessibilityLabel={`${phaseLabel}, ${big}`} style={{ fontFamily: font.display, fontSize: 104, lineHeight: 112, color: c.text }}>{big}</Text>
          <Text v="bodyStrong">{describeTarget(t)}</Text>
          {state.phase === "rest" ? <Text v="secondary">{`Next: set ${state.set + 1} of ${item.sets.length}`}</Text> : null}
          {state.phase === "work" ? <Text v="secondary">Tap Done when you finish</Text> : null}
        </View>

        {ex.fingerIntense && hold.holdOff && state.phase === "ready" ? (
          <Text v="caption" style={{ color: c.danger }}>{`You noted sharp finger pain recently, so finger work is on hold${hold.until ? ` until ${hold.until}` : ""}. It's your call.`}</Text>
        ) : null}

        {state.phase === "ready" || state.phase === "rest" ? (
          <View style={{ gap: 8 }}>
            <SectionLabel>{state.phase === "ready" ? "This set" : "Next set"}</SectionLabel>
            <TargetEditor ex={ex} t={t} units={units} onPatch={(patch) => dispatch({ type: "edit", patch })} />
            <LinkButton label="Add a set" icon="plus" onPress={() => dispatch({ type: "addSet" })} />
          </View>
        ) : null}

        {working ? (
          <Text v="caption">{[
            ex.fields.includes("loadKg") ? (t.loadKg ? formatWeight(t.loadKg, units.weight, { signed: true }) : "Bodyweight") : null,
            t.edgeMm ? `${t.edgeMm} mm` : null,
            t.grip && t.grip !== "none" ? GRIP_LABEL[t.grip] : null,
          ].filter(Boolean).join(" \u00B7 ")}</Text>
        ) : null}
        {next && state.phase !== "finished" ? <Text v="caption">{`Then: ${exerciseById(next.exerciseId)?.name ?? "next exercise"}`}</Text> : null}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 10, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.ground }}>
        {state.phase === "ready" ? <Button label="Start" onPress={() => dispatch({ type: "start" })} /> : null}
        {working ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 2 }}><Button label="Done" onPress={() => dispatch({ type: "done" })} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" label={state.paused ? "Resume" : "Pause"} onPress={() => dispatch({ type: state.paused ? "resume" : "pause" })} /></View>
          </View>
        ) : null}
        {state.phase === "rest" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 2 }}><Button label="Skip rest" onPress={() => dispatch({ type: "skipRest" })} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" label="+30 s" onPress={() => dispatch({ type: "addRest", ms: 30_000 })} /></View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row" }}>
          <TextAction label="Something hurts" onPress={() => setHurt(true)} />
          <TextAction label="Skip exercise" onPress={() => dispatch({ type: "skipExercise" })} />
          <TextAction label="Finish early" danger onPress={() => dispatch({ type: "finish" })} />
        </View>
      </View>
      <HurtSheet visible={hurt} onClose={() => setHurt(false)} onChoose={choose} />
    </View>
  );
}

/** What was done, an optional effort rating, and save or discard. The sets are already saved; this only adds the rating. */
function Summary({ state, startedAt, idFor }: { state: RunnerState; startedAt: string; idFor: (i: number) => string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const units = useStore((s) => s.settings.units);
  const [effort, setEffort] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => toEntries(state, startedAt, effort, idFor), [state, startedAt, effort, idFor]);
  const leave = () => router.navigate("/train");
  const save = async () => { setBusy(true); await useTrainingStore.getState().saveAll(entries); leave(); };
  const discard = async () => { setBusy(true); for (const e of entries) await useTrainingStore.getState().remove(e.id); leave(); };
  if (entries.length === 0) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 16 }}>
        <Text v="secondary">No sets were done, so nothing was logged.</Text>
        <Button label="Back to Train" onPress={leave} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <Text v="screenTitle">Session done</Text>
        <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
          {entries.map((e, i) => (
            <View key={e.id} style={{ padding: 14, gap: 2, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider }}>
              <Text v="climbName">{entryName(e)}</Text>
              <Text v="secondary">{entryText(e, units)}</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: 8 }}>
          <SectionLabel>How hard was it? (optional)</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Chip key={n} label={String(n)} selected={effort === n} onPress={() => setEffort(effort === n ? null : n)} />)}
          </View>
        </View>
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 8, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.ground }}>
        <Button label={busy ? "Saving" : "Save"} disabled={busy} onPress={() => void save()} />
        <LinkButton label="Discard this session" icon="trash" danger onPress={() => void discard()} />
      </View>
    </View>
  );
}

/** A training session, started from the Train tab or an exercise: pick what to do, run it set by set, then log it. */
export default function Session() {
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entries = useTraining();
  const loaded = useTrainingStore((s) => s.loaded);
  const [picked, setPicked] = useState<string[]>(() => (ids ? ids.split(",").filter((id) => exerciseById(id)) : []));
  const [stage, setStage] = useState<"pick" | "run" | "summary">(picked.length ? "run" : "pick");
  const [final, setFinal] = useState<RunnerState | null>(null);
  const startedAt = useRef(localStamp(new Date())).current;
  const sessionIds = useRef<string[]>([]);
  const idFor = useRef((i: number) => (sessionIds.current[i] ??= randomHex(16))).current;

  // The session starts from last time's values, so it waits for the saved training to be read.
  const items = useMemo<RunnerItem[]>(
    () => (loaded ? picked.map((id) => ({ exerciseId: id, sets: targetsFor(exerciseById(id)!, lastTime(entries, id)) })) : []),
    [loaded, stage === "run"], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon={stage === "run" ? "close" : "back"} label={stage === "run" ? "Leave the session" : "Back"} onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{stage === "pick" ? "New session" : stage === "run" ? "Session" : "Summary"}</Text>
      </View>
      {stage === "pick" ? <Picker picked={picked} setPicked={setPicked} onStart={() => setStage("run")} /> : null}
      {stage === "run" ? (
        loaded ? <Runner items={items} startedAt={startedAt} idFor={idFor} onFinished={(s) => { setFinal(s); setStage("summary"); }} /> : <View style={{ padding: 40 }}><Spinner size="large" /></View>
      ) : null}
      {stage === "summary" && final ? <Summary state={final} startedAt={startedAt} idFor={idFor} /> : null}
    </View>
  );
}
