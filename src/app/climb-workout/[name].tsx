import { useUserId } from "../../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get, submit, workoutReq, workoutTemplatesPath } from "../../core/api";
import { difficultyOf } from "../../core/filters";
import * as repo from "../../core/repo";
import { defaultKnobs, parseWorkout, parseWorkoutTemplates, type Knob, type WorkoutClimb, type WorkoutTemplate } from "../../core/social";
import { isRoute, type Climb } from "../../core/types";
import { getDb } from "../../data/sqlite";
import { grades } from "../../data/grades";
import { createCircuit, setCircuitClimbs } from "../../state/circuits";
import { makeRef } from "../../core/provider";
import { useActiveProviderId } from "../../state/useActive";
import { useStatsFor } from "../../state/layouts";
import { setSequence } from "../../state/sequence";
import { sessionFor } from "../../state/session";
import { useBoard, useStore } from "../../state/store";
import { ClimbThumb } from "../../ui/ClimbThumb";
import { Button, Chip, GradeChip, IconButton, Sheet, SwitchRow } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { workoutRequest } from "../climb-workouts";
import { c, r } from "../../theme";

/** One generated climb workout: a chart of the climbs by difficulty, then the climbs in order with their sections. */
export default function ClimbWorkout() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useBoard();
  const me = useUserId();
  const activeId = useActiveProviderId();
  const display = useStore((s) => s.settings.gradeDisplay);
  const angle = board?.angle ?? 40;
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [knobs, setKnobs] = useState<Record<string, number | boolean>>({});
  const [result, setResult] = useState<WorkoutClimb[] | null>(null);
  const [climbs, setClimbs] = useState<Map<string, Climb>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [saved, setSaved] = useState("");

  const generate = async (t: WorkoutTemplate, k: Record<string, number | boolean>, regen: boolean) => {
    const s = sessionFor();
    if (!s || !board) return;
    setLoading(true); setError(""); setSaved("");
    const res = await submit(s, workoutReq(workoutRequest(board), t.name, k, regen));
    setLoading(false);
    if (res.status !== "ok") { setError(res.status === "retry" ? "Couldn't reach the server. Check your connection." : "The server couldn't build that climb workout."); return; }
    const list = parseWorkout(res.body);
    if (!list) { setError("The server sent something unexpected."); return; }
    setResult(list);
    const found = await repo.climbsByUuids(await getDb(), list.map((x) => x.uuid));
    setClimbs(new Map(found.map((x) => [x.uuid, x])));
  };

  useEffect(() => {
    const s = sessionFor();
    if (!s || !board) return;
    void get(s, workoutTemplatesPath(workoutRequest(board))).then((j) => {
      const t = parseWorkoutTemplates(j).find((x) => x.name === name);
      if (!t) { setError("That climb workout isn't available for this board."); return; }
      setTemplate(t);
      const k = defaultKnobs(t);
      setKnobs(k);
      void generate(t, k, false);
    });
  }, [name, board?.id, board?.angle]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useStatsFor((result ?? []).map((x) => x.uuid), angle);
  const maxD = useMemo(() => Math.max(1, ...(result ?? []).map((x) => x.difficulty)), [result]);
  const minD = useMemo(() => Math.min(...(result ?? [{ difficulty: 0 }]).map((x) => x.difficulty)), [result]);

  const saveAsCircuit = async () => {
    if (!result || !template) return;
    setSaved("Saving");
    const out = await createCircuit({ name: `${template.title} workout`, description: "Made with Workout.", color: "FF8000", isPublic: false, publish: true }, activeId);
    if (!out.ok) { setSaved(out.message); return; }
    const put = await setCircuitClimbs(out.uuid, result.map((x) => makeRef(activeId, x.uuid)));
    setSaved(put.ok ? "Saved as a circuit" : put.message);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }} numberOfLines={1}>{template?.title ?? "Climb workout"}</Text>
        {template && template.knobs.length > 0 && <IconButton icon="filter" label="Climb workout options" onPress={() => setOptions(true)} />}
        <IconButton icon="undo" label="Build a new climb workout" onPress={() => setConfirmRegen(true)} />
      </View>
      {error ? <View style={{ padding: 16, gap: 10 }}><Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text>{template && <Button label="Try again" onPress={() => void generate(template, knobs, false)} />}</View> : null}
      {loading && !result ? <Text v="secondary" style={{ padding: 16 }}>Building your climb workout</Text> : null}
      {result && (
        <JumpList
          data={result}
          keyExtractor={(x, i) => `${x.uuid}:${i}`}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ListHeaderComponent={
            <View style={{ padding: 16, gap: 12 }}>
              <Text v="secondary">{template?.description}</Text>
              <View accessible accessibilityLabel={`Chart of ${result.length} climbs by difficulty`} style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 2 }}>
                {result.map((x, i) => (
                  <View key={i} style={{ flex: 1, height: 12 + ((x.difficulty - minD + 1) / (maxD - minD + 1)) * 78, borderRadius: 2, backgroundColor: grades.band(x.difficulty).bar, opacity: x.section === "Warm Up" ? 0.45 : 1 }} />
                ))}
              </View>
              <Text v="caption">{result.length} climbs · lighter bars are the warm-up</Text>
              <Button variant="secondary" label={saved || "Save as a circuit"} disabled={saved === "Saving" || saved === "Saved as a circuit"} onPress={() => void saveAsCircuit()} />
              {loading ? <Text v="caption">Updating</Text> : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const climb = climbs.get(item.uuid);
            const d = difficultyOf(stats.get(item.uuid)) ?? item.difficulty;
            const label = grades.label(d, display, climb ? isRoute(climb) : false);
            const header = index === 0 || result[index - 1].section !== item.section;
            return (
              <View>
                {header && item.section ? <Text v="section" style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>{item.section}</Text> : null}
                <Pressable accessibilityRole="button" disabled={!climb} onPress={() => { setSequence(result.map((x) => x.uuid).filter((u) => climbs.has(u)), `${template?.title ?? "Workout"}`); router.push({ pathname: "/climb/[uuid]", params: { uuid: item.uuid } }); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                  <Text v="numeral" style={{ width: 32, fontSize: 20, color: c.muted }}>{index + 1}</Text>
                  {climb ? <ClimbThumb climb={climb} size={48} /> : <View style={{ width: 48, height: 48 }} />}
                  <View style={{ flex: 1 }}>
                    <Text v="climbName" numberOfLines={1}>{climb?.name ?? "Not on this device"}</Text>
                    {climb ? <Text v="secondary" numberOfLines={1}>{climb.setter}</Text> : null}
                  </View>
                  <GradeChip band={grades.band(d)} label={label.primary} />
                </Pressable>
              </View>
            );
          }}
        />
      )}

      <Sheet visible={options} onClose={() => setOptions(false)} title="Options" onReset={template ? () => setKnobs(defaultKnobs(template)) : undefined}
        footer={<Button label="Build with these options" onPress={() => { setOptions(false); if (template) void generate(template, knobs, true); }} />}>
        {template?.knobs.map((k) => <KnobRow key={k.name} knob={k} value={knobs[k.name]} onChange={(v) => setKnobs((cur) => ({ ...cur, [k.name]: v }))} />)}
      </Sheet>
      <Sheet visible={confirmRegen} onClose={() => setConfirmRegen(false)} title="Build a new climb workout?"
        footer={<View style={{ gap: 8 }}><Button label="Build new climb workout" onPress={() => { setConfirmRegen(false); if (template) void generate(template, knobs, true); }} /><Button variant="secondary" label="Keep this one" onPress={() => setConfirmRegen(false)} /></View>}>
        <Text v="secondary">This replaces the list with a new one, using the same options.</Text>
      </Sheet>
    </View>
  );
}

