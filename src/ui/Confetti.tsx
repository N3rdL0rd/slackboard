import { useEffect, useMemo, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, View, useWindowDimensions } from "react-native";
import { c, role } from "../theme";

const COLORS = [c.starOn, role.start.color, role.middle.color, role.finish.color, role.foot.color, c.text];
const COUNT = 80;
const DURATION = 3400;

/**
 * A one-off burst of confetti over the whole screen. Every piece is driven by one native animated value, so it stays smooth while the
 * app is busy. It ignores touches, calls `onDone` when it has finished, and is skipped for people who asked their phone for less motion.
 */
export function Confetti({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(() => Array.from({ length: COUNT }, (_, i) => {
    const start = Math.random() * 0.4;
    return {
      key: i,
      x: Math.random() * width,
      drift: (Math.random() - 0.5) * 140,
      y0: -30 - Math.random() * 120,
      start,
      end: start + 0.5 + Math.random() * 0.1,
      spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720),
      w: 6 + Math.random() * 5,
      h: 10 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
    };
  }), [width]);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live) return;
      if (reduce) { onDone(); return; }
      Animated.timing(t, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => { if (finished) onDone(); });
    });
    return () => { live = false; t.stopAnimation(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 50, elevation: 50 }}>
      {pieces.map((p) => {
        const mid = p.start + (p.end - p.start) * 0.5;
        return (
          <Animated.View key={p.key} style={{
            position: "absolute", left: 0, top: 0, width: p.w, height: p.h, borderRadius: 2, backgroundColor: p.color,
            opacity: t.interpolate({ inputRange: [0, p.start, p.start + 0.01, p.end - 0.08, p.end, 1], outputRange: [0, 0, 1, 1, 0, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, p.start, p.end, 1], outputRange: [p.x, p.x, p.x + p.drift, p.x + p.drift] }) },
              // Falls slowly at first, then faster: gravity.
              { translateY: t.interpolate({ inputRange: [0, p.start, mid, p.end, 1], outputRange: [p.y0, p.y0, p.y0 + (height - p.y0) * 0.25, height + 40, height + 40] }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] }) },
            ],
          }} />
        );
      })}
    </View>
  );
}
