import { useEffect } from "react";
import { Share, View } from "react-native";
import Wear from "../../modules/slackboard-wear";
import { describeCapabilities, watchStatusText } from "../core/wear";
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
        {w.reachable ? <Button variant="secondary" label="Ask what the watch supports" onPress={() => void w.askCapabilities()} /> : null}
      </View>
      {w.capabilities ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text v="bodyStrong">What the watch says it supports</Text>
          <Text v="secondary" selectable>{describeCapabilities(w.capabilities)}</Text>
          <Button variant="secondary" label="Share this as text" onPress={() => void Share.share({ message: describeCapabilities(w.capabilities!) })} />
        </View>
      ) : null}
      {w.note ? <Text v="secondary" style={{ marginTop: 8 }} aria-live="polite">{w.note}</Text> : null}
    </>
  );
}
