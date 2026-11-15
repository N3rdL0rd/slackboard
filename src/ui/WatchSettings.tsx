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
      {w.stats && (w.stats.calories !== null || w.stats.hrAvg !== null || w.stats.gain !== null) ? (
        <Text v="secondary" style={{ marginTop: 4 }}>
          {[
            w.stats.calories !== null ? `${Math.round(w.stats.calories)} kcal` : "",
            w.stats.hrAvg !== null ? `heart rate ${Math.round(w.stats.hrAvg)} average${w.stats.hrMin !== null && w.stats.hrMax !== null ? ` (${Math.round(w.stats.hrMin)} to ${Math.round(w.stats.hrMax)})` : ""}` : "",
            w.stats.gain !== null ? `${w.stats.gain.toFixed(1)} m gained` : "",
          ].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
      {w.motionRows > 0 || w.elevationSamples > 0 ? <Text v="caption" style={{ marginTop: 4 }}>{w.motionRows} seconds of motion and {w.elevationSamples} elevation samples received.</Text> : null}
      <View style={{ gap: 8, marginTop: 10 }}>
        <Button variant="secondary" label="Check the watch" onPress={() => void w.check()} />
        {w.reachable ? (
          w.running
            ? <Button variant="secondary" label="Stop recording" onPress={() => void w.stop()} />
            : <Button variant="secondary" label="Start recording" onPress={() => void w.start()} />
        ) : null}
        {w.reachable ? <Button variant="secondary" label={w.asking ? "Asking the watch..." : "Ask what the watch supports"} disabled={w.asking} onPress={() => void w.askCapabilities()} /> : null}
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
