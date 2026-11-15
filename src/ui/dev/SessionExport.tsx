import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { View } from "react-native";
import { sessionCsv, sessionJson, type SessionData } from "../../core/watchData";
import { Button } from "../parts";
import { Text } from "../Text";

/** The session as a file: a CSV with one row a second, or the complete JSON, through the share sheet. */
export function SessionExport({ data, onDelete }: { data: SessionData; onDelete: () => void }) {
  const [note, setNote] = useState("");
  const share = async (kind: "csv" | "json") => {
    try {
      const stamp = new Date(data.session.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const file = new File(Paths.cache, `slackboard-watch-${stamp}.${kind}`);
      file.create({ overwrite: true });
      file.write(kind === "csv" ? sessionCsv(data) : sessionJson(data));
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: kind === "csv" ? "text/csv" : "application/json", dialogTitle: "Share the watch session" });
      setNote("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't share the file.");
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Text v="secondary">CSV has one row for each second with heart rate, elevation, every motion value and your labels. JSON has every sample, the labels and the record of when each message arrived.</Text>
      <Button variant="secondary" label="Share as CSV" onPress={() => void share("csv")} />
      <Button variant="secondary" label="Share as JSON" onPress={() => void share("json")} />
      {note ? <Text v="secondary" aria-live="polite">{note}</Text> : null}
      <View style={{ marginTop: 12 }}><Button variant="danger" label="Delete this session" onPress={onDelete} /></View>
    </View>
  );
}
