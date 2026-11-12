import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LogEntry } from "../../core/types";
import { groupLogSessions, sessionSummary } from "../../core/spaces";
import { gradeColor } from "../../core/grades";
import { grades } from "../../data/grades";
import { DEFAULT_PROVIDER } from "../../providers";
import { useData } from "../../state/data";
import { useOutbox } from "../../state/outbox";
import { useOutsideLogs } from "../../state/outside";
import { activePin, pinProvider } from "../../state/active";
import { setSequence } from "../../state/sequence";
import { deleteLogEntry, editLogEntry, logSend } from "../../state/serverSends";
import { useBoard, useStore } from "../../state/store";
import { useSpaces } from "../../state/spaces";
import { commonLabel, gradeOfEntry } from "../../state/stats";
import { Icon } from "../../ui/Icon";
import { LogSheet, type LogMode } from "../../ui/LogSheet";
import { IconButton, LinkButton, GradeChip, Segmented, Sheet, Stars, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

type Range = "day" | "week" | "month" | "year" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "year", label: "Year" }, { value: "all", label: "All" },
];
const DAYS: Record<Range, number> = { day: 1, week: 7, month: 31, year: 366, all: Infinity };

/** Server times are `yyyy-MM-dd HH:mm:ss` in the device's local time at logging, so parse them as local. */
const at = (t: string) => new Date(t.replace(" ", "T"));

export default function LogTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sends = useData((d) => d.logbook);
  const outsideCount = useOutsideLogs().length;
  const board = useBoard();
  const display = useStore((s) => s.settings.gradeDisplay);
  const { pending, rejected, clearRejected } = useOutbox();
  const spaces = useSpaces((s) => s.spaces);
  const logSpaces = useSpaces((s) => s.logSpaces);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("month");
  const [undo, setUndo] = useState<LogEntry | null>(null);
  const [actions, setActions] = useState<LogEntry | null>(null);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [mirror, setMirror] = useState(false);

  const inRange = useMemo(() => sends.filter((s) => Date.now() - at(s.climbedAt).getTime() <= DAYS[range] * 86400000), [sends, range]);
  const sendOnly = inRange.filter((s) => s.isSend);
  const stats = {
    sessions: groupLogSessions(inRange, spaces, logSpaces, gradeOfEntry).filter((g) => !g.earlier).length,
    sends: sendOnly.length,
    climbs: new Set(sendOnly.map((s) => s.climbUuid)).size,
  };
  const byGrade = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of sendOnly) { const v = grades.vNumber(s.difficulty); m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [sendOnly]);
  const max = Math.max(1, ...byGrade.map((x) => x[1]));

  const groups = useMemo(() => groupLogSessions(inRange, spaces, logSpaces, gradeOfEntry), [inRange, spaces, logSpaces]);

  const previousProvider = useRef<string | null>(null);
  const del = (e: LogEntry) => { setActions(null); void deleteLogEntry(e); setUndo(e); };
  const closeEditor = () => { pinProvider(previousProvider.current); setEditing(null); };
  const edit = (e: LogEntry) => { setActions(null); setMirror(e.isMirror); previousProvider.current = activePin(); pinProvider(e.provider); setEditing(e); };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, paddingTop: 8 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>Log</Text>
        <IconButton icon="plus" label="Log a climb off the boards" onPress={() => router.push("/outside")} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </View>
      <Tap accessibilityRole="button" accessibilityLabel={`Gym and outdoor climbs, ${outsideCount}`} onPress={() => router.push("/off-board")}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
        <Text v="bodyStrong" style={{ flex: 1 }}>Gym and outdoor climbs</Text>
        <Text v="secondary">{outsideCount}</Text>
        <Icon name="chevR" size={20} color={c.muted} />
      </Tap>
      {(pending > 0 || rejected.length > 0) && (
        <View style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: rejected.length ? c.danger : c.lineStrong, gap: 4 }}>
          {pending > 0 && <Text v="bodyStrong">{pending === 1 ? "1 change is waiting to upload" : `${pending} changes are waiting to upload`}</Text>}
          {pending > 0 && <Text v="caption">Saved on this phone. They upload when you're back online.</Text>}
          {rejected.map((m, i) => <Text key={i} v="secondary" style={{ color: c.danger }}>{m}</Text>)}
          {rejected.length > 0 && <LinkButton label="Dismiss" icon="close" onPress={clearRejected} />}
        </View>
      )}
      <JumpList
        data={groups}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, gap: 14, paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {([["Sessions", stats.sessions], ["Sends", stats.sends], ["Climbs", stats.climbs]] as const).map(([l, n]) => (
                <View key={l} style={{ flex: 1, backgroundColor: c.card, borderRadius: r.card, padding: 12, borderWidth: 1, borderColor: c.line }}>
                  <Text v="numeral" style={{ fontSize: 34 }}>{n}</Text>
                  <Text v="caption">{l}</Text>
                </View>
              ))}
            </View>
            {byGrade.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text v="section">Sends by grade</Text>
                {byGrade.map(([v, n]) => {
                  const band = grades.band(grades.rangeForV(v, v)[0]);
                  return (
                    <View key={v} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text v="bodyStrong" style={{ width: 36, color: gradeColor(v) }}>V{v}</Text>
                      <View style={{ height: 14, width: `${(n / max) * 80}%`, backgroundColor: band.bar, borderRadius: 4 }} />
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
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing logged yet</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>Open a climb and tap Log send or Attempt. Your sessions show up here.</Text>
          </View>
        }
        renderItem={({ item: g }) => {
          const open = expanded === g.key;
          return (
            <View style={{ marginHorizontal: 16, marginTop: 14, backgroundColor: c.card, borderRadius: r.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
              <Tap accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${g.title}, ${g.spaceName}. ${open ? "Collapse" : "Expand"} session`}
                onPress={() => setExpanded(open ? null : g.key)} style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text v="climbName">{g.title}</Text>
                  <Text v="bodyStrong">{g.spaceName}</Text>
                  <Text v="secondary">{sessionSummary(g, (grade) => commonLabel(grade, display))}</Text>
                </View>
                {g.hardest != null ? <GradeChip band={grades.band(DEFAULT_PROVIDER.fromCommonGrade(g.hardest))} label={commonLabel(g.hardest, display)} /> : null}
                <Icon name={open ? "chevD" : "chevR"} size={20} color={c.muted} />
              </Tap>
              {open && g.entries.map((s) => {
                const l = s.isSend ? grades.label(s.difficulty, display) : null;
                return (
                  <Tap key={s.id} accessibilityRole="button" accessibilityLabel={`${s.climbName}. Options`} onPress={() => setActions(s)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text v="climbName" numberOfLines={1}>{s.climbName}</Text>
                      <Text v="secondary">
                        {at(s.climbedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {s.angle}°{s.isMirror ? " · Mirrored" : ""} · {s.bidCount} {s.bidCount === 1 ? "attempt" : "attempts"}{s.isSend && s.bidCount === 1 ? " · Flash" : ""}{s.pending ? " · Waiting to upload" : ""}
                      </Text>
                      {s.isSend && <Stars value={s.quality} />}
                      {s.comment ? <Text v="caption" numberOfLines={2}>{s.comment}</Text> : null}
                    </View>
                    {l ? <GradeChip band={grades.band(s.difficulty)} label={l.primary} /> : null}
                    <Icon name="more" size={20} color={c.muted} />
                  </Tap>
                );
              })}
            </View>
          );
        }}
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

function Action({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 16, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text v="bodyStrong" style={{ color: danger ? c.danger : c.text }}>{label}</Text>
    </Tap>
  );
}
