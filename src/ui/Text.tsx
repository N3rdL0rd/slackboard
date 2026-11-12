import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { c, font } from "../theme";

const variants = {
  screenTitle: { fontFamily: font.display, fontSize: 36, color: c.text },
  sheetTitle: { fontFamily: font.display, fontSize: 28, color: c.text },
  climbName: { fontFamily: font.displaySemi, fontSize: 22, color: c.text },
  climbNameView: { fontFamily: font.display, fontSize: 32, color: c.text },
  button: { fontFamily: font.display, fontSize: 22, letterSpacing: 0.8, textTransform: "uppercase" as const, color: c.text },
  body: { fontFamily: font.ui, fontSize: 16, color: c.text },
  bodyStrong: { fontFamily: font.uiSemi, fontSize: 16.5, color: c.text },
  secondary: { fontFamily: font.ui, fontSize: 14, color: c.muted },
  caption: { fontFamily: font.ui, fontSize: 13, color: c.caption },
  section: {
    fontFamily: font.uiSemi, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" as const, color: c.caption,
  },
  nav: { fontFamily: font.uiMedium, fontSize: 12, color: c.muted },
  numeral: { fontFamily: font.display, fontSize: 28, color: c.text },
};
export type Variant = keyof typeof variants;

/**
 * Android clips glyph tops and descenders when lineHeight is tighter than the font's own metrics
 * (Barlow and Caveat Brush have tall ones), so every Text gets lineHeight = 1.3 x fontSize
 * unless the caller sets one explicitly.
 */
export function Text({ v = "body", style, ...p }: TextProps & { v?: Variant }) {
  const flat = StyleSheet.flatten([variants[v], style]) as { fontSize?: number; lineHeight?: number };
  const lineHeight = flat.lineHeight ?? Math.round((flat.fontSize ?? 16) * 1.3);
  return <RNText maxFontSizeMultiplier={1.3} {...p} style={[flat, { lineHeight }]} />;
}
