import { useState } from "react";
import { Linking, View } from "react-native";
import type { NotificationPrefs } from "../core/settings";
import { permission, requestPermission } from "../state/notifications";
import { useStore } from "../state/store";
import { c } from "../theme";
import { Button, Chip, LinkButton, SectionLabel, Sheet, SwitchRow } from "./parts";
import { Text } from "./Text";

type Key = "review" | "streak" | "rest" | "milestone" | "sessionRest";

const TYPES: { key: Key; label: string; help: string }[] = [
  { key: "review", label: "Weekly review", help: "Monday morning, only when the week before had something in it." },
  { key: "streak", label: "Streak reminder", help: "On the last day that keeps a streak alive, if nothing is logged yet. Only for a streak of 3 days or more." },
  { key: "rest", label: "Rest day reminder", help: "That evening, after a hard day. Advice only." },
  { key: "milestone", label: "Milestone", help: "The one closest milestone or goal, at most once a week." },
  { key: "sessionRest", label: "Rest timer alert", help: "A tap on the shoulder when a rest in a training session ends while the app is in the background." },
];

const REVIEW_TIMES = ["07:00", "08:00", "09:00", "10:00", "18:00"];
const QUIET: { label: string; start: string; end: string }[] = [
  { label: "21:00 to 08:00", start: "21:00", end: "08:00" },
  { label: "22:00 to 07:00", start: "22:00", end: "07:00" },
  { label: "20:00 to 09:00", start: "20:00", end: "09:00" },
  { label: "None", start: "00:00", end: "00:00" },
];

/**
 * The notification switches. Each is off until turned on. Turning the first one on explains what will happen and only then asks the
 * system for permission; a refusal is remembered, and the screen then says how to allow it in the phone's own settings instead of asking again.
 */
export function NotificationSettings() {
  const s = useStore((x) => x.settings);
  const patch = useStore((x) => x.patchSettings);
  const n = s.notifications;
  const [sheet, setSheet] = useState<null | { kind: "explain"; key: Key } | { kind: "denied" }>(null);
  const [note, setNote] = useState("");
  const set = (p: Partial<NotificationPrefs>) => patch({ notifications: { ...n, ...p } });

  const toggle = async (key: Key, on: boolean) => {
    setNote("");
    if (!on) { set({ [key]: false }); return; }
    const p = await permission();
    if (p === "granted") { patch({ notifications: { ...n, [key]: true }, notificationsDeclined: false }); return; }
    if (p === "unavailable") { setNote("Notifications need the installed Slackboard app. They are not available in Expo Go or the browser."); return; }
    setSheet(s.notificationsDeclined ? { kind: "denied" } : { kind: "explain", key });
  };

  const allow = async (key: Key) => {
    const ok = await requestPermission();
    if (ok) { patch({ notifications: { ...n, [key]: true }, notificationsDeclined: false }); setSheet(null); }
    else { patch({ notificationsDeclined: true }); setSheet({ kind: "denied" }); }
  };

  const anyOn = TYPES.some((t) => n[t.key]);
  return (
    <>
      <SectionLabel>Notifications</SectionLabel>
      <Text v="caption" style={{ marginBottom: 6 }}>Local only: scheduled on this phone, with no server. All are off until you turn them on. At most one a day, never for a missed day or a broken streak. Your phone decides when they arrive, so one can be late when it is saving battery.</Text>
      {TYPES.map((t) => <SwitchRow key={t.key} label={t.label} help={t.help} value={n[t.key]} onChange={(on) => void toggle(t.key, on)} />)}
      {note ? <Text v="caption" style={{ color: c.danger }}>{note}</Text> : null}
      {n.review ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text v="bodyStrong">Review time</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {REVIEW_TIMES.map((t) => <Chip key={t} label={t} selected={n.reviewTime === t} onPress={() => set({ reviewTime: t })} />)}
          </View>
        </View>
      ) : null}
      {anyOn ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Text v="bodyStrong">Quiet hours</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {QUIET.map((q) => <Chip key={q.label} label={q.label} selected={n.quietStart === q.start && n.quietEnd === q.end} onPress={() => set({ quietStart: q.start, quietEnd: q.end })} />)}
          </View>
        </View>
      ) : null}

      <Sheet visible={sheet?.kind === "explain"} onClose={() => setSheet(null)} title="Allow notifications?"
        footer={sheet?.kind === "explain" ? <Button label="Continue" onPress={() => void allow(sheet.key)} /> : undefined}>
        <View style={{ gap: 10 }}>
          <Text v="body">Slackboard can remind you about a few things you choose. They are scheduled on your phone and nothing is sent to a server.</Text>
          <Text v="secondary">Your phone will ask for permission next. You can turn each reminder off here whenever you like.</Text>
        </View>
      </Sheet>
      <Sheet visible={sheet?.kind === "denied"} onClose={() => setSheet(null)} title="Notifications are off">
        <View style={{ gap: 12 }}>
          <Text v="body">Your phone is not letting Slackboard show notifications. To get these, allow them in your phone's settings for Slackboard, then come back and turn the switch on.</Text>
          <Button label="Open phone settings" onPress={() => { void Linking.openSettings(); setSheet(null); }} />
          <LinkButton label="Not now" onPress={() => setSheet(null)} />
        </View>
      </Sheet>
    </>
  );
}
