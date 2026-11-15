import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { fractionOf, indexAt, stepIndex } from "../core/slider";
import { c } from "../theme";
import { haptic } from "./haptics";
import { Text } from "./Text";

export interface SliderStop<T> { value: T; label: string; /** A colour for this stop, when the scale has one (a grade band). */ tint?: string }

const THUMB = 30;
const HIT = 52;

/**
 * One choice from an ordered set, picked by dragging along a track. Use it where the choices lie on a line (more or less, steeper
 * or easier, shorter or longer). The current stop is named above the thumb; the ends are named below. Each stop ticks under the
 * finger, and a screen reader steps with increment and decrement. A `null` value shows no thumb until the first touch.
 */
export function Slider<T extends string | number>({ label, stops, value, onChange, unsetText, ends }: {
  label: string; stops: SliderStop<T>[]; value: T | null; onChange: (v: T) => void; unsetText?: string; /** Names for the two ends, where the first and last stop labels are just numbers. */ ends?: [string, string];
}) {
  const n = stops.length;
  const index = value == null ? -1 : stops.findIndex((s) => s.value === value);
  const [width, setWidth] = useState(0);
  const live = useRef({ stops, width, onChange, index });
  live.current = { stops, width, onChange, index };
  const last = useRef(index);
  const pick = (i: number) => {
    if (i === last.current) return;
    last.current = i;
    haptic.selection();
    live.current.onChange(live.current.stops[i].value);
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { last.current = live.current.index; pick(indexAt(e.nativeEvent.locationX - THUMB / 2, live.current.width - THUMB, live.current.stops.length)); },
    onPanResponderMove: (e) => pick(indexAt(e.nativeEvent.locationX - THUMB / 2, live.current.width - THUMB, live.current.stops.length)),
  })).current;

  const usable = Math.max(0, width - THUMB);
  const at = (i: number) => THUMB / 2 + fractionOf(i, n) * usable;
  const tint = index >= 0 ? stops[index].tint ?? c.text : c.muted;
  const shownTicks = n <= 14;
  const step = (dir: 1 | -1) => { if (index < 0) pick(dir === 1 ? 0 : n - 1); else pick(stepIndex(index, dir, n)); };

  return (
    <View>
      <Text v="numeral" style={{ fontSize: 30, lineHeight: 38, color: index >= 0 ? tint : c.muted, marginBottom: 2 }}>
        {index >= 0 ? stops[index].label : unsetText ?? "Not set"}
      </Text>
      <View
        accessible accessibilityRole="adjustable" accessibilityLabel={label}
        accessibilityValue={{ text: index >= 0 ? stops[index].label : unsetText ?? "Not set" }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: HIT, justifyContent: "center" }} {...pan.panHandlers}
      >
        <View pointerEvents="none" style={{ height: 6, borderRadius: 3, backgroundColor: c.raised, marginHorizontal: THUMB / 2 }} />
        {index > 0 ? <View pointerEvents="none" style={{ position: "absolute", left: THUMB / 2, width: at(index) - THUMB / 2, height: 6, borderRadius: 3, backgroundColor: tint }} /> : null}
        {shownTicks ? stops.map((s, i) => (
          <View key={String(s.value)} pointerEvents="none" style={{ position: "absolute", left: at(i) - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: i <= index ? c.ground : c.muted, opacity: 0.8 }} />
        )) : null}
        {index >= 0 ? <View pointerEvents="none" style={{ position: "absolute", left: at(index) - THUMB / 2, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: c.text, borderWidth: 4, borderColor: tint }} /> : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text v="caption">{ends?.[0] ?? stops[0]?.label}</Text>
        <Text v="caption">{ends?.[1] ?? stops[n - 1]?.label}</Text>
      </View>
    </View>
  );
}
