import { useMemo } from "react";
import { View } from "react-native";
import type { Day } from "../core/days";
import { calendarWeeks, streakLabel, streakStateText, type DayMark, type StreakInfo } from "../core/streak";
import { c } from "../theme";
import { Sheet } from "./parts";
import { Text } from "./Text";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
export const DOT = 10;

/** One day as a dot: filled when climbed, a ring for a rest day that keeps the streak, faint when empty, nothing for days to come. */
export function Dot({ mark, size = DOT }: { mark: DayMark; size?: number }) {
  const base = { width: size, height: size, borderRadius: size / 2 } as const;
  if (mark === "climbed") return <View style={{ ...base, backgroundColor: c.text }} />;
  if (mark === "rest") return <View style={{ ...base, borderWidth: 1.5, borderColor: c.text }} />;
  if (mark === "empty") return <View style={{ ...base, backgroundColor: c.dim }} />;
  return <View style={{ ...base, borderWidth: 1, borderColor: c.divider }} />;
}

const MARK_WORD: Record<DayMark, string> = { climbed: "climbed", rest: "rest day, keeps your streak", empty: "nothing logged", future: "not yet" };
export const markWord = (m: DayMark) => MARK_WORD[m];

/** The streak in full: the last eight weeks as a calendar, the current and longest streak, and the one-day-gap rule in a line. */
export function StreakSheet({ visible, onClose, streak, days, today }: { visible: boolean; onClose: () => void; streak: StreakInfo; days: Day[]; today: Day }) {
  const weeks = useMemo(() => calendarWeeks(days, today, 8), [days, today]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Your streak">
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 20 }}>
        <View>
          <Text v="numeral" style={{ fontSize: 44 }}>{streak.current}</Text>
          <Text v="caption">{streak.current === 1 ? "climbing day" : "climbing days"}</Text>
        </View>
        <View>
          <Text v="numeral" style={{ fontSize: 28, color: c.text2 }}>{streak.longest}</Text>
          <Text v="caption">longest</Text>
        </View>
      </View>
      <Text v="bodyStrong" style={{ marginTop: 10 }}>{streakStateText(streak)}</Text>
      {streak.current > 0 && streak.span > streak.current ? <Text v="secondary">{streakLabel(streak)}, counting rest days</Text> : null}

      <View accessible accessibilityLabel={`The last eight weeks. Climbed on ${weeks.flat().filter((d) => d.mark === "climbed").length} days.`} style={{ marginTop: 16, gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {LETTERS.map((l, i) => <Text key={i} v="caption" style={{ width: 18, textAlign: "center" }}>{l}</Text>)}
        </View>
        {weeks.map((row, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 18 }}>
            {row.map((d) => <View key={d.day} style={{ width: 18, alignItems: "center" }}><Dot mark={d.mark} size={12} /></View>)}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 }}>
        {(["climbed", "rest", "empty"] as const).map((m) => (
          <View key={m} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Dot mark={m} size={12} /><Text v="caption">{m === "climbed" ? "Climbed" : m === "rest" ? "Rest day, keeps it going" : "Nothing"}</Text></View>
        ))}
      </View>
      <Text v="caption" style={{ marginTop: 14 }}>How streaks work: any logged climb or training counts as a climbing day, and one rest day between climbing days keeps the streak going. Two in a row ends it, and your longest is always kept.</Text>
    </Sheet>
  );
}
