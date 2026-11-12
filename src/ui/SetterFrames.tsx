import { Pressable, View } from "react-native";
import { MAX_FRAMES_PACE, MAX_ROUTE_FRAMES, MIN_FRAMES_PACE } from "../core/setter";
import { c, r } from "../theme";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

interface Props {
  current: number;
  count: number;
  currentHoldCount: number;
  playing: boolean;
  pace: number;
  onSelect: (index: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTogglePlay: () => void;
  onPace: (pace: number) => void;
}

/** Fixed route controls: nothing essential is in a horizontal or vertical scroller. */
export function SetterFrames({ current, count, currentHoldCount, playing, pace, onSelect, onDuplicate, onDelete, onTogglePlay, onPace }: Props) {
  const stepPace = (delta: number) => onPace(Math.max(MIN_FRAMES_PACE, Math.min(MAX_FRAMES_PACE, pace + delta)));
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <Text v="numeral" accessibilityLabel={`Frame ${current + 1} of ${count}`} style={{ width: 64, fontSize: 18 }}>{current + 1} / {count}</Text>
        <FrameButton label="First frame" icon="first" disabled={current === 0} onPress={() => onSelect(0)} />
        <FrameButton label="Previous frame" icon="chevL" disabled={current === 0} onPress={() => onSelect(current - 1)} />
        <FrameButton label={playing ? "Pause route preview" : "Play route preview"} icon={playing ? "pause" : "play"} disabled={count < 2} onPress={onTogglePlay} />
        <FrameButton label="Next frame" icon="chevR" disabled={current >= count - 1} onPress={() => onSelect(current + 1)} />
        <FrameButton label="Last frame" icon="last" disabled={current >= count - 1} onPress={() => onSelect(count - 1)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <FrameButton label="Duplicate current frame" icon="plus" disabled={count >= MAX_ROUTE_FRAMES || currentHoldCount < 1} onPress={onDuplicate} />
        <FrameButton label="Delete current frame" icon="trash" disabled={count <= 1} onPress={onDelete} />
        <View style={{ width: 8 }} />
        <FrameButton label="Decrease frame pace by one second" icon="minus" disabled={pace <= MIN_FRAMES_PACE} onPress={() => stepPace(-1000)} />
        <View accessible accessibilityRole="adjustable" accessibilityLabel="Frame pace" accessibilityValue={{ text: `${pace / 1000} seconds per frame` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => stepPace(e.nativeEvent.actionName === "increment" ? 1000 : -1000)}
          style={{ minWidth: 76, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Text v="bodyStrong" style={{ fontSize: 14 }}>{pace / 1000} s</Text>
          <Text v="caption" style={{ fontSize: 10 }}>per frame</Text>
        </View>
        <FrameButton label="Increase frame pace by one second" icon="plus" disabled={pace >= MAX_FRAMES_PACE} onPress={() => stepPace(1000)} />
      </View>
    </View>
  );
}

function FrameButton({ label, icon, disabled, onPress }: { label: string; icon: IconName | "first" | "last"; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: r.input, backgroundColor: c.card, opacity: disabled ? 0.35 : 1 }}>
      {icon === "first" || icon === "last" ? (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {icon === "last" && <Icon name={icon === "last" ? "chevR" : "chevL"} size={19} color={c.text} />}
          <View style={{ width: 2, height: 17, backgroundColor: c.text, marginHorizontal: -2 }} />
          {icon === "first" && <Icon name="chevL" size={19} color={c.text} />}
        </View>
      ) : <Icon name={icon} size={20} color={c.text} />}
    </Pressable>
  );
}
