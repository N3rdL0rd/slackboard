import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Easing, Keyboard, Modal, Platform, Pressable, type PressableProps, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { c, font, r, size } from "../theme";
import type { GradeBand } from "../core/grades";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

const RIPPLE = { color: "rgba(237,235,228,0.10)" }; // the chalk text colour, faint
const PRESSED: ViewStyle = { opacity: 0.8 };

/**
 * Pressable with instant touch feedback: a native ripple (drawn even while the JS thread is busy) plus a dim while held.
 * Use it for every tappable control so a tap always visibly lands.
 */
export function Tap({ style, ...rest }: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle> }) {
  return <Pressable android_ripple={RIPPLE} {...rest} style={({ pressed }) => [style, pressed && PRESSED]} />;
}

/** A spinner that keeps turning on the UI thread while JS is busy. */
export function Spinner({ size: sz = "small", style }: { size?: "small" | "large"; style?: StyleProp<ViewStyle> }) {
  return <ActivityIndicator size={sz} color={c.text2} style={style} accessibilityLabel="Loading" />;
}

/**
 * A tappable link that looks tappable: a bordered pill with an icon, never bare coloured text. `external` marks links that open
 * the browser; `danger` is for destructive ones.
 */
export function LinkButton({ label, onPress, icon, external, danger, style }: {
  label: string; onPress: () => void; icon?: IconName; external?: boolean; danger?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const fg = danger ? c.danger : c.text;
  return (
    <Tap accessibilityRole={external ? "link" : "button"} accessibilityLabel={external ? `${label}, opens in the browser` : label} onPress={onPress} hitSlop={6}
      style={[{ minHeight: 44, paddingHorizontal: 16, borderRadius: r.pill, borderWidth: 1.5, borderColor: danger ? c.danger : c.lineStrong, backgroundColor: c.card,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "center" }, style]}>
      <Text v="bodyStrong" style={{ color: fg, fontSize: 15 }}>{label}</Text>
      <Icon name={icon ?? (external ? "share" : "chevR")} size={18} color={fg} />
    </Tap>
  );
}

export function Button({ label, onPress, disabled, variant = "primary", style, icon }: {
  label: string; onPress?: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger"; style?: StyleProp<ViewStyle>; icon?: IconName;
}) {
  const bg = disabled ? c.btnOff : variant === "primary" ? c.btn : variant === "danger" ? c.danger : "transparent";
  const fg = disabled ? c.btnOffText : variant === "secondary" ? c.text : c.btnText;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={[{
        height: size.button.default, borderRadius: r.input, backgroundColor: bg, alignItems: "center", justifyContent: "center",
        flexDirection: "row", gap: 8, paddingHorizontal: 20,
        borderWidth: variant === "secondary" ? 1.5 : 0, borderColor: c.lineStrong,
      }, style]}
    >
      {icon && <Icon name={icon} size={22} color={fg} />}
      {/* One line: a long label shrinks to fit the button instead of wrapping and being cut off. */}
      <Text v="button" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: fg, flexShrink: 1 }}>{label}</Text>
    </Tap>
  );
}

export function IconButton({ icon, label, onPress, color = c.text, filled, dot }: {
  icon: IconName; label: string; onPress?: () => void; color?: string; filled?: boolean; dot?: string;
}) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={{ width: size.touchMin, height: size.touchMin, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} color={color} filled={filled} />
      {dot && <View style={{ position: "absolute", top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: dot, borderWidth: 1.5, borderColor: c.ground }} />}
    </Tap>
  );
}

export function Chip({ label, onPress, onRemove, selected, style }: {
  label: string; onPress?: () => void; onRemove?: () => void; selected?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap
      accessibilityRole={onRemove ? "button" : "togglebutton" as any}
      accessibilityLabel={onRemove ? `Remove filter ${label}` : label}
      accessibilityState={{ selected: !!selected }}
      onPress={onRemove ?? onPress}
      style={[{
        minHeight: size.chip, paddingHorizontal: 14, borderRadius: r.pill, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 6,
        borderColor: selected ? c.text : c.lineStrong, backgroundColor: selected ? c.text : c.card,
      }, style]}
    >
      <Text v="bodyStrong" style={{ fontSize: 14.5, color: selected ? c.btnText : c.text2 }}>{label}</Text>
      {onRemove && <Icon name="close" size={14} color={c.muted} />}
    </Tap>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.card, borderRadius: r.input, padding: 3, borderWidth: 1, borderColor: c.line }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: r.input - 3, backgroundColor: on ? c.text : "transparent" }}>
            <Text v="bodyStrong" style={{ fontSize: 14.5, color: on ? c.btnText : c.text2 }}>{o.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** Own switch instead of the platform one: the ON state must read clearly on the dark ground. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Tap
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{
        width: 56, height: 32, borderRadius: 16, padding: 3, justifyContent: "center",
        backgroundColor: value ? c.text : c.raised, borderWidth: 1.5, borderColor: value ? c.text : c.lineStrong,
      }}
    >
      <View
        style={{
          width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
          alignSelf: value ? "flex-end" : "flex-start",
          backgroundColor: value ? c.ground : c.muted,
        }}
      >
        {value && <Icon name="check" size={15} color={c.text} stroke={3} />}
      </View>
    </Tap>
  );
}

