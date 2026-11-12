import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  return (
    <>
      {open ? <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} /> : null}
      {open ? (
        <View style={{ position: "absolute", right: 16, bottom: bottom + 56 + 14, alignItems: "flex-end", gap: 10 }}>
          {items.map((it) => (
            <Tap key={it.label} accessibilityRole="button" accessibilityLabel={it.label} onPress={() => { setOpen(false); it.onPress(); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: r.input, borderWidth: 1, backgroundColor: it.primary ? c.btn : c.raised, borderColor: it.primary ? c.btn : c.lineStrong }}>
                <Text v="bodyStrong" style={it.primary ? { color: c.btnText } : undefined}>{it.label}</Text>
              </View>
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, backgroundColor: it.primary ? c.btn : c.card, borderColor: it.primary ? c.btn : c.lineStrong }}>
                <Icon name={it.icon} size={22} color={it.primary ? c.btnText : c.text} />
              </View>
            </Tap>
          ))}
        </View>
      ) : null}
      <Tap accessibilityRole="button" accessibilityLabel={open ? "Close menu" : "Set, log or plan"} accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)}
        style={{ position: "absolute", right: 16, bottom, width: 56, height: 56, borderRadius: 28, backgroundColor: c.btn, alignItems: "center", justifyContent: "center" }}>
        <Icon name={open ? "close" : "plus"} size={24} color={c.btnText} stroke={2.5} />
      </Tap>
    </>
  );
}
