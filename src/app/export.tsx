import { useUserId, useUsername } from "../state/useActive";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseBackup, restoreBackup, type ParsedBackup } from "../core/backup";
import { exportFileName, exportJson, inRange, logbookCsv, RANGE_LABELS, type ExportFormat, type ExportRange } from "../core/export";
import { gradeOptions, type OutsideLog } from "../core/outside";
import { at } from "../core/stats";
import { grades } from "../data/grades";
import { getLocalDb } from "../data/sqlite";
import { getProvider } from "../providers";
import { useData } from "../state/data";
import { useLit, useLitHistory } from "../state/litHistory";
import { useOutside, useOutsideLogs } from "../state/outside";
import { useStore } from "../state/store";
import { Button, IconButton, Segmented, SectionLabel } from "../ui/parts";
import { Text } from "../ui/Text";
import { c } from "../theme";

const gradeOf = (e: { difficulty: number }) => ({ v: grades.vName(e.difficulty), font: grades.fontName(e.difficulty) });
/** An off-board climb's grade in both notations, from the grade it was logged with. */
const offGradeOf = (l: OutsideLog) => {
  const hit = gradeOptions(grades, l.gradeSystem ?? "v").find((g) => g.label === l.gradeLabel);
  return hit ? gradeOf({ difficulty: hit.difficulty }) : { v: "", font: "" };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Your data, out of the app and back in: a spreadsheet of the logbook, or a full backup file that can be restored. */
export default function Export() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logbook = useData((d) => d.logbook);
  const circuits = useData((d) => d.circuits);
  const liked = useData((d) => d.liked);
  const blocked = useData((d) => d.blocked);
  const boards = useData((d) => d.boards);
  const offBoard = useOutsideLogs();
  const litHistory = useLitHistory();
  const username = useUsername();
  const userId = useUserId();
  const [format, setFormat] = useState<ExportFormat>("json");
  const [range, setRange] = useState<ExportRange>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<{ name: string; backup: ParsedBackup } | null>(null);
  const [restored, setRestored] = useState("");
  const rows = useMemo(() => inRange(logbook, range, new Date(), at), [logbook, range]);
  const offRows = useMemo(() => inRange(offBoard, range, new Date(), at), [offBoard, range]);
  const pending = rows.filter((x) => x.pending).length;

  const share = async () => {
    setBusy(true); setError("");
    try {
      const now = new Date();
      // A backup is always everything; the range only narrows the spreadsheet.
      const body = format === "csv"
        ? logbookCsv(rows, gradeOf, offRows, offGradeOf)
        : exportJson({ now, user: { id: userId, username }, range: "all", logbook, circuits, offBoard, litHistory, liked, blocked, boards, gradeOf });
      const file = new File(Paths.cache, exportFileName(format, now, username));
      file.create({ overwrite: true });
      file.write(body);
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: format === "csv" ? "text/csv" : "application/json", dialogTitle: format === "csv" ? "Export your Slackboard logbook" : "Slackboard backup", UTI: format === "csv" ? "public.comma-separated-values-text" : "public.json" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the file.");
    } finally { setBusy(false); }
  };

  const choose = async () => {
    setBusy(true); setError(""); setRestored("");
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ["application/json", "text/plain", "*/*"] });
      if (picked.canceled) return;
      const text = await picked.result.text();
      const parsed = parseBackup(text, (p) => getProvider(p).kind === "local");
      if (!parsed.ok) { setPlan(null); setError(parsed.error); return; }
      setPlan({ name: picked.result.name, backup: parsed.backup });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally { setBusy(false); }
  };

  const restore = async () => {
    if (!plan) return;
    setBusy(true); setError("");
    try {
      const sum = await restoreBackup(await getLocalDb(), plan.backup);
      await useOutside.getState().load();
      await useLit.getState().load();
      await useData.getState().loadAll(useStore.getState().accounts);
      setPlan(null);
      setRestored(`Restored ${plural(sum.offBoard, "off-board climb", "off-board climbs")}, ${plural(sum.localLogs, "board entry", "board entries")}, ${plural(sum.circuits, "circuit", "circuits")} and ${plural(sum.litHistory, "lit climb", "lit climbs")}.${sum.skipped ? ` ${plural(sum.skipped, "record", "records")} in the file couldn't be used.` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't restore that backup.");
    } finally { setBusy(false); }
  };

  const b = plan?.backup;
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="screenTitle" style={{ flex: 1 }}>Export and backup</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 100 }}>
        <Text v="secondary">Make a file of your own data for a spreadsheet or a backup folder, or restore from one. Nothing is uploaded anywhere by this screen.</Text>
        <SectionLabel>Format</SectionLabel>
        <Segmented<ExportFormat> options={[{ value: "json", label: "Full backup" }, { value: "csv", label: "CSV logbook" }]} value={format} onChange={setFormat} />
        <Text v="caption" style={{ marginTop: 8 }}>
          {format === "csv"
            ? "One row per send or attempt, board and off-board together, with date, climb, angle, tries, grade, stars and comment. Opens in any spreadsheet."
            : "Everything on this phone in one JSON file: your logbook, gym and outdoor climbs, lit history, circuits, likes and blocked climbs. It can be restored below."}
        </Text>
        {format === "csv" ? (
          <>
            <SectionLabel>Logbook range</SectionLabel>
            <Segmented<ExportRange> options={(Object.keys(RANGE_LABELS) as ExportRange[]).map((value) => ({ value, label: RANGE_LABELS[value] }))} value={range} onChange={setRange} />
          </>
        ) : null}
        <View style={{ marginTop: 18, padding: 14, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 4 }}>
          <Text v="bodyStrong">{plural(rows.length + offRows.length, "entry", "entries")}</Text>
          <Text v="caption">
            {plural(rows.filter((x) => x.isSend).length + offRows.filter((x) => x.result !== "attempt").length, "send", "sends")}, {plural(rows.filter((x) => !x.isSend).length + offRows.filter((x) => x.result === "attempt").length, "attempt record", "attempt records")}
            {offRows.length ? `, ${offRows.length} off the boards` : ""}{format === "json" ? `, ${plural(circuits.length, "circuit", "circuits")}, ${liked.size} liked, ${blocked.size} blocked` : ""}.
          </Text>
          {pending > 0 ? <Text v="caption">{pending} not uploaded yet are included.</Text> : null}
        </View>

        <SectionLabel>Restore</SectionLabel>
        <Text v="secondary">Pick a backup file. Sends and circuits kept on a service come back when you sign in; a restore brings back what only this phone had: gym and outdoor climbs, board entries with no service, and unpublished circuits.</Text>
        <View style={{ marginTop: 10 }}><Button variant="secondary" label={busy && !plan ? "Reading" : "Choose backup file"} disabled={busy} onPress={() => void choose()} /></View>
        {b ? (
          <View style={{ marginTop: 12, padding: 14, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 4 }}>
            <Text v="bodyStrong" numberOfLines={1}>{plan!.name}</Text>
            <Text v="caption">{b.exportedAt ? `Made ${b.exportedAt.slice(0, 10)}. ` : ""}Contains {plural(b.offBoard.length, "off-board climb", "off-board climbs")}, {plural(b.localLogs.length, "board entry", "board entries")}, {plural(b.circuits.length, "circuit", "circuits")} and {plural(b.litHistory.length, "lit climb", "lit climbs")} to restore.{b.skipped ? ` ${plural(b.skipped, "record", "records")} can't be used and will be skipped.` : ""}</Text>
            <Text v="caption">Anything with the same id is replaced by the file's copy. Nothing is deleted.</Text>
            <View style={{ marginTop: 8 }}><Button label={busy ? "Restoring" : "Restore"} disabled={busy} onPress={() => void restore()} /></View>
          </View>
        ) : null}
        {restored ? <Text v="secondary" style={{ marginTop: 12 }} aria-live="polite">{restored}</Text> : null}
        {error ? <Text v="secondary" style={{ color: c.danger, marginTop: 12 }} aria-live="polite">{error}</Text> : null}
      </ScrollView>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 12 }}>
        <Button label={busy ? "Preparing" : format === "csv" ? "Share spreadsheet" : "Share backup"} disabled={busy || (format === "csv" && rows.length + offRows.length === 0)} onPress={share} />
      </View>
    </View>
  );
}
