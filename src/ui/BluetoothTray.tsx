import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { boardLabel, shortUuid } from "../core/ble";
import { parseFrames } from "../core/frames";
import { chunk, holesFor } from "../core/led";
import { getProvider } from "../providers";
import { clearBoard, lightBoard, useBle } from "../state/ble";
import { useBluetoothTray } from "../state/bluetoothTray";
import { useData } from "../state/data";
import { useBoard, useStore } from "../state/store";
import { useLedStatus } from "../state/useLedStatus";
import { Button, Sheet, Tap } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

const bars = (rssi: number | null) => (rssi == null ? "" : rssi > -60 ? "Strong signal" : rssi > -80 ? "Good signal" : "Weak signal");
/** How long a scan can find nothing before the tray offers help. */
const HELP_AFTER_MS = 8000;
/** After lighting the climb that opened the tray, it stays long enough to read, then gets out of the way. */
const CLOSE_AFTER_LIT_MS = 1400;

/**
 * Connect to the board and light climbs on it, as a tray from the bottom of any screen. Opening it starts looking for the board;
 * picking it connects; if it was opened from a climb, that climb is lit as soon as the link is up and the tray closes. Everything
 * technical (every nearby device, what was sent) sits under "Troubleshooting", out of the way until it is needed.
 */
