import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import {
  MAX_ATTEMPTS, RESULT_LABEL, cleanLink, SETTING_LABEL, STYLE_TAGS, WALL_STYLES, draftProblem, gradeOptions, makeOutsideLog, normaliseResult, wallStyle,
  type OutsideDraft, type OutsideGradeSystem, type OutsideLog, type OutsideResult, type OutsideSetting, type WallStyleId,
} from "../core/outside";
import { localStamp } from "../core/shareCard";
import { grades } from "../data/grades";
import { useOutside, useOutsideLogs } from "../state/outside";
import { Button, Chip, IconButton, LinkButton, Segmented, SectionLabel, Sheet, Tap } from "../ui/parts";
import { WhenRow } from "../ui/WhenRow";
import { GradeStrip } from "../ui/GradeStrip";
import { Icon } from "../ui/Icon";
import { haptic } from "../ui/haptics";
import { Text } from "../ui/Text";
import { c, r } from "../theme";
import { parseStamp } from "../core/days";

const SYSTEMS: { value: OutsideGradeSystem; label: string }[] = [{ value: "v", label: "V scale" }, { value: "font", label: "Font" }];
const SETTINGS: { value: OutsideSetting; label: string }[] = [{ value: "gym", label: SETTING_LABEL.gym }, { value: "outdoor", label: SETTING_LABEL.outdoor }];
const RESULTS: { value: OutsideResult; label: string }[] = [{ value: "flash", label: RESULT_LABEL.flash }, { value: "send", label: RESULT_LABEL.send }, { value: "attempt", label: RESULT_LABEL.attempt }];

const input = { minHeight: 48, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontFamily: "Barlow_400Regular" } as const;


function draftFrom(l: OutsideLog): OutsideDraft {
  return { setting: l.setting, name: l.name, venue: l.venue, link: l.link, wall: l.wall, gradeSystem: l.gradeSystem ?? "v", gradeLabel: l.gradeLabel, result: l.result, attempts: l.attempts, tags: l.tags, note: l.note };
}

/** The grade in another system that sits nearest the one chosen, so switching V and Font keeps the selection. */
function convertGrade(label: string | null, from: OutsideGradeSystem, to: OutsideGradeSystem): string | null {
  if (!label) return null;
  const cur = gradeOptions(grades, from).find((g) => g.label === label);
  if (!cur) return null;
  return gradeOptions(grades, to).reduce((m, g) => (Math.abs(g.difficulty - cur.difficulty) < Math.abs(m.difficulty - cur.difficulty) ? g : m)).label;
}

