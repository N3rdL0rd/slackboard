import { useState } from "react";
import { View } from "react-native";
import { clampKeep } from "../core/autoBackup";
import { chooseBackupFolder, runAutoBackup, turnOffAutoBackup } from "../state/autoBackup";
import { useStore } from "../state/store";
import { c, r } from "../theme";
import { Button, Segmented, SectionLabel } from "./parts";
import { Text } from "./Text";

const KEEP = ["3", "7", "14", "30"];

/** Daily backups to a folder the user picks. Android only; elsewhere the section says so and does nothing. */
export function AutoBackupSection() {
  const s = useStore((x) => x.autoBackup);
  const setAutoBackup = useStore((x) => x.setAutoBackup);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const go = async (f: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true); setNote("");
    try { setNote((await f()).message); } finally { setBusy(false); }
  };
  return (
    <>
      <SectionLabel>Automatic backup</SectionLabel>
      {s.dir ? (
        <View style={{ padding: 14, gap: 10, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
          <Text v="bodyStrong" numberOfLines={1}>{s.folder || "Backup folder"}</Text>
          <Text v="caption" style={s.error ? { color: c.danger } : undefined}>{s.error || (s.lastDay ? `Last backup ${s.lastDay}` : "No backup yet")}</Text>
          <Text v="caption">Files kept</Text>
          <Segmented<string> options={KEEP.map((v) => ({ value: v, label: v }))} value={String(clampKeep(s.keep))} onChange={(v) => setAutoBackup({ keep: Number(v) })} />
          <Button label={busy ? "Backing up" : "Back up now"} disabled={busy} onPress={() => void go(() => runAutoBackup(true))} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}><Button variant="secondary" label="Change folder" disabled={busy} onPress={() => void go(chooseBackupFolder)} /></View>
            <View style={{ flex: 1 }}><Button variant="secondary" label="Turn off" disabled={busy} onPress={turnOffAutoBackup} /></View>
          </View>
        </View>
      ) : (
        <Button variant="secondary" label={busy ? "Backing up" : "Choose folder"} disabled={busy} onPress={() => void go(chooseBackupFolder)} />
      )}
      {note ? <Text v="secondary" style={{ marginTop: 8 }} aria-live="polite">{note}</Text> : null}
    </>
  );
}
