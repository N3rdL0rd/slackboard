import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { randomHex } from "../core/api";
import {
  WALL_STYLES, draftFromCombo, draftProblem, gradeOptions, makeOutsideLog, normaliseResult, quickLabel, recentGymCombos,
  type OutsideDraft, type OutsideResult, type QuickCombo, type WallStyleId,
} from "../core/outside";
import { localStamp } from "../core/shareCard";
import { grades } from "../data/grades";
import { useOutside, useOutsideLogs } from "../state/outside";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { GradeStrip } from "./GradeStrip";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Button, Chip, LinkButton, Segmented, Sheet, Tap } from "./parts";
import { Text } from "./Text";

const RESULTS: { value: OutsideResult; label: string }[] = [{ value: "flash", label: "Flash" }, { value: "send", label: "Sent" }, { value: "attempt", label: "Tried" }];

/**
 * A fast way to log a gym climb from the main screen. Last time's combinations are one tap each; otherwise it is a result, a wall
 * angle and a grade. It stays open after saving, so a run of climbs is a run of taps. "More options" opens the full form, filled in.
 */
export function QuickGymLog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const logs = useOutsideLogs();
  const display = useStore((s) => s.settings.gradeDisplay);
  const system = display === "font" ? "font" : "v";
  const combos = useMemo(() => recentGymCombos(logs, 3), [logs]);
  const venue = useMemo(() => logs.find((l) => l.setting === "gym")?.venue ?? "", [logs]);
  const cells = useMemo(() => gradeOptions(grades, system).map((g) => ({ key: g.label, primary: g.label, band: grades.band(g.difficulty) })), [system]);
  const [result, setResult] = useState<OutsideResult>("send");
  const [attempts, setAttempts] = useState(2);
  const [wall, setWall] = useState<WallStyleId | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Opens on what was logged last, so the common case is just Save.
  useEffect(() => {
    if (!visible) return;
    const last = combos[0];
    setResult("send"); setAttempts(2); setWall(last?.wall ?? null); setGrade(last?.gradeSystem === system ? last.gradeLabel : null); setSaved(""); setError("");
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft: OutsideDraft = { setting: "gym", name: "", venue, link: "", wall, gradeSystem: system, gradeLabel: grade, result, attempts, tags: [], note: "" };
  const problem = draftProblem(draft);

  const save = async (d: OutsideDraft) => {
    const p = draftProblem(d);
    if (p) { setError(p); return; }
    setBusy(true); setError("");
    try {
      const log = makeOutsideLog(d, grades, randomHex(), localStamp(new Date()));
      await useOutside.getState().save(log);
      haptic.success();
      setSaved(quickLabel({ result: log.result, attempts: log.attempts, wall: log.wall, gradeSystem: log.gradeSystem, gradeLabel: log.gradeLabel }));
    } catch {
      setError("Couldn't save that. Try again.");
    }
    setBusy(false);
  };
  const more = () => {
    onClose();
    router.push({ pathname: "/outside", params: { setting: "gym", ...(wall ? { wall } : {}), ...(grade && system === "v" ? { grade } : {}), result } });
  };
  const step = (d: number) => setAttempts(normaliseResult("attempt", attempts + d).attempts);

  return (
    <Sheet visible={visible} onClose={onClose} title="Log a gym climb"
      footer={
        <View style={{ gap: 8 }}>
          {error || (problem && saved === "") ? <Text v="caption" style={{ textAlign: "center", color: error ? c.danger : c.text2 }} aria-live="polite">{error || problem}</Text> : null}
          <Button label={busy ? "Saving" : "Save"} disabled={busy || !!problem} onPress={() => void save(draft)} />
          <LinkButton label="More options" icon="chevR" onPress={more} />
        </View>
      }>
      {saved ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: c.lineStrong, marginBottom: 12 }}>
          <Icon name="check" size={20} color={c.starOn} />
          <Text v="bodyStrong" style={{ flex: 1 }}>Saved: {saved}</Text>
        </View>
      ) : null}

      {combos.length ? (
        <>
          <Text v="section" style={{ marginBottom: 8 }}>Again</Text>
          <View style={{ gap: 8 }}>
            {combos.map((cb: QuickCombo) => (
              <Tap key={quickLabel(cb)} accessibilityRole="button" accessibilityLabel={`Log again: ${quickLabel(cb)}`} disabled={busy} onPress={() => void save(draftFromCombo(cb, venue))}
                style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 14, borderRadius: r.input, borderWidth: 1.5, borderColor: c.lineStrong, backgroundColor: c.card, gap: 10 }}>
                <Text v="bodyStrong" style={{ flex: 1 }}>{quickLabel(cb)}</Text>
                <Text v="secondary">Log</Text>
                <Icon name="plus" size={18} color={c.text2} />
              </Tap>
            ))}
          </View>
          <Text v="section" style={{ marginTop: 20, marginBottom: 8 }}>Or something new</Text>
        </>
      ) : null}

      <Segmented options={RESULTS} value={result} onChange={(v) => { setResult(v); if (v === "flash") setAttempts(1); else if (attempts < 2 && v === "send") setAttempts(2); }} />
      {result !== "flash" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 }}>
          <Tap accessibilityRole="button" accessibilityLabel="Fewer attempts" onPress={() => step(-1)} style={stepper}><Icon name="chevL" /></Tap>
          <View style={{ alignItems: "center", minWidth: 70 }}>
            <Text v="numeral" style={{ fontSize: 30 }}>{attempts}</Text>
            <Text v="caption">{attempts === 1 ? "attempt" : "attempts"}</Text>
          </View>
          <Tap accessibilityRole="button" accessibilityLabel="More attempts" onPress={() => step(1)} style={stepper}><Icon name="chevR" /></Tap>
        </View>
      ) : null}

      <Text v="section" style={{ marginTop: 16, marginBottom: 8 }}>Wall angle</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {WALL_STYLES.map((w) => <Chip key={w.id} label={w.label} selected={wall === w.id} onPress={() => setWall(w.id)} />)}
      </View>

      <Text v="section" style={{ marginTop: 16, marginBottom: 4 }}>Grade</Text>
      <GradeStrip cells={cells} value={grade} onChange={(k) => setGrade(String(k))} resetKey={`${visible}:${system}`} />
    </Sheet>
  );
}

const stepper = { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" } as const;
