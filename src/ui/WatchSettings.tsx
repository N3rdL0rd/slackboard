import { useEffect } from "react";
import { View } from "react-native";
import Wear from "../../modules/slackboard-wear";
import { watchStatusText } from "../core/wear";
import { useWear } from "../state/wear";
import { Button, SectionLabel } from "./parts";
import { Text } from "./Text";

/** Checks the link to the Wear OS watch app and starts or stops a recording on it. Android only. */
export function WatchSettings() {
  const w = useWear();
  useEffect(() => {
    if (!Wear) return;
    void w.check();
    const sub = Wear.addListener("onWatchMessage", () => void useWear.getState().drain());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!w.available) return null;
  return (
    <>
      <SectionLabel>Watch</SectionLabel>
      <Text v="body" aria-live="polite">{watchStatusText(w)}</Text>
      <Text v="caption" style={{ marginTop: 4 }}>
        Install Slackboard on your Wear OS watch to record heart rate while you climb.
        {w.received > 0 ? ` ${w.received} heart-rate readings received.` : ""}
      </Text>
      <View style={{ gap: 8, marginTop: 10 }}>
        <Button variant="secondary" label="Check the watch" onPress={() => void w.check()} />
        {w.reachable ? (
          w.running
            ? <Button variant="secondary" label="Stop recording" onPress={() => void w.stop()} />
            : <Button variant="secondary" label="Start recording" onPress={() => void w.start()} />
        ) : null}
      </View>
      {w.note ? <Text v="secondary" style={{ marginTop: 8 }} aria-live="polite">{w.note}</Text> : null}
    </>
  );
}
