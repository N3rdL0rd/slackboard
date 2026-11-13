import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState, type ComponentRef } from "react";
import { Linking, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import { cleanLink } from "../core/outside";
import {
  afterSave, draftOf, draftProblem, gradeText, makeRopedLog, MAX_PITCHES, MAX_TRIES, newDraft, normaliseTries, recentCombos, repeatDraft, RESULT_LABEL, RESULTS, SETTING_LABEL, STYLE_LABEL, STYLES,
  type RopedDraft, type RopedLog, type RopedResult, type RopedSetting, type RopedStyle,
} from "../core/roped";
import { localStamp } from "../core/shareCard";
import { parseStamp } from "../core/days";
import { ropedBand, ropedLabel, ropedValue, ROPED_GRADES, ROPED_SYSTEM_LABEL, type RopedSystem } from "../data/ropedGrades";
import { useRoped } from "../state/roped";
import { useStore } from "../state/store";
import { Button, Chip, IconButton, LinkButton, Segmented, SectionLabel, Sheet, Spinner, Tap } from "../ui/parts";
import { GradeStrip } from "../ui/GradeStrip";
import { Icon } from "../ui/Icon";
import { haptic } from "../ui/haptics";
import { Text } from "../ui/Text";
import { WhenRow } from "../ui/WhenRow";
import { c, r } from "../theme";

const SYSTEMS: { value: RopedSystem; label: string }[] = [{ value: "yds", label: ROPED_SYSTEM_LABEL.yds }, { value: "french", label: ROPED_SYSTEM_LABEL.french }];
const SETTINGS: { value: RopedSetting; label: string }[] = [{ value: "indoor", label: SETTING_LABEL.indoor }, { value: "outdoor", label: SETTING_LABEL.outdoor }];
const STYLE_OPTIONS: { value: RopedStyle; label: string }[] = STYLES.map((s) => ({ value: s, label: STYLE_LABEL[s] }));

const input = { minHeight: 48, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontFamily: "Barlow_400Regular" } as const;
const stepperStyle = { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" } as const;

/** Log a roped climb: a route sent, or tried, in a gym or outdoors. Waits for the saved logs so the form can start from the last one. */
export default function Roped() {
  const loaded = useRoped((s) => s.loaded);
  const insets = useSafeAreaInsets();
  if (!loaded) {
    void useRoped.getState().load();
    return <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top, alignItems: "center", justifyContent: "center" }}><Spinner size="large" /></View>;
  }
  return <RopedForm />;
}

function RopedForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, repeat } = useLocalSearchParams<{ id?: string; repeat?: string }>();
  const logs = useRoped((s) => s.logs);
  const unit = useStore((s) => s.settings.units.length);
  const existing = id ? logs.find((l) => l.id === id) : undefined;
  const last = logs[0];
  const [draft, setDraft] = useState<RopedDraft>(() => {
    const from = repeat ? logs.find((l) => l.id === repeat) : undefined;
    if (from) return repeatDraft(from);
    const venue = last ? logs.find((l) => l.setting === last.setting && l.venue)?.venue ?? "" : "";
    return newDraft({ style: last?.style ?? "sport", setting: last?.setting ?? "indoor", venue, gradeSystem: last?.gradeSystem ?? "yds" });
  });
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [when, setWhen] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [more, setMore] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // Editing: fill the form once with the saved log.
  if (existing && loadedId !== existing.id) { setLoadedId(existing.id); setDraft(draftOf(existing, unit)); setWhen(parseStamp(existing.climbedAt)); setMore(true); }

  const patch = (p: Partial<RopedDraft>) => { setError(""); setSaved(""); setDraft((d) => ({ ...d, ...p })); };
  const auto = draft.style === "autobelay";
  const quick = draft.result === "onsight" || draft.result === "flash";
  const gradeCells = useMemo(() => ROPED_GRADES.map((g) => ({
    key: g[draft.gradeSystem], primary: g[draft.gradeSystem], secondary: draft.gradeSystem === "yds" ? g.french : g.yds, band: ropedBand(g.value),
  })), [draft.gradeSystem]);
  const recent = useMemo(() => (existing ? [] : recentCombos(logs)), [logs, existing]);
  const problem = draftProblem(draft, unit);
  const openable = cleanLink(draft.link) || null;
  const hint = draft.gradeLabel ?? last?.gradeLabel ?? ropedLabel(13, draft.gradeSystem);

  const setStyle = (style: RopedStyle) => {
    // Autobelay keeps a lap count and is always a send; any other style starts again at one try.
    patch({ style, ...normaliseTries(style, draft.result, style === "autobelay" ? draft.attempts : 1) });
  };
  const setSetting = (setting: RopedSetting) => {
    // The place field means a gym or a crag, so start from the last one used for this setting.
    patch({ setting, venue: logs.find((l) => l.setting === setting && l.venue)?.venue ?? "" });
  };
  const setResult = (result: RopedResult) => patch(normaliseTries(draft.style, result, draft.attempts));
  const setSystem = (gradeSystem: RopedSystem) => {
    const v = draft.gradeLabel ? ropedValue(draft.gradeSystem, draft.gradeLabel) : null;
    patch({ gradeSystem, gradeLabel: v == null ? null : ropedLabel(v, gradeSystem) });
  };
  const tries = (d: number) => patch({ attempts: Math.max(1, Math.min(MAX_TRIES, draft.attempts + d)) });
  const fromRecent = (l: RopedLog) => { setError(""); setSaved(""); setDraft(repeatDraft(l)); };

  const save = async (another: boolean) => {
    const p = draftProblem(draft, unit);
    if (p) { setError(p); return; }
    setBusy(true);
    const log = makeRopedLog(draft, unit, existing?.id ?? randomHex(), localStamp(when));
    await useRoped.getState().save(log);
    haptic.success();
    setBusy(false);
    if (!another) { router.back(); return; }
    // Keep the form so a session of laps is a tap each: only the result and tries start over.
    setDraft(afterSave(draft));
    setWhen(new Date());
    setSaved(`Saved ${gradeText(log)}${log.style === "autobelay" ? ` x${log.attempts}` : ""}`);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const remove = async () => {
    if (!existing) return;
    setBusy(true);
    await useRoped.getState().remove(existing.id);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{existing ? "Edit roped climb" : "Roped"}</Text>
        {existing ? <IconButton icon="trash" label="Delete this climb" onPress={() => setConfirmDelete(true)} /> : null}
      </View>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 6 }} keyboardShouldPersistTaps="handled">
        {saved ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: c.lineStrong }}>
            <Icon name="check" size={18} color={c.text} />
            <Text v="bodyStrong">{saved}</Text>
          </View>
        ) : null}
        {recent.length ? (
          <>
            <SectionLabel>Again</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {recent.map((l) => <Chip key={l.id} label={`${l.gradeLabel} ${STYLE_LABEL[l.style].toLowerCase()}${l.venue ? ` \u00B7 ${l.venue}` : ""}`} onPress={() => fromRecent(l)} />)}
            </ScrollView>
          </>
        ) : null}

        <SectionLabel>Style</SectionLabel>
        <Segmented options={STYLE_OPTIONS} value={draft.style} onChange={setStyle} />

        <SectionLabel>Where</SectionLabel>
        <Segmented options={SETTINGS} value={draft.setting} onChange={setSetting} />
        <TextInput value={draft.venue} onChangeText={(venue) => patch({ venue })} placeholder={draft.setting === "indoor" ? "Gym (optional)" : "Crag or area (optional)"} placeholderTextColor={c.placeholder}
          accessibilityLabel={draft.setting === "indoor" ? "Gym" : "Crag or area"} style={{ ...input, marginTop: 8 }} />

        <SectionLabel>Grade</SectionLabel>
        <Segmented options={SYSTEMS} value={draft.gradeSystem} onChange={setSystem} />
        <View style={{ marginTop: 6 }}>
          <GradeStrip cells={gradeCells} value={draft.gradeLabel} hint={hint} onChange={(k) => patch({ gradeLabel: String(k) })} resetKey={`${draft.gradeSystem}:${loadedId ?? ""}`} />
        </View>

        {auto ? (
          <>
            <SectionLabel>Laps</SectionLabel>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Tap accessibilityRole="button" accessibilityLabel="Fewer laps" onPress={() => tries(-1)} style={stepperStyle}><Icon name="chevL" /></Tap>
              <View style={{ alignItems: "center", minWidth: 80 }}>
                <Text v="numeral" style={{ fontSize: 34 }}>{draft.attempts}</Text>
                <Text v="caption">{draft.attempts === 1 ? "lap" : "laps"}</Text>
              </View>
              <Tap accessibilityRole="button" accessibilityLabel="More laps" onPress={() => tries(1)} style={stepperStyle}><Icon name="chevR" /></Tap>
              <Text v="caption" style={{ flex: 1 }}>Every lap counts as a route.</Text>
            </View>
          </>
        ) : (
          <>
            <SectionLabel>Result</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {RESULTS.map((x) => <Chip key={x} label={RESULT_LABEL[x]} selected={draft.result === x} onPress={() => setResult(x)} />)}
            </View>
            {quick ? <Text v="caption" style={{ marginTop: 6 }}>{draft.result === "onsight" ? "Sent on the first try, without beta." : "Sent on the first try, with beta."}</Text> : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10 }}>
                <Tap accessibilityRole="button" accessibilityLabel="Fewer tries" onPress={() => tries(-1)} style={stepperStyle}><Icon name="chevL" /></Tap>
                <View style={{ alignItems: "center", minWidth: 80 }}>
                  <Text v="numeral" style={{ fontSize: 34 }}>{draft.attempts}</Text>
                  <Text v="caption">{draft.attempts === 1 ? "try" : "tries"}</Text>
                </View>
                <Tap accessibilityRole="button" accessibilityLabel="More tries" onPress={() => tries(1)} style={stepperStyle}><Icon name="chevR" /></Tap>
                <Text v="caption" style={{ flex: 1 }}>{draft.attempts >= MAX_TRIES ? "That's the most." : draft.result === "redpoint" ? "Tries over time, up to the send." : "Tries on the route."}</Text>
              </View>
            )}
          </>
        )}

        <Tap accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore((m) => !m)} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, marginTop: 6 }}>
          <Text v="bodyStrong" style={{ flex: 1 }}>More details</Text>
          <Text v="caption">Length, pitches, name, link, note</Text>
          <Icon name={more ? "up" : "chevD"} size={18} color={c.muted} />
        </Tap>
        {more ? (
          <View style={{ gap: 8 }}>
            <TextInput value={draft.name} onChangeText={(name) => patch({ name })} placeholder="Route name (optional)" placeholderTextColor={c.placeholder} accessibilityLabel="Route name" style={input} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={draft.length} onChangeText={(length) => patch({ length })} placeholder={`Length in ${unit === "ft" ? "feet" : "metres"}`} placeholderTextColor={c.placeholder}
                accessibilityLabel={`Length in ${unit === "ft" ? "feet" : "metres"}`} keyboardType="decimal-pad" style={{ ...input, flex: 1 }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Tap accessibilityRole="button" accessibilityLabel="Fewer pitches" onPress={() => patch({ pitches: Math.max(1, draft.pitches - 1) })} style={{ ...stepperStyle, width: 44, height: 44, borderRadius: 22 }}><Icon name="minus" size={20} /></Tap>
                <View style={{ alignItems: "center", minWidth: 52 }}>
                  <Text v="numeral" style={{ fontSize: 24 }}>{draft.pitches}</Text>
                  <Text v="caption">{draft.pitches === 1 ? "pitch" : "pitches"}</Text>
                </View>
                <Tap accessibilityRole="button" accessibilityLabel="More pitches" onPress={() => patch({ pitches: Math.min(MAX_PITCHES, draft.pitches + 1) })} style={{ ...stepperStyle, width: 44, height: 44, borderRadius: 22 }}><Icon name="plus" size={20} /></Tap>
              </View>
            </View>
            <TextInput value={draft.link} onChangeText={(link) => patch({ link })} placeholder="Link, such as Mountain Project or theCrag (optional)" placeholderTextColor={c.placeholder}
              accessibilityLabel="Link" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
            {openable ? <LinkButton label="Open link" icon="share" external onPress={() => void Linking.openURL(openable)} /> : null}
            <TextInput value={draft.note} onChangeText={(note) => patch({ note })} placeholder="Beta, how it felt (optional)" placeholderTextColor={c.placeholder} multiline accessibilityLabel="Notes"
              style={{ ...input, minHeight: 80, textAlignVertical: "top" }} />
          </View>
        ) : null}

        <SectionLabel>When</SectionLabel>
        <WhenRow when={when} onChange={setWhen} />
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card, gap: 8 }}>
        {error || problem ? <Text v="secondary" style={{ color: error ? c.danger : c.text2 }} aria-live="polite">{error || problem}</Text> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {!existing ? <View style={{ flex: 1 }}><Button variant="secondary" label="Save and another" disabled={busy || !!problem} onPress={() => void save(true)} /></View> : null}
          <View style={{ flex: 1 }}><Button label={busy ? "Saving" : existing ? "Save changes" : "Save"} disabled={busy} onPress={() => void save(false)} /></View>
        </View>
      </View>
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this climb?"
        footer={<Button variant="danger" label={busy ? "Deleting" : "Delete"} disabled={busy} onPress={() => void remove()} />}>
        <Text v="secondary">It is removed from your roped log and your stats. This can't be undone.</Text>
      </Sheet>
    </View>
  );
}
