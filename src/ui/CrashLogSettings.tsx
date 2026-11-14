import { useState } from "react";
import { View } from "react-native";
import { shareCrashLog, useCrashStore } from "../state/crashLog";
import { useStore } from "../state/store";
import { Button, SectionLabel, SwitchRow } from "./parts";
import { Text } from "./Text";

/** The opt-in crash log: errors stay on the phone, and are shared only from here. */
export function CrashLogSettings() {
  const on = useStore((s) => s.settings.crashLog);
  const patch = useStore((s) => s.patchSettings);
  const count = useCrashStore((s) => s.count);
  const clear = useCrashStore((s) => s.clear);
  const [note, setNote] = useState("");
  return (
    <>
      <SectionLabel>Crash log</SectionLabel>
      <SwitchRow label="Keep a crash log" help="Errors stay on this phone." value={on} onChange={(crashLog) => patch({ crashLog })} />
      {on ? (
        <View style={{ gap: 8 }}>
          <Text v="secondary">{count === 0 ? "No errors recorded." : `${count} ${count === 1 ? "error" : "errors"} recorded.`}</Text>
          <Button variant="secondary" label="Share log" disabled={count === 0} onPress={() => void shareCrashLog().then((ok) => setNote(ok ? "" : "Sharing isn't available."))} />
          {count > 0 ? <Button variant="secondary" label="Clear" onPress={clear} /> : null}
          {note ? <Text v="secondary">{note}</Text> : null}
        </View>
      ) : null}
    </>
  );
}
