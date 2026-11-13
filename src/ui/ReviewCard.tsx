import type { ReactNode } from "react";
import { View } from "react-native";
import { c, r } from "../theme";
import { Text } from "./Text";

/** One card of a review: a short title and what it holds. */
export function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ padding: 16, gap: 10, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text v="section">{title}</Text>
      {children}
    </View>
  );
}

/** A big number with a small label under it. */
export function Figure({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text v="numeral" style={{ fontSize: 34 }}>{value}</Text>
      <Text v="secondary">{label}</Text>
    </View>
  );
}
