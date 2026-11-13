import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { boardEntryOf, offBoardLogOf, ropedLogOf, trainingEntryOf, type Activity, type ActivityKind } from "../../core/activity";
import { noteFor, noteSummary, type DayNote } from "../../core/body";
import { parseStamp } from "../../core/days";
import { dayCards, dayTitle, filterByKind, KIND_FILTERS, timelineTotals, type CardLabels, type DayCard, type KindFilter } from "../../core/logTimeline";
import { vOf } from "../../core/milestones";
import { SETTING_LABEL, RESULT_LABEL, wallStyle, type OutsideLog } from "../../core/outside";
import { describeRoped, ropedTitle } from "../../core/roped";
import type { LogEntry } from "../../core/types";
import { bandForV, gradeColor, type GradeBand, type GradeDisplay } from "../../core/grades";
import { ropedBand, ropedLabel, type RopedSystem } from "../../data/ropedGrades";
import { grades } from "../../data/grades";
import { useData } from "../../state/data";
import { useDayNotes } from "../../state/dayNotes";
import { useOutbox } from "../../state/outbox";
import { useRopedLogs } from "../../state/roped";
import { entryText } from "../../core/training";
import type { Units } from "../../core/settings";
import { activePin, pinProvider } from "../../state/active";
import { setSequence } from "../../state/sequence";
import { deleteLogEntry, editLogEntry, logSend } from "../../state/serverSends";
import { useBoard, useStore } from "../../state/store";
import { useSpaces } from "../../state/spaces";
import { commonLabel } from "../../state/stats";
import { useActivities, useToday } from "../../state/today";
import { BodySheet } from "../../ui/BodySheet";
import { Icon, type IconName } from "../../ui/Icon";
import { LogPicker } from "../../ui/LogPicker";
import { LogSheet, type LogMode } from "../../ui/LogSheet";
import { Chip, GradeChip, IconButton, LinkButton, Segmented, Sheet, Stars, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

type Range = "day" | "week" | "month" | "year" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }, { value: "all", label: "All" },
];
const DAYS: Record<Range, number> = { day: 1, week: 7, month: 31, year: 366, all: Infinity };

/** The icon that tells the kinds of entry apart by shape. */
const KIND_ICON: Record<ActivityKind, IconName> = { board: "board", offBoard: "rock", roped: "rope", training: "muscle" };