export function SwitchRow({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong">{label}</Text>
        {help ? <Text v="secondary">{help}</Text> : null}
      </View>
      <Toggle value={value} onChange={onChange} label={label} />
    </View>
  );
}

export function GradeChip({ band, label, large }: { band: GradeBand; label: string; large?: boolean }) {
  return (
    <View style={{
      minWidth: large ? 76 : 52, height: large ? 60 : 40, paddingHorizontal: 8, borderRadius: r.chipRect, alignItems: "center", justifyContent: "center",
      backgroundColor: band.fill, borderColor: band.border, borderWidth: band.borderWidth,
    }}>
      <Text v="climbName" style={{ fontFamily: font.display, fontSize: large ? 44 : 26, color: band.text }}>{label}</Text>
    </View>
  );
}

export function Stars({ value, size: sz = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }} accessible accessibilityLabel={`${value.toFixed(1)} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <Svg key={i} width={sz} height={sz} viewBox="0 0 24 24">
          <Path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.5 6 20.9l1.3-6.7-5-4.7 6.8-.8L12 2.5Z" fill={value >= i - 0.25 ? c.starOn : c.starOff} />
        </Svg>
      ))}
    </View>
  );
}

export function ClassicTag() {
  return (
    <View style={{ borderWidth: 1, borderColor: c.classicBorder, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
      <Text style={{ fontFamily: font.uiSemi, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: c.classicText, fontWeight: "700" }}>Classic</Text>
    </View>
  );
}

const SCRIM_IN = 160;
const SLIDE_IN = 260;

/**
 * Bottom sheet. The scrim fades in first, then the pane slides up; closing reverses it.
 * Modal's own animation is off because it would slide the scrim together with the pane.
 */
export function Sheet({ visible, onClose, title, children, footer, onReset }: {
  visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; onReset?: () => void;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const scrim = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(1)).current; // 0 = open, 1 = off-screen
  const native = Platform.OS !== "web";

  useEffect(() => {
    if (visible) {
      setMounted(true);
      scrim.setValue(0);
      slide.setValue(1);
      Animated.sequence([
        Animated.timing(scrim, { toValue: 1, duration: SCRIM_IN, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(slide, { toValue: 0, duration: SLIDE_IN, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(slide, { toValue: 1, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
        Animated.timing(scrim, { toValue: 0, duration: 140, useNativeDriver: native }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // The window does not resize for the keyboard (the modal is edge to edge), so lift the sheet by the keyboard's height.
  const keyboard = useKeyboardHeight();
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaProvider>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: scrim }]}>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { bottom: keyboard, maxHeight: Math.max(240, height - keyboard - 24), transform: [{ translateY: Animated.multiply(slide, height) }] }]}>
          <SheetBody title={title} onClose={onClose} onReset={onReset} footer={footer}>{children}</SheetBody>
        </Animated.View>
      </SafeAreaProvider>
    </Modal>
  );
}

/** The on-screen keyboard's height (0 when hidden). */
function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow", (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

function SheetBody({ title, onClose, onReset, footer, children }: {
  title: string; onClose: () => void; onReset?: () => void; footer?: ReactNode; children: ReactNode;
}) {
  // Android draws the sheet under the system navigation bar (3-button or gesture), so pad for it here.
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
        <Text v="sheetTitle" style={{ flex: 1 }}>{title}</Text>
        {onReset && (
          <Tap accessibilityRole="button" onPress={onReset} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text v="bodyStrong" style={{ color: c.muted }}>Reset</Text>
          </Tap>
        )}
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: footer ? 16 : 16 + insets.bottom }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      {footer ? <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.divider }}>{footer}</View> : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "86%", backgroundColor: c.ground,
    borderTopLeftRadius: r.sheetTop, borderTopRightRadius: r.sheetTop, borderTopWidth: 1, borderColor: c.lineStrong,
  },
});

export const SectionLabel = ({ children }: { children: string }) => (
  <Text v="section" style={{ marginTop: 20, marginBottom: 10 }}>{children}</Text>
);