export function BluetoothTray() {
  const router = useRouter();
  const { open, context, hide } = useBluetoothTray();
  const ble = useBle();
  const led = useLedStatus();
  const board = useBoard();
  const boardData = useData((d) => d.boardData);
  const settings = useStore((s) => s.settings);
  const [helpNeeded, setHelpNeeded] = useState(false);
  const [troubleshoot, setTroubleshoot] = useState(false);
  const [justLit, setJustLit] = useState<string | null>(null);
  const litFor = useRef<string | null>(null);

  const climb = context.climbUuid ? boardData?.climbs.find((x) => x.uuid === context.climbUuid!.toUpperCase()) : undefined;
  const holes = useMemo(
    () => (climb && boardData ? holesFor(parseFrames(climb.frames)[0], new Map(boardData.placements.map((p) => [p.id, p])), new Map(boardData.roles.map((x) => [x.id, x])), !!context.mirror) : []),
    [climb, boardData, context.mirror],
  );

  // Opening starts the search; closing stops it. Nothing to press first.
  useEffect(() => {
    if (!open) {
      if (useBle.getState().phase === "scanning") useBle.getState().stopScan();
      litFor.current = null;
      setJustLit(null);
      setTroubleshoot(false);
      setHelpNeeded(false);
      return;
    }
    const { phase, startScan } = useBle.getState();
    if (phase === "idle" || phase === "failed") void startScan(board);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // A search that finds nothing for a while says what to check.
  useEffect(() => {
    setHelpNeeded(false);
    if (!open || ble.phase !== "scanning" || ble.found.length > 0) return;
    const t = setTimeout(() => setHelpNeeded(true), HELP_AFTER_MS);
    return () => clearTimeout(t);
  }, [open, ble.phase, ble.found.length, ble.showAll]);

  // Once the link is up for this board, light the climb that opened the tray, then close.
  useEffect(() => {
    if (!open || !climb || !led.matches || litFor.current === climb.uuid) return;
    litFor.current = climb.uuid;
    void lightBoard(holes, board, climb.uuid).then((ok) => {
      if (!ok) return;
      setJustLit(climb.name);
      setTimeout(() => useBluetoothTray.getState().hide(), CLOSE_AFTER_LIT_MS);
    });
  }, [open, climb, led.matches]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = ble.target;
  const name = target ? boardLabel(target, ble.kits) : "";
  const preview = board ? getProvider(board.spec.provider).ble?.encode(holes, target?.apiLevel ?? 3) ?? [] : [];
  const scanning = ble.phase === "scanning";

  const title = led.matches ? "Connected" : ble.phase === "connecting" ? "Connecting" : "Connect your board";

  return (
    <Sheet visible={open} onClose={hide} title={title}>
      {ble.unavailable ? (
        <Text v="secondary">{ble.error}</Text>
      ) : led.matches ? (
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <Status dot={led.dot} label={name} caption={justLit ? `Showing ${justLit}` : target?.serial ? `Controller #${target.serial}` : "Ready"} />
          {climb && !justLit ? <Button label={`Show ${climb.name}`} onPress={() => void lightBoard(holes, board, climb.uuid).then((ok) => { if (ok) { setJustLit(climb.name); setTimeout(() => useBluetoothTray.getState().hide(), CLOSE_AFTER_LIT_MS); } })} /> : null}
          <Button variant="secondary" label="Turn the board off" onPress={() => { void clearBoard(board); setJustLit(null); }} />
          <Button variant="secondary" label="Disconnect" onPress={() => void ble.disconnect()} />
          <Text v="caption">The board follows the climb you look at. {settings.autoDisconnectSec ? `It disconnects after ${settings.autoDisconnectSec >= 60 ? `${settings.autoDisconnectSec / 60} min` : `${settings.autoDisconnectSec} s`} of nothing.` : ""}</Text>
        </View>
      ) : ble.phase === "connected" ? (
        <View style={{ gap: 12 }}>
          <Status dot={c.starOn} label={name} caption="Connected, but set up for a different board" />
          <Button label="Connect for this board" onPress={() => void ble.disconnect().then(() => ble.startScan(board))} />
        </View>
      ) : ble.phase === "connecting" ? (
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <Status busy label={name} caption="Connecting. This takes a few seconds." />
        </View>
      ) : ble.phase === "failed" ? (
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <Text v="bodyStrong">Couldn't connect</Text>
          <Text v="secondary">{ble.error ?? "Something went wrong."}</Text>
          <Button label="Try again" onPress={() => void ble.startScan(board)} />
        </View>
      ) : (
        <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
          <Status busy={scanning} label={scanning ? "Looking for your board" : "Not looking yet"} caption="Switch it on and stay close to it." />
          {ble.found.map((f) => (
            <Tap key={f.id} accessibilityRole="button" accessibilityLabel={`Connect to ${boardLabel(f, ble.kits)}`} onPress={() => void ble.connect(f.id, board)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1.5, borderColor: c.lineStrong }}>
              <View style={{ flex: 1 }}>
                <Text v="climbName" numberOfLines={1}>{boardLabel(f, ble.kits)}</Text>
                <Text v="caption">{[f.serial ? `#${f.serial}` : null, bars(f.rssi)].filter(Boolean).join(" \u00b7 ")}</Text>
              </View>
              <Text v="bodyStrong">Connect</Text>
            </Tap>
          ))}
          {helpNeeded ? (
            <Text v="secondary">Nothing yet. Check the board is switched on, Bluetooth is on, and Slackboard is allowed to find nearby devices.</Text>
          ) : null}
          {!scanning ? <Button label="Look for boards" onPress={() => void ble.startScan(board)} /> : null}
        </View>
      )}

      {!ble.unavailable ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <Tap accessibilityRole="button" accessibilityState={{ expanded: troubleshoot }} onPress={() => setTroubleshoot((v) => !v)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text v="bodyStrong" style={{ color: c.text2 }}>{troubleshoot ? "Hide troubleshooting" : "Troubleshooting"}</Text>
          </Tap>
          {troubleshoot ? (
            <View style={{ gap: 10 }}>
              {ble.phase !== "connected" && ble.phase !== "connecting" ? (
                <Button variant="secondary" label={ble.showAll ? "Showing every nearby device" : "Show every nearby device"} disabled={ble.showAll} onPress={() => void ble.startScan(board, true)} />
              ) : null}
              {ble.showAll ? (
                ble.nearby.length === 0 ? <Text v="secondary">No devices heard yet.</Text> : ble.nearby.slice(0, 25).map((d) => (
                  <Tap key={d.id} accessibilityRole="button" accessibilityLabel={`Try ${d.name ?? "unnamed device"}`} onPress={() => void ble.connect(d.id, board)}
                    style={{ padding: 12, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 2 }}>
                    <Text v="bodyStrong" numberOfLines={1}>{d.name ?? "No name"}</Text>
                    <Text v="caption" numberOfLines={1}>{[d.id.slice(-8), d.rssi != null ? `${d.rssi} dBm` : null, d.services.length ? d.services.map(shortUuid).join(" ") : null].filter(Boolean).join(" \u00b7 ")}</Text>
                  </Tap>
                ))
              ) : null}
              {ble.sends.ok + ble.sends.failed > 0 ? (
                <Text v="caption">{`Sent ${ble.sends.ok}, failed ${ble.sends.failed}${ble.sends.lastError ? `. Last error: ${ble.sends.lastError}` : ""}`}</Text>
              ) : null}
              {climb && preview.length ? (
                <>
                  <Text v="caption">{`${climb.name}: ${preview.length} bytes in ${chunk(preview).length} writes`}</Text>
                  <Text selectable style={{ fontFamily: "monospace", fontSize: 12, color: c.text2 }}>{preview.map((b) => b.toString(16).padStart(2, "0")).join(" ")}</Text>
                </>
              ) : null}
              <Tap accessibilityRole="button" onPress={() => { hide(); router.push("/settings"); }} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text v="bodyStrong" style={{ color: c.text2 }}>Connection settings</Text>
              </Tap>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function Status({ label, caption, dot, busy }: { label: string; caption: string; dot?: string; busy?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56 }}>
      {busy ? <ActivityIndicator color={c.text} /> : <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: dot ?? c.ledOff }} />}
      <View style={{ flex: 1 }}>
        <Text v="climbName" numberOfLines={1}>{label}</Text>
        <Text v="secondary">{caption}</Text>
      </View>
    </View>
  );
}
