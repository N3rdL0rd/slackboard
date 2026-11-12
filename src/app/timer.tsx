import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { haptic } from "../ui/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildSchedule, countdown, formatClock, PRESETS, REST_PRESETS_SEC, stateAt, startOf, type Segment, type SegmentKind, type TimerConfig } from "../core/timer";
import { useStore } from "../state/store";
import { Button, Chip, IconButton, Segmented, SectionLabel } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r, role } from "../theme";

type Mode = "rest" | "intervals";
const LABEL: Record<SegmentKind, string> = { prep: "Get ready", work: "Go", rest: "Rest", setrest: "Set rest" };
const COLOR: Record<SegmentKind, string> = { prep: c.text2, work: role.start.color, rest: role.middle.color, setrest: role.middle.color };

/** Haptic cues at phase changes and on the last three seconds. Sound would need a native audio module; haptics work everywhere. */
function useCues(index: number, remainingMs: number, running: boolean, done: boolean) {
  const lastIndex = useRef(-1);
  const lastSecond = useRef(-1);
  useEffect(() => {
    if (!running) return;
    if (index !== lastIndex.current) {
      if (lastIndex.current >= 0) { if (done) haptic.done(); else haptic.heavy(); }
      lastIndex.current = index;
      lastSecond.current = -1;
    }
    const s = Math.ceil(remainingMs / 1000);
    if (!done && s <= 3 && s >= 1 && s !== lastSecond.current) { lastSecond.current = s; haptic.medium(); }
  }, [index, remainingMs, running, done]);
  useEffect(() => { if (!running) lastIndex.current = -1; }, [running]);
}

/** Rest timer between attempts, and interval sessions (repeaters, max hangs, 4x4) with a remembered setup. */
export default function Timer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const config = useStore((s) => s.timer);
  const setConfig = useStore((s) => s.setTimer);
  const restSec = useStore((s) => s.restSec);
  const setRestSec = useStore((s) => s.setRestSec);
  const [mode, setMode] = useState<Mode>("rest");
  const [schedule, setSchedule] = useState<Segment[] | null>(null);

  if (schedule) return <Running schedule={schedule} onExit={() => setSchedule(null)} onBack={() => router.back()} insetsTop={insets.top} insetsBottom={insets.bottom} />;

  const patch = (p: Partial<TimerConfig>) => setConfig({ ...config, ...p });
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="screenTitle" style={{ flex: 1 }}>Timer</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 100 }}>
        <Segmented<Mode> options={[{ value: "rest", label: "Rest" }, { value: "intervals", label: "Intervals" }]} value={mode} onChange={setMode} />
        {mode === "rest" ? (
          <>
            <SectionLabel>Rest between attempts</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {REST_PRESETS_SEC.map((s) => <Chip key={s} label={formatClock(s * 1000)} selected={restSec === s} onPress={() => setRestSec(s)} />)}
            </View>
            <View style={{ marginTop: 16 }}>
              <Stepper label="Custom" value={formatClock(restSec * 1000)} onDec={() => setRestSec(Math.max(15, restSec - 15))} onInc={() => setRestSec(Math.min(3600, restSec + 15))} />
            </View>
          </>
        ) : (
          <>
            <SectionLabel>Presets</SectionLabel>
            <View style={{ gap: 8 }}>
              {PRESETS.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => setConfig(p.config)}
                  style={{ padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: JSON.stringify(p.config) === JSON.stringify(config) ? c.text : c.line }}>
                  <Text v="bodyStrong">{p.name}</Text>
                  <Text v="caption">{p.blurb}</Text>
                </Pressable>
              ))}
            </View>
            <SectionLabel>Setup</SectionLabel>
            <View style={{ gap: 10 }}>
              <Stepper label="Get ready" value={`${config.prepSec} s`} onDec={() => patch({ prepSec: Math.max(0, config.prepSec - 5) })} onInc={() => patch({ prepSec: config.prepSec + 5 })} />
              <Stepper label="Work" value={formatClock(config.workSec * 1000)} onDec={() => patch({ workSec: Math.max(1, config.workSec - (config.workSec > 30 ? 15 : 1)) })} onInc={() => patch({ workSec: config.workSec + (config.workSec >= 30 ? 15 : 1) })} />
              <Stepper label="Rest" value={formatClock(config.restSec * 1000)} onDec={() => patch({ restSec: Math.max(0, config.restSec - (config.restSec > 30 ? 15 : 1)) })} onInc={() => patch({ restSec: config.restSec + (config.restSec >= 30 ? 15 : 1) })} />
              <Stepper label="Reps" value={String(config.reps)} onDec={() => patch({ reps: Math.max(1, config.reps - 1) })} onInc={() => patch({ reps: config.reps + 1 })} />
              <Stepper label="Sets" value={String(config.sets)} onDec={() => patch({ sets: Math.max(1, config.sets - 1) })} onInc={() => patch({ sets: config.sets + 1 })} />
              {config.sets > 1 && <Stepper label="Rest between sets" value={formatClock(config.setRestSec * 1000)} onDec={() => patch({ setRestSec: Math.max(0, config.setRestSec - 15) })} onInc={() => patch({ setRestSec: config.setRestSec + 15 })} />}
            </View>
            <Text v="caption" style={{ marginTop: 12 }}>Total {formatClock(buildSchedule(config).reduce((n, s) => n + s.sec * 1000, 0))}</Text>
          </>
        )}
      </ScrollView>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 12 }}>
        <Button label={mode === "rest" ? `Start ${formatClock(restSec * 1000)} rest` : "Start"} onPress={() => setSchedule(mode === "rest" ? countdown(restSec) : buildSchedule(config))} />
      </View>
    </View>
  );
}