/** Log a boulder climbed off the boards: a gym problem or an outdoor boulder, as a send, a flash, or just attempts. */
export default function Outside() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, setting: pSetting, wall: pWall, tag: pTag, grade: pGrade, result: pResult } = useLocalSearchParams<{ id?: string; setting?: string; wall?: string; tag?: string; grade?: string; result?: string }>();
  const logs = useOutsideLogs();
  const existing = id ? logs.find((l) => l.id === id) : undefined;
  const last = logs[0];
  // Opened from a suggestion, the form arrives filled in: setting, wall angle, style tag, grade and result.
  const [draft, setDraft] = useState<OutsideDraft>(() => {
    const setting: OutsideSetting = pSetting === "outdoor" || pSetting === "gym" ? pSetting : last?.setting ?? "gym";
    const result: OutsideResult = pResult === "attempt" || pResult === "flash" || pResult === "send" ? pResult : "send";
    const grade = pGrade && gradeOptions(grades, "v").some((g) => g.label === pGrade) ? pGrade : null;
    return {
      setting, name: "", venue: logs.find((l) => l.setting === setting)?.venue ?? "", link: "", wall: WALL_STYLES.some((w) => w.id === pWall) ? (pWall as WallStyleId) : null,
      gradeSystem: grade ? "v" : last?.gradeSystem ?? "v", gradeLabel: grade, result, attempts: result === "attempt" ? 1 : 2, tags: pTag && (STYLE_TAGS as readonly string[]).includes(pTag) ? [pTag] : [], note: "",
    };
  });
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [when, setWhen] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  // Editing: fill the form once the saved log has been read.
  if (existing && loadedId !== existing.id) { setLoadedId(existing.id); setDraft(draftFrom(existing)); setWhen(parseStamp(existing.climbedAt)); }

  const patch = (p: Partial<OutsideDraft>) => { setError(""); setDraft((d) => ({ ...d, ...p })); };
  const gradeCells = useMemo(() => gradeOptions(grades, draft.gradeSystem).map((g) => ({ key: g.label, primary: g.label, band: grades.band(g.difficulty) })), [draft.gradeSystem]);
  const outdoor = draft.setting === "outdoor";
  const problem = draftProblem(draft);
  const openable = cleanLink(draft.link) || null;
  const wall = draft.wall ? wallStyle(draft.wall) : null;

  const setSetting = (setting: OutsideSetting) => {
    // The venue field means a gym or a crag, so don't carry one over to the other.
    const lastFor = logs.find((l) => l.setting === setting);
    patch({ setting, venue: lastFor?.venue ?? "" });
  };
  const setResult = (result: OutsideResult) => patch({ result, attempts: result === "flash" ? 1 : Math.max(draft.attempts, result === "send" ? 2 : 1) });
  const setSystem = (gradeSystem: OutsideGradeSystem) => patch({ gradeSystem, gradeLabel: convertGrade(draft.gradeLabel, draft.gradeSystem, gradeSystem) });
  const step = (d: number) => patch({ attempts: normaliseResult("attempt", draft.attempts + d).attempts });
  const toggleTag = (t: string) => patch({ tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] });

  const save = async () => {
    const p = draftProblem(draft);
    if (p) { setError(p); return; }
    setBusy(true);
    const log = makeOutsideLog(draft, grades, existing?.id ?? randomHex(), localStamp(when));
    await useOutside.getState().save(log);
    haptic.success();
    router.back();
  };
  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    await useOutside.getState().remove(existing.id);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{existing ? "Edit climb" : "Log a climb"}</Text>
        {existing ? <IconButton icon="trash" label="Delete this climb" onPress={() => setConfirmDelete(true)} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 6 }} keyboardShouldPersistTaps="handled">
        <Text v="secondary" style={{ marginBottom: 8 }}>Stays on this phone. Helps Suggested pick what to try.</Text>
        <Segmented options={SETTINGS} value={draft.setting} onChange={setSetting} />

        <SectionLabel>How did it go</SectionLabel>
        <Segmented options={RESULTS} value={draft.result} onChange={setResult} />
        {draft.result !== "flash" ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 }}>
            <Tap accessibilityRole="button" accessibilityLabel="Fewer attempts" onPress={() => step(-1)} style={stepper}><Icon name="chevL" /></Tap>
            <View style={{ alignItems: "center", minWidth: 80 }}>
              <Text v="numeral" style={{ fontSize: 34 }}>{draft.attempts}</Text>
              <Text v="caption">{draft.attempts === 1 ? "attempt" : "attempts"}</Text>
            </View>
            <Tap accessibilityRole="button" accessibilityLabel="More attempts" onPress={() => step(1)} style={stepper}><Icon name="chevR" /></Tap>
            <Text v="caption" style={{ flex: 1 }}>{draft.attempts >= MAX_ATTEMPTS ? "That's the most." : draft.result === "send" ? "Tries until it went." : "Tries without a send."}</Text>
          </View>
        ) : <Text v="caption" style={{ marginTop: 6 }}>Sent on the first try.</Text>}

        <SectionLabel>Wall angle</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {WALL_STYLES.map((w) => <Chip key={w.id} label={w.label} selected={draft.wall === w.id} onPress={() => patch({ wall: w.id })} />)}
        </View>
        <Text v="caption" style={{ marginTop: 4 }}>{wall ? wall.hint : "Pick the closest."}</Text>

        <SectionLabel>Grade</SectionLabel>
        <Segmented options={SYSTEMS} value={draft.gradeSystem} onChange={setSystem} />
        {draft.result === "attempt" ? <View style={{ flexDirection: "row", marginTop: 10 }}><Chip label="No grade" selected={draft.gradeLabel == null} onPress={() => patch({ gradeLabel: null })} /></View> : null}
        <View style={{ marginTop: 6 }}>
          <GradeStrip cells={gradeCells} value={draft.gradeLabel} onChange={(k) => patch({ gradeLabel: String(k) })} resetKey={`${draft.gradeSystem}:${loadedId ?? ""}`} />
        </View>

        <SectionLabel>{outdoor ? "Boulder" : "Problem"}</SectionLabel>
        <TextInput value={draft.name} onChangeText={(name) => patch({ name })} placeholder={outdoor ? "Boulder name (optional)" : "Colour or tag (optional)"} placeholderTextColor={c.placeholder}
          accessibilityLabel="Name" style={input} />
        <TextInput value={draft.venue} onChangeText={(venue) => patch({ venue })} placeholder={outdoor ? "Crag or area (optional)" : "Gym (optional)"} placeholderTextColor={c.placeholder}
          accessibilityLabel={outdoor ? "Crag or area" : "Gym"} style={{ ...input, marginTop: 8 }} />
        {outdoor ? (
          <TextInput value={draft.link} onChangeText={(link) => patch({ link })} placeholder="Link, such as Mountain Project or theCrag (optional)" placeholderTextColor={c.placeholder}
            accessibilityLabel="Link" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ ...input, marginTop: 8 }} />
        ) : null}
        {outdoor && openable ? <LinkButton label="Open link" icon="share" external onPress={() => void Linking.openURL(openable)} style={{ marginTop: 4 }} /> : null}

        <SectionLabel>Style</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {STYLE_TAGS.map((t) => <Chip key={t} label={t} selected={draft.tags.includes(t)} onPress={() => toggleTag(t)} />)}
        </View>

        <SectionLabel>Notes</SectionLabel>
        <TextInput value={draft.note} onChangeText={(note) => patch({ note })} placeholder="Beta, how it felt (optional)" placeholderTextColor={c.placeholder} multiline accessibilityLabel="Notes"
          style={{ ...input, minHeight: 80, textAlignVertical: "top" }} />

        <SectionLabel>When</SectionLabel>
        <WhenRow when={when} onChange={setWhen} />
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card, gap: 8 }}>
        {error || problem ? <Text v="secondary" style={{ color: error ? c.danger : c.text2 }} aria-live="polite">{error || problem}</Text> : null}
        <Button label={busy ? "Saving" : existing ? "Save changes" : "Save"} disabled={busy} onPress={() => void save()} />
      </View>
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this climb?"
        footer={<Button variant="danger" label={busy ? "Deleting" : "Delete"} disabled={busy} onPress={() => void remove()} />}>
        <Text v="secondary">It is removed from your log and from the angle advice. This can't be undone.</Text>
      </Sheet>
    </View>
  );
}

const stepper = { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" } as const;