/** Server times are `yyyy-MM-dd HH:mm:ss` in the device's local time at logging, so parse them as local. */
const at = (t: string) => new Date(t.replace(" ", "T"));
const clock = (stamp: string) => parseStamp(stamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function LogTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useBoard();
  const display = useStore((s) => s.settings.gradeDisplay);
  const { pending, rejected, clearRejected } = useOutbox();
  const activities = useActivities();
  const notes = useDayNotes();
  const today = useToday();
  const spaces = useSpaces((s) => s.spaces);
  const logSpaces = useSpaces((s) => s.logSpaces);
  const ropedSystem = useRopedLogs()[0]?.gradeSystem ?? "yds";
  const units = useStore((s) => s.settings.units);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");
  const [kind, setKind] = useState<KindFilter>("all");
  const [picker, setPicker] = useState(false);
  const [bodyDay, setBodyDay] = useState<string | null>(null);
  const [undo, setUndo] = useState<LogEntry | null>(null);
  const [actions, setActions] = useState<LogEntry | null>(null);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [mirror, setMirror] = useState(false);
  // Which boards' data any entry belongs to isn't needed here: pending entries come with the board entries themselves.
  const logbookCount = useData((d) => d.logbook.length);

  const inRange = useMemo(
    () => filterByKind(activities.filter((a) => Date.now() - parseStamp(a.at).getTime() <= DAYS[range] * 86400000), kind),
    [activities, range, kind],
  );
  const labels: CardLabels = useMemo(() => ({ boulder: (g) => commonLabel(g, display), roped: (v) => ropedLabel(v, ropedSystem) ?? "" }), [display, ropedSystem]);
  const placeOf = useMemo(() => (a: Activity): string | null => {
    const e = boardEntryOf(a);
    if (e) {
      const ls = logSpaces[e.id];
      return ls ? (spaces.find((s) => s.id === ls.spaceId)?.name ?? ls.spaceName) : null;
    }
    return offBoardLogOf(a)?.venue || ropedLogOf(a)?.venue || null;
  }, [spaces, logSpaces]);
  const cards = useMemo(() => dayCards(inRange, labels, placeOf), [inRange, labels, placeOf]);
  const totals = useMemo(() => timelineTotals(inRange), [inRange]);

  // The bars under the numbers: boulder grades, or roped grades when only roped is shown.
  const bars = useMemo(() => {
    const m = new Map<number, number>();
    const roped = kind === "roped";
    for (const a of inRange) {
      if (!a.facts.send || a.facts.grade === null) continue;
      if (roped ? a.kind !== "roped" : a.facts.discipline !== "boulder") continue;
      const key = roped ? a.facts.grade : vOf(a.facts.grade);
      m.set(key, (m.get(key) ?? 0) + (roped ? (ropedLogOf(a)?.style === "autobelay" ? ropedLogOf(a)!.attempts : 1) : 1));
    }
    return { roped, rows: [...m].sort((a, b) => a[0] - b[0]) };
  }, [inRange, kind]);
  const max = Math.max(1, ...bars.rows.map((x) => x[1]));

  const previousProvider = useRef<string | null>(null);
  const del = (e: LogEntry) => { setActions(null); void deleteLogEntry(e); setUndo(e); };
  const closeEditor = () => { pinProvider(previousProvider.current); setEditing(null); };
  const edit = (e: LogEntry) => { setActions(null); setMirror(e.isMirror); previousProvider.current = activePin(); pinProvider(e.provider); setEditing(e); };
  const openEntry = (a: Activity) => {
    const e = boardEntryOf(a);
    if (e) { setActions(e); return; }
    const off = offBoardLogOf(a);
    if (off) { router.push({ pathname: "/outside", params: { id: off.id } }); return; }
    const rope = ropedLogOf(a);
    if (rope) { router.push({ pathname: "/roped", params: { id: rope.id } }); return; }
    const t = trainingEntryOf(a);
    if (t) router.push({ pathname: "/training/[id]", params: { id: t.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, paddingTop: 8 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>Log</Text>
        <IconButton icon="plus" label="Log something" onPress={() => setPicker(true)} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
        {KIND_FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={kind === f.value} onPress={() => setKind(f.value)} />)}
      </ScrollView>
      {(pending > 0 || rejected.length > 0) && (
        <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: rejected.length ? c.danger : c.lineStrong, gap: 4 }}>
          {pending > 0 && <Text v="bodyStrong">{pending === 1 ? "1 change is waiting to upload" : `${pending} changes are waiting to upload`}</Text>}
          {pending > 0 && <Text v="caption">Saved on this phone. They upload when you're back online.</Text>}
          {rejected.map((m, i) => <Text key={i} v="secondary" style={{ color: c.danger }}>{m}</Text>)}
          {rejected.length > 0 && <LinkButton label="Dismiss" icon="close" onPress={clearRejected} />}
        </View>
      )}
      <JumpList
        data={cards}
        keyExtractor={(g) => g.day}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {([["Days", totals.days], ["Sends", totals.sends], ["Climbs", totals.climbs]] as const).map(([l, n]) => (
                <View key={l} style={{ flex: 1, backgroundColor: c.card, borderRadius: r.card, padding: 12, borderWidth: 1, borderColor: c.line }}>
                  <Text v="numeral" style={{ fontSize: 34 }}>{n}</Text>
                  <Text v="caption">{l}</Text>
                </View>
              ))}
            </View>
            {bars.rows.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text v="section">{bars.roped ? "Routes by grade" : "Sends by grade"}</Text>
                {bars.rows.map(([g, n]) => {
                  const band = bars.roped ? ropedBand(g) : grades.band(grades.rangeForV(g, g)[0]);
                  return (
                    <View key={g} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text v="bodyStrong" style={{ width: bars.roped ? 56 : 36, color: bars.roped ? band.bar : gradeColor(g) }}>{bars.roped ? ropedLabel(g, ropedSystem) : `V${g}`}</Text>
                      <View style={{ height: 14, width: `${(n / max) * 70}%`, backgroundColor: band.bar, borderRadius: 4 }} />
                      <Text v="caption">{n}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>{logbookCount === 0 && activities.length === 0 ? "Nothing logged yet" : "Nothing here"}</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>{activities.length === 0 ? "Tap + to log a climb, or open a climb and tap Log send. Your days show up here." : "Nothing matches this range and filter."}</Text>
          </View>
        }
        renderItem={({ item: g }) => (
          <DayCardView card={g} today={today} open={expanded === g.day} labels={labels} display={display} ropedSystem={ropedSystem} units={units}
            note={noteFor(notes, g.day)} onToggle={() => setExpanded(expanded === g.day ? null : g.day)} onEntry={openEntry} onBody={() => setBodyDay(g.day)} />
        )}
      />
      {undo && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 16, backgroundColor: c.raised, borderRadius: r.input, borderWidth: 1, borderColor: c.lineStrong, flexDirection: "row", alignItems: "center", paddingLeft: 16 }}>
          <Text v="bodyStrong" style={{ flex: 1 }}>Entry deleted</Text>
          <Tap accessibilityRole="button" onPress={() => { void logSend({ climbUuid: undo.climbUuid, angle: undo.angle, isMirror: undo.isMirror, bidCount: undo.bidCount, comment: undo.comment, climbedAt: at(undo.climbedAt), ...(undo.isSend ? { quality: undo.quality, difficulty: undo.difficulty } : {}) }); setUndo(null); }}
            style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}>
            <Text v="bodyStrong" style={{ color: c.starOn }}>Undo</Text>
          </Tap>
        </View>
      )}

      <LogPicker visible={picker} onClose={() => setPicker(false)} />
      <BodySheet visible={bodyDay !== null} onClose={() => setBodyDay(null)} day={bodyDay ?? today} today={today} />
      <Sheet visible={!!actions} onClose={() => setActions(null)} title={actions?.climbName ?? ""}>
        {actions && (
          <View style={{ gap: 8 }}>
            <Action label="Open climb" onPress={() => { const e = actions; setActions(null); setSequence(null); router.push({ pathname: "/climb/[uuid]", params: { uuid: e.climbUuid, provider: e.provider } }); }} />
            <Action label="Edit" onPress={() => edit(actions)} />
            <Action label="Delete" danger onPress={() => del(actions)} />
          </View>
        )}
      </Sheet>
      {editing && board && (
        <LogSheet
          visible
          onClose={closeEditor}
          mode={editing.isSend ? "send" : "attempt"} setMode={(_: LogMode) => {}}
          climbUuid={editing.climbUuid} climbName={editing.climbName} angle={editing.angle}
          isMirrored={board.spec.isMirrored} mirror={mirror} setMirror={setMirror} stat={undefined} edit={editing} saving={saving} error={false}
          onSave={async (input) => { setSaving(true); await editLogEntry(editing, input); setSaving(false); closeEditor(); }}
        />
      )}
    </View>
  );
}

/** One day: the title, where, and a one-line summary; open it for the entries, each with the icon of its kind, and the day's check-in. */
function DayCardView({ card, today, open, labels, display, ropedSystem, units, note, onToggle, onEntry, onBody }: {
  card: DayCard; today: string; open: boolean; labels: CardLabels; display: GradeDisplay; ropedSystem: RopedSystem; units: Units;
  note: DayNote | undefined; onToggle: () => void; onEntry: (a: Activity) => void; onBody: () => void;
}) {
  const title = dayTitle(card.day, today);
  const where = card.places.join(" \u00B7 ");
  const check = note ? noteSummary(note) : "";
  return (
    <View style={{ marginHorizontal: 16, marginTop: 14, backgroundColor: c.card, borderRadius: r.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
      <Tap accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}${where ? `, ${where}` : ""}. ${card.summary}. ${open ? "Collapse" : "Expand"}`}
        onPress={onToggle} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text v="climbName">{title}</Text>
          {where ? <Text v="bodyStrong">{where}</Text> : null}
          <Text v="secondary">{card.summary}</Text>
          {check ? <Text v="caption">{check}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {card.hardestRoped != null ? <GradeChip band={ropedBand(card.hardestRoped)} label={labels.roped(card.hardestRoped)} /> : null}
          {card.hardestBoulder != null ? <GradeChip band={bandForV(vOf(card.hardestBoulder))} label={labels.boulder(card.hardestBoulder)} /> : null}
        </View>
        <Icon name={open ? "chevD" : "chevR"} size={20} color={c.muted} />
      </Tap>
      {open && card.entries.map((a) => <EntryRow key={a.id} a={a} display={display} ropedSystem={ropedSystem} units={units} onPress={() => onEntry(a)} />)}
      {open && (
        <Tap accessibilityRole="button" accessibilityLabel={note ? "Edit how you felt this day" : "Add how you felt this day"} onPress={onBody}
          style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.divider }}>
          <Icon name="edit" size={18} color={c.muted} />
          <Text v="bodyStrong" style={{ flex: 1, fontSize: 14 }}>{note ? "How you felt" : "How did you feel?"}</Text>
          {note?.note ? <Text v="caption" numberOfLines={1} style={{ flex: 1, textAlign: "right" }}>{note.note}</Text> : null}
        </Tap>
      )}
    </View>
  );
}

const resultLine = (l: OutsideLog) => (l.result === "attempt" ? `${l.attempts} ${l.attempts === 1 ? "attempt" : "attempts"}` : l.result === "flash" ? RESULT_LABEL.flash : `Sent in ${l.attempts}`);

/** One entry in an open day: its kind's icon, what it was, and its grade. */
function EntryRow({ a, display, ropedSystem, units, onPress }: { a: Activity; display: GradeDisplay; ropedSystem: RopedSystem; units: Units; onPress: () => void }) {
  const entry = boardEntryOf(a);
  const off = offBoardLogOf(a);
  const rope = ropedLogOf(a);
  const training = trainingEntryOf(a);
  let name = a.title;
  let sub = clock(a.at);
  let chip: { band: GradeBand; label: string } | null = null;
  let stars: number | null = null;
  let comment = "";
  if (entry) {
    const l = entry.isSend ? grades.label(entry.difficulty, display) : null;
    sub = `${clock(entry.climbedAt)} \u00B7 ${entry.angle}\u00B0${entry.isMirror ? " \u00B7 Mirrored" : ""} \u00B7 ${entry.bidCount} ${entry.bidCount === 1 ? "attempt" : "attempts"}${entry.isSend && entry.bidCount === 1 ? " \u00B7 Flash" : ""}${entry.pending ? " \u00B7 Waiting to upload" : ""}`;
    if (l) chip = { band: grades.band(entry.difficulty), label: l.primary };
    if (entry.isSend) stars = entry.quality;
    comment = entry.comment;
  } else if (off) {
    name = off.name || wallStyle(off.wall).label;
    sub = `${clock(off.climbedAt)} \u00B7 ${SETTING_LABEL[off.setting]}${off.venue ? ` \u00B7 ${off.venue}` : ""} \u00B7 ${resultLine(off)}`;
    if (off.gradeLabel && off.grade != null) chip = { band: bandForV(Math.floor(off.grade)), label: off.gradeLabel };
    comment = off.note;
  } else if (rope) {
    name = ropedTitle(rope);
    sub = `${clock(rope.climbedAt)} \u00B7 ${describeRoped(rope)}${rope.venue ? ` \u00B7 ${rope.venue}` : ""}`;
    chip = { band: ropedBand(rope.grade), label: ropedLabel(rope.grade, ropedSystem) ?? rope.gradeLabel };
    comment = rope.note;
  } else if (training) {
    sub = `${clock(training.performedAt)} \u00B7 ${entryText(training, units)}`;
    comment = training.note;
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${name}. ${entry ? "Options" : "Edit"}`} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider }}>
      <Icon name={KIND_ICON[a.kind]} size={18} color={c.muted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text v="climbName" numberOfLines={1}>{name}</Text>
        <Text v="secondary">{sub}</Text>
        {stars !== null && <Stars value={stars} />}
        {comment ? <Text v="caption" numberOfLines={2}>{comment}</Text> : null}
      </View>
      {chip ? <GradeChip band={chip.band} label={chip.label} /> : null}
      <Icon name={entry ? "more" : "chevR"} size={20} color={c.muted} />
    </Tap>
  );
}

function Action({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 16, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text v="bodyStrong" style={{ color: danger ? c.danger : c.text }}>{label}</Text>
    </Tap>
  );
}