function KnobRow({ knob, value, onChange }: { knob: Knob; value: number | boolean | undefined; onChange: (v: number | boolean) => void }) {
  if (knob.type === "boolean") return <SwitchRow label={knob.title} help={knob.description} value={!!value} onChange={onChange} />;
  if (knob.type === "select") {
    return (
      <View style={{ marginTop: 14, gap: 8 }}>
        <Text v="bodyStrong">{knob.title}</Text>
        <Text v="caption">{knob.description}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {knob.options.map((o) => <Chip key={o.value} label={o.title} selected={value === o.value} onPress={() => onChange(o.value)} />)}
        </View>
      </View>
    );
  }
  const n = typeof value === "number" ? value : knob.default;
  const dec = knob.min != null && n <= knob.min;
  const inc = knob.max != null && n >= knob.max;
  return (
    <View style={{ marginTop: 14, gap: 4 }}>
      <Text v="bodyStrong">{knob.title}</Text>
      <Text v="caption">{knob.description}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 }}>
        <Step label={`Fewer ${knob.title}`} text="−" disabled={dec} onPress={() => onChange(n - 1)} />
        <Text v="numeral" style={{ minWidth: 48, textAlign: "center" }}>{n}</Text>
        <Step label={`More ${knob.title}`} text="+" disabled={inc} onPress={() => onChange(n + 1)} />
      </View>
    </View>
  );
}

function Step({ text, label, onPress, disabled }: { text: string; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Text v="numeral">{text}</Text>
    </Pressable>
  );
}
