import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { c, r } from "../theme";
import { Icon, type IconName } from "./Icon";
import { Tap } from "./parts";
import { Text } from "./Text";

export interface DialItem {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** The one the screen is mainly for: drawn in the light button colour. */
  primary?: boolean;
}

/** One round button that opens a short, labelled list of actions above it. Items are listed top to bottom, nearest the button last. */
export function SpeedDial({ items, bottom = 16 }: { items: DialItem[]; bottom?: number }) {
  const [open, setOpen] = useState(false);
  // Stays drawn while it closes, so the close animates too.
  const [shown, setShown] = useState(false);
  const t = useRef(new Animated.Value(0)).current;
  const reduce = useRef(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduce.current = v; }); }, []);
  useEffect(() => {
    if (open) setShown(true);
    const done = () => { if (!open) setShown(false); };
    if (reduce.current) { t.setValue(open ? 1 : 0); done(); return; }
    Animated.timing(t, { toValue: open ? 1 : 0, duration: open ? 220 : 160, easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.quad), useNativeDriver: true }).start(done);
  }, [open, t]);
  const n = items.length;
  // Each item starts a little after the one nearer the button, so the list unfolds upward.
  const stage = (i: number) => {
    const from = ((n - 1 - i) * 0.5) / Math.max(n, 1);
    return t.interpolate({ inputRange: [from, Math.min(1, from + 0.55)], outputRange: [0, 1], extrapolate: "clamp" });
  };
  return (
    <>
      {shown ? <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, { opacity: t }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} />
      </Animated.View> : null}
      {shown ? (
        <View pointerEvents={open ? "auto" : "none"} style={{ position: "absolute", right: 16, bottom: bottom + 56 + 14, alignItems: "flex-end", gap: 10 }}>
          {items.map((it, i) => {
            const p = stage(i);
            return (
              <Animated.View key={it.label} style={{ opacity: p, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
                <Tap accessibilityRole="button" accessibilityLabel={it.label} onPress={() => { setOpen(false); it.onPress(); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: r.input, borderWidth: 1, backgroundColor: it.primary ? c.btn : c.raised, borderColor: it.primary ? c.btn : c.lineStrong }}>
                    <Text v="bodyStrong" style={it.primary ? { color: c.btnText } : undefined}>{it.label}</Text>
                  </View>
                  <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, backgroundColor: it.primary ? c.btn : c.card, borderColor: it.primary ? c.btn : c.lineStrong }}>
                    <Icon name={it.icon} size={22} color={it.primary ? c.btnText : c.text} />
                  </View>
                </Tap>
              </Animated.View>
            );
          })}
        </View>
      ) : null}
      <Tap accessibilityRole="button" accessibilityLabel={open ? "Close menu" : "Set, log or plan"} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)}
        style={{ position: "absolute", right: 16, bottom, width: 56, height: 56, borderRadius: 28, backgroundColor: c.btn, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ transform: [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "135deg"] }) }] }}>
          <Icon name="plus" size={24} color={c.btnText} stroke={2.5} />
        </Animated.View>
      </Tap>
    </>
  );
}