function Stepper({ label, value, onDec, onInc }: { label: string; value: string; onDec: () => void; onInc: () => void }) {
  const btn = { width: 48, height: 44, borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => (e.nativeEvent.actionName === "increment" ? onInc() : onDec())}>
      <Text v="bodyStrong" style={{ flex: 1 }}>{label}</Text>
      <Pressable accessible={false} onPress={onDec} style={btn}><Text v="numeral" style={{ fontSize: 24 }}>-</Text></Pressable>
      <Text v="numeral" style={{ fontSize: 26, minWidth: 64, textAlign: "center" }}>{value}</Text>
      <Pressable accessible={false} onPress={onInc} style={btn}><Text v="numeral" style={{ fontSize: 24 }}>+</Text></Pressable>
    </View>
  );
}

function Running({ schedule, onExit, onBack, insetsTop, insetsBottom }: { schedule: Segment[]; onExit: () => void; onBack: () => void; insetsTop: number; insetsBottom: number }) {
  useKeepAwake();
  // Timing is by wall clock, so a slow frame or a pause never makes the timer drift.
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const base = useRef({ at: Date.now(), elapsed: 0 });
  useEffect(() => {
    if (!running) return;
    base.current = { at: Date.now(), elapsed };
    const id = setInterval(() => setElapsed(base.current.elapsed + (Date.now() - base.current.at)), 100);
    return () => clearInterval(id);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => stateAt(schedule, elapsed), [schedule, elapsed]);
  useEffect(() => { if (st.done) setRunning(false); }, [st.done]);
  useCues(st.index, st.remainingMs, running, st.done);
  const seg = st.segment;
  const color = seg ? COLOR[seg.kind] : c.text;
  const multi = schedule.some((s) => s.kind === "work");
  const reps = schedule.filter((s) => s.kind === "work" && s.set === 1).length;
  const sets = Math.max(...schedule.map((s) => s.set));
  const skipTo = (i: number) => { const t = startOf(schedule, Math.max(0, Math.min(schedule.length, i))); base.current = { at: Date.now(), elapsed: t }; setElapsed(t); };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insetsTop }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="close" label="Stop timer" onPress={onExit} />
        <View style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }} accessibilityLiveRegion="polite">
        <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 44, lineHeight: 56, color }}>{st.done ? "Done" : LABEL[seg!.kind]}</Text>
        <Text accessibilityLabel={st.done ? "Finished" : `${Math.ceil(st.remainingMs / 1000)} seconds left`} style={{ fontFamily: "BarlowCondensed_700Bold", fontSize: 140, lineHeight: 168, color: c.text, includeFontPadding: false }}>{formatClock(st.remainingMs)}</Text>
        {multi && seg && seg.kind !== "prep" ? (
          <Text v="secondary" style={{ fontSize: 18 }}>Rep {seg.rep} of {reps}{sets > 1 ? ` · Set ${seg.set} of ${sets}` : ""}</Text>
        ) : <Text v="secondary"> </Text>}
        <View style={{ width: "70%", height: 8, borderRadius: 4, backgroundColor: c.card, marginTop: 16, overflow: "hidden" }}>
          <View style={{ width: `${st.totalMs ? (st.elapsedMs / st.totalMs) * 100 : 100}%`, height: 8, backgroundColor: color }} />
        </View>
        <Text v="caption">{formatClock(st.totalMs - st.elapsedMs)} left in total</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: insetsBottom + 16 }}>
        {st.done ? (
          <>
            <View style={{ flex: 1 }}><Button variant="secondary" label="Again" onPress={() => { base.current = { at: Date.now(), elapsed: 0 }; setElapsed(0); setRunning(true); }} /></View>
            <View style={{ flex: 1 }}><Button label="Finish" onPress={onBack} /></View>
          </>
        ) : (
          <>
            <View style={{ width: 96 }}><Button variant="secondary" label="Skip" onPress={() => { haptic.light(); skipTo(st.index + 1); }} /></View>
            <View style={{ flex: 1 }}><Button label={running ? "Pause" : "Resume"} onPress={() => { haptic.light(); setRunning((x) => !x); }} /></View>
          </>
        )}
      </View>
    </View>
  );
}
