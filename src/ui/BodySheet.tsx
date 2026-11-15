import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { AREAS, AREA_LABEL, blankNote, MAX_NOTE_LENGTH, nextState, noteFor, STATE_LABEL, type Area, type DayNote } from "../core/body";
import type { Day } from "../core/days";
import { dayTitle } from "../core/logTimeline";
import { useDayNotes, useDayNotesStore } from "../state/dayNotes";
import { c, r } from "../theme";
import { haptic } from "./haptics";
import { Slider } from "./Slider";
import { Button, Chip, LinkButton, SectionLabel, Sheet } from "./parts";
import { Text } from "./Text";

const stops = (max: number) => Array.from({ length: max + 1 }, (_, n) => ({ value: n, label: n === 0 ? "Skip" : String(n) }));
const ENERGY_STOPS = stops(5);
const EFFORT_STOPS = stops(10);

/**
 * The optional body check-in for one day: how each area feels (tap to cycle fine, sore, hurts), energy, how hard the day was, and a
 * note. It is never required and is never asked for in a pop-up; it is offered from the Climb tab and the Log tab. Saving a check-in
 * that says nothing removes it.
 */
export function BodySheet({ visible, onClose, day, today }: { visible: boolean; onClose: () => void; day: Day; today: Day }) {
  const notes = useDayNotes();
  const existing = noteFor(notes, day);
  const [draft, setDraft] = useState<DayNote>(existing ?? blankNote(day));
  const [busy, setBusy] = useState(false);
  // Start from what is saved each time the sheet opens for a day.
  useEffect(() => { if (visible) setDraft(noteFor(useDayNotesStore.getState().notes, day) ?? blankNote(day)); }, [visible, day]);

  const patch = (p: Partial<DayNote>) => setDraft((d) => ({ ...d, ...p }));
  const save = async () => {
    setBusy(true);
    await useDayNotesStore.getState().save({ ...draft, note: draft.note.trim() });
    haptic.success();
    setBusy(false);
    onClose();
  };
  const clear = async () => {
    setBusy(true);
    await useDayNotesStore.getState().remove(day);
    setBusy(false);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`How you feel, ${dayTitle(day, today).toLowerCase()}`}
      footer={<Button label={busy ? "Saving" : "Save"} disabled={busy} onPress={() => void save()} />}>
      <Text v="secondary">Only for you, kept on this phone. Skip anything you like.</Text>
      <SectionLabel>Areas</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {AREAS.map((a: Area) => (
          <Chip key={a} label={`${AREA_LABEL[a]}: ${STATE_LABEL[draft[a]]}`} selected={draft[a] !== "fine"} onPress={() => patch({ [a]: nextState(draft[a]) })} />
        ))}
      </View>
      <Text v="caption" style={{ marginTop: 6 }}>Tap an area to change it: fine, sore, hurts.</Text>
      <SectionLabel>Energy</SectionLabel>
      <Slider label="Energy, 1 to 5" stops={ENERGY_STOPS} value={draft.energy ?? 0} onChange={(v) => patch({ energy: v === 0 ? null : v })} ends={["Skip", "Great"]} />
      <SectionLabel>How hard was the day</SectionLabel>
      <Slider label="Effort, 1 to 10" stops={EFFORT_STOPS} value={draft.effort ?? 0} onChange={(v) => patch({ effort: v === 0 ? null : v })} ends={["Skip", "Everything you had"]} />
      <Text v="caption" style={{ marginTop: 6 }}>It adjusts how big the day counts for rest advice.</Text>
      <SectionLabel>Note</SectionLabel>
      <TextInput value={draft.note} onChangeText={(note) => patch({ note: note.slice(0, MAX_NOTE_LENGTH) })} placeholder="Anything worth remembering (optional)" placeholderTextColor={c.placeholder} multiline
        accessibilityLabel="Note" style={{ minHeight: 80, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, padding: 12, fontSize: 16, fontFamily: "Barlow_400Regular", textAlignVertical: "top" }} />
      {existing ? <View style={{ marginTop: 8 }}><LinkButton label="Remove this check-in" icon="trash" danger onPress={() => void clear()} /></View> : null}
    </Sheet>
  );
}
