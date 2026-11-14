import { useState } from "react";
import { Platform, View } from "react-native";
import { checkForUpdate, installedVersion, useUpdateStore } from "../state/updates";
import { useStore } from "../state/store";
import { updateAvailable } from "../core/updates";
import { Button, SectionLabel, SwitchRow } from "./parts";
import { Text } from "./Text";

/** Update check: a switch for the daily check, and a button to check now. Android only. */
export function UpdateSettings() {
  const on = useStore((s) => s.settings.updateCheck);
  const patch = useStore((s) => s.patchSettings);
  const checking = useUpdateStore((s) => s.checking);
  const [result, setResult] = useState("");
  if (Platform.OS !== "android") return null;
  const check = async () => {
    setResult("");
    const latest = await checkForUpdate();
    setResult(!latest ? "Couldn't check. Try again later." : updateAvailable(installedVersion(), latest) ? `Build ${latest.build} is available.` : "You have the latest build.");
  };
  return (
    <>
      <SectionLabel>Updates</SectionLabel>
      <SwitchRow label="Check for updates" help="Asks GitHub once a day." value={on} onChange={(updateCheck) => patch({ updateCheck })} />
      <View style={{ marginTop: 10 }} />
      <Button variant="secondary" label={checking ? "Checking" : "Check now"} disabled={checking} onPress={() => void check()} />
      {result ? <Text v="secondary" style={{ marginTop: 8 }} aria-live="polite">{result}</Text> : null}
    </>
  );
}
