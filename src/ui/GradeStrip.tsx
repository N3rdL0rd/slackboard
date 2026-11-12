import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ScrollView } from "react-native";
import type { GradeBand } from "../core/grades";
import { c, r } from "../theme";
import { Tap } from "./parts";
import { Text } from "./Text";

export interface GradeCell {
  /** Identifies the grade: a difficulty number, or a label. */
  key: number | string;
  primary: string;
  secondary?: string | null;
  /** The grade's band colours, so every grade is shown in its own colour wherever it is picked. */
  band: GradeBand;
}

const CELL = 64;
const GAP = 8;

/**
 * Every grade of a scale in one scrolling row, each in its band colour. The chosen one gets a chalk ring. The row opens centred on
 * the chosen grade (or on `hint`, such as the community's grade, when nothing is chosen yet) and re-centres whenever `resetKey` changes.
 */
export function GradeStrip({ cells, value, hint, onChange, resetKey }: {
  cells: GradeCell[]; value: number | string | null; hint?: number | string | null; onChange: (key: number | string) => void; resetKey?: string | number;
}) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const at = value ?? hint ?? null;
    if (!width || at == null) return;
    const i = cells.findIndex((x) => x.key === at);
    if (i < 0) return;
    ref.current?.scrollTo({ x: Math.max(0, i * (CELL + GAP) - (width - CELL) / 2), animated: false });
  }, [width, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexGrow: 0, marginHorizontal: -4 }} contentContainerStyle={{ gap: GAP, paddingHorizontal: 4, paddingVertical: 6 }} accessibilityRole="radiogroup">
      {cells.map((g) => {
        const on = g.key === value;
        const label = g.secondary ? `${g.primary}, ${g.secondary}` : g.primary;
        return (
          <Tap key={g.key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on, checked: on }} onPress={() => onChange(g.key)}
            style={{
              width: CELL, height: CELL, borderRadius: r.chipRect, alignItems: "center", justifyContent: "center", backgroundColor: g.band.fill,
              borderWidth: on ? 3 : g.band.borderWidth, borderColor: on ? c.text : g.band.border, opacity: value != null && !on ? 0.78 : 1,
            }}>
            <Text style={{ fontFamily: "BarlowCondensed_700Bold", fontSize: 26, lineHeight: 30, color: g.band.text, includeFontPadding: false }}>{g.primary}</Text>
            {g.secondary ? <Text style={{ fontFamily: "Barlow_500Medium", fontSize: 11, lineHeight: 14, color: g.band.text, opacity: 0.85, includeFontPadding: false }}>{g.secondary}</Text> : null}
          </Tap>
        );
      })}
    </ScrollView>
  );
}
