import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import type { SaveSendInput } from "../core/api";
import { difficultyOf } from "../core/filters";
import type { AngleStat, LogEntry } from "../core/types";
import { grades } from "../data/grades";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { Icon } from "./Icon";
import { GradeStrip } from "./GradeStrip";
import { Button, Segmented, Sheet, Stars, Tap } from "./parts";
import { Text } from "./Text";

export type LogMode = "send" | "attempt";

/** `yyyy-MM-dd HH:mm:ss` from the server is local time at logging. */
const parseServerTime = (t: string) => new Date(t.replace(" ", "T"));

function whenLabel(d: Date): string {
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(today.getTime() - 86400000);
  const day = same(d, today) ? "Today" : same(d, yesterday) ? "Yesterday" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * Log a send or attempts, or edit an existing entry. Nothing is seeded silently: grade and stars start
 * filled in only when the community has enough sends to trust (the official app uses more than 99).
 */
export function LogSheet({ visible, onClose, mode, setMode, climbUuid, climbName, angle, isMirrored, mirror, setMirror, stat, edit, saving, error, onSave }: {
  visible: boolean; onClose: () => void; mode: LogMode; setMode: (m: LogMode) => void; climbUuid: string; climbName: string; angle: number;
  isMirrored: boolean; mirror: boolean; setMirror: (m: boolean) => void; stat: AngleStat | undefined; edit?: LogEntry; saving: boolean; error: boolean;
  onSave: (input: SaveSendInput, text: string) => void;
}) {
  const settings = useStore((s) => s.settings);
  const trusted = !!stat && stat[2] > 99;
  // The community's grade for this climb at this angle, if it has one. It is a starting point, never a limit: any grade can be picked.
  const community = stat ? Math.round(difficultyOf(stat)!) : null;
  const [attempts, setAttempts] = useState(1);
  const [chosen, setChosen] = useState<number | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState(new Date());
  const [iosPicker, setIosPicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (edit) {
      setAttempts(edit.bidCount); setChosen(edit.isSend ? edit.difficulty : null); setStars(edit.isSend ? edit.quality : null); setNotes(edit.comment); setWhen(parseServerTime(edit.climbedAt));
    } else {
      setAttempts(1); setChosen(trusted ? community : null); setStars(trusted ? Math.round(stat![3]) : null); setNotes(""); setWhen(new Date());
    }
    setIosPicker(false);
  }, [visible, climbUuid, angle, edit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickWhen = () => {
    if (Platform.OS !== "android") { setIosPicker((v) => !v); return; }
    DateTimePickerAndroid.open({
      value: when, mode: "date", maximumDate: new Date(),
      onChange: (e, day) => {
        if (e.type !== "set" || !day) return;
        DateTimePickerAndroid.open({
          value: day, mode: "time",
          onChange: (e2, t) => {
            if (e2.type !== "set" || !t) return;
            const next = new Date(day);
            next.setHours(t.getHours(), t.getMinutes(), 0, 0);
            setWhen(next > new Date() ? new Date() : next);
          },
        });
      },
    });
  };

  const cells = grades.rows.map((row) => {
    const l = grades.label(row.difficulty, settings.gradeDisplay);
    return { key: row.difficulty, primary: l.primary, secondary: l.secondary, band: grades.band(row.difficulty) };
  });
  const isSend = mode === "send";
  const canSave = !isSend || (chosen !== null && stars !== null);
  const why = isSend && chosen === null ? "Pick the grade" : isSend && stars === null ? "Rate the climb" : "";
  const isFlash = isSend && attempts === 1;
  const title = edit ? "Edit entry" : isSend ? "Log send" : "Log attempts";

  return (
    <Sheet visible={visible} onClose={onClose} title={title}
      footer={
        <View style={{ gap: 8 }}>
          {error ? <Text v="caption" style={{ textAlign: "center", color: c.danger }} aria-live="polite">Couldn't save that. Try again.</Text> : null}
          {!canSave && <Text v="caption" style={{ textAlign: "center" }}>{why}</Text>}
          <Button label={saving ? "Saving" : edit ? "Save changes" : isSend ? "Save send" : "Save attempts"} disabled={!canSave || notes.length > 255 || saving}
            onPress={() => onSave(
              { climbUuid, angle, isMirror: mirror, bidCount: attempts, comment: notes, climbedAt: when, ...(isSend ? { quality: stars ?? 0, difficulty: chosen ?? 0 } : {}) },
              edit ? "Entry updated" : isSend ? (isFlash ? "Flash logged" : `Send logged · ${attempts} attempts`) : `${attempts} ${attempts === 1 ? "attempt" : "attempts"} logged`,
            )} />
        </View>
      }>
      {!edit && <Segmented options={[{ value: "send", label: "Log send" }, { value: "attempt", label: "Attempts only" }]} value={mode} onChange={setMode} />}
      <View style={{ marginTop: 16, gap: 2 }}>
        <Text v="climbName">{climbName}</Text>
        <Text v="secondary">{angle}°{isMirrored ? ` · ${mirror ? "Mirrored" : "Original"}` : ""}</Text>
      </View>
      {isMirrored && (
        <View style={{ marginTop: 12 }}>
          <Segmented options={[{ value: "o", label: "Original" }, { value: "m", label: "Mirrored" }]} value={mirror ? "m" : "o"} onChange={(v) => setMirror(v === "m")} />
        </View>
      )}

      <Text v="section" style={{ marginTop: 20, marginBottom: 8 }}>Attempts</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Stepper label="Fewer attempts" icon="chevL" onPress={() => setAttempts(Math.max(1, attempts - 1))} />
        <Text v="numeral" style={{ minWidth: 40, textAlign: "center" }}>{attempts}</Text>
        <Stepper label="More attempts" icon="chevR" onPress={() => setAttempts(Math.min(100, attempts + 1))} />
        {isFlash && <Text v="secondary">Flash</Text>}
      </View>

      {isSend && (
        <>
          <Text v="section" style={{ marginTop: 20, marginBottom: 8 }}>Grade</Text>
          <GradeStrip cells={cells} value={chosen} hint={community} onChange={(k) => setChosen(k as number)} resetKey={`${visible}:${climbUuid}:${angle}:${edit?.id ?? ""}`} />
          <Text v="caption" style={{ marginTop: 4 }}>
            {community != null ? `Community grade at ${angle}\u00B0: ${grades.label(community, settings.gradeDisplay).primary}. ` : ""}
            {!trusted && !edit ? "Not enough sends to suggest a grade; pick your own. " : ""}Scroll for every grade.
          </Text>

          <Text v="section" style={{ marginTop: 20, marginBottom: 8 }}>Quality</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <Tap key={i} accessibilityRole="button" accessibilityLabel={`${i} ${i === 1 ? "star" : "stars"}`} accessibilityState={{ selected: stars === i }} onPress={() => setStars(i)}
                style={{ flex: 1, height: 52, borderRadius: r.input, borderWidth: 2, alignItems: "center", justifyContent: "center",
                  borderColor: stars === i ? c.text : c.lineStrong, backgroundColor: stars === i ? c.raised : c.card }}>
                <Stars value={i} size={18} />
              </Tap>
            ))}
          </View>
        </>
      )}

      <Text v="section" style={{ marginTop: 20, marginBottom: 8 }}>Notes</Text>
      <TextInput value={notes} onChangeText={setNotes} multiline placeholder="Optional" placeholderTextColor={c.placeholder} accessibilityLabel="Notes"
        style={{ minHeight: 72, borderRadius: r.input, borderWidth: 1, borderColor: notes.length > 255 ? c.danger : c.line, backgroundColor: c.card, color: c.text, padding: 12, fontSize: 16, fontFamily: "Barlow_400Regular" }} />
      <Text v="caption" style={{ marginTop: 4, textAlign: "right", color: notes.length > 255 ? c.danger : c.caption }}>{notes.length} / 255</Text>

      <Text v="section" style={{ marginTop: 16, marginBottom: 8 }}>When</Text>
      <Tap accessibilityRole="button" accessibilityLabel={`When: ${whenLabel(when)}. Change`} onPress={pickWhen}
        style={{ minHeight: 52, flexDirection: "row", alignItems: "center", borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, paddingHorizontal: 14, gap: 8 }}>
        <Text v="bodyStrong" style={{ flex: 1 }}>{whenLabel(when)}</Text>
        <Text v="secondary">Change</Text>
        <Icon name="chevR" size={18} color={c.muted} />
      </Tap>
      {Platform.OS === "ios" && iosPicker && <DateTimePicker value={when} mode="datetime" maximumDate={new Date()} onChange={(_, d) => d && setWhen(d)} themeVariant="dark" />}
    </Sheet>
  );
}

function Stepper({ icon, label, onPress }: { icon: "chevL" | "chevR"; label: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} />
    </Tap>
  );
}
