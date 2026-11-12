import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { gradeColor } from "../core/grades";
import type { WeekPoint } from "../core/stats";
import { c } from "../theme";

/** A line through the non-null values, breaking at gaps so a missing week is not drawn as a drop. */
function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Tiny trend line for the Climbs tab: working grade over the shown weeks. */
export function Sparkline({ values, width, height }: { values: (number | null)[]; width: number; height: number }) {
  const path = useMemo(() => {
    const nums = values.filter((v): v is number => v != null);
    if (nums.length < 2) return null;
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    const span = Math.max(1, hi - lo);
    const x = (i: number) => 2 + (i / Math.max(1, values.length - 1)) * (width - 4);
    const y = (v: number) => height - 3 - ((v - lo) / span) * (height - 6);
    const last = values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()!;
    return { d: linePath(values, x, y), cx: x(last), cy: y(values[last]!) };
  }, [values, width, height]);
  if (!path) return <View style={{ width, height }} />;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={path.d} stroke={c.text} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={path.cx} cy={path.cy} r={3.5} fill={c.text} />
    </Svg>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Grade progression: a line for the working grade (average of the three hardest sends over eight weeks) over dots for each
 * week's hardest send. `label` turns a difficulty into the user's grade text for the axis.
 */
export function ProgressionChart({ weeks, width, height, label }: { weeks: WeekPoint[]; width: number; height: number; label: (difficulty: number) => string }) {
  const g = useMemo(() => {
    const vals = weeks.flatMap((w) => [w.best, w.working]).filter((v): v is number => v != null);
    if (!vals.length) return null;
    const lo = Math.floor(Math.min(...vals)) - 1;
    const hi = Math.ceil(Math.max(...vals)) + 1;
    const padL = 40, padR = 8, padT = 10, padB = 22;
    const x = (i: number) => padL + (i / Math.max(1, weeks.length - 1)) * (width - padL - padR);
    const y = (v: number) => padT + (1 - (v - lo) / Math.max(1, hi - lo)) * (height - padT - padB);
    const step = Math.max(1, Math.ceil((hi - lo) / 4));
    const ticks: number[] = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    // Month labels where the month changes, thinned so they never collide.
    const months: { i: number; text: string }[] = [];
    let prev = -1;
    weeks.forEach((w, i) => { const m = w.start.getMonth(); if (m !== prev) { prev = m; if (!months.length || i - months[months.length - 1].i >= 4) months.push({ i, text: MONTHS[m] }); } });
    return { x, y, ticks, months, padL, padB, line: linePath(weeks.map((w) => w.working), x, y) };
  }, [weeks, width, height]);
  if (!g) return <View style={{ width, height, alignItems: "center", justifyContent: "center" }} />;
  return (
    <Svg width={width} height={height} accessibilityLabel="Grade progression chart">
      {g.ticks.map((v) => (
        <G key={v}>
          <Line x1={g.padL} x2={width - 8} y1={g.y(v)} y2={g.y(v)} stroke={c.divider} strokeWidth={1} />
          <SvgText x={g.padL - 6} y={g.y(v) + 4} fill={gradeColor(v)} fontSize={11} fontWeight="600" textAnchor="end">{label(v)}</SvgText>
        </G>
      ))}
      {g.months.map((m) => <SvgText key={m.i} x={g.x(m.i)} y={height - 6} fill={c.muted} fontSize={11} textAnchor="middle">{m.text}</SvgText>)}
      {weeks.map((w, i) => (w.best != null ? <Circle key={i} cx={g.x(i)} cy={g.y(w.best)} r={3.5} fill={gradeColor(w.best)} /> : null))}
      <Path d={g.line} stroke={c.text} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Sends per week as bars. */
export function VolumeBars({ weeks, width, height }: { weeks: WeekPoint[]; width: number; height: number }) {
  const max = Math.max(1, ...weeks.map((w) => w.sends));
  const slot = width / Math.max(1, weeks.length);
  const bw = Math.max(2, Math.min(18, slot - 3));
  return (
    <Svg width={width} height={height} accessibilityLabel="Sends per week">
      <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={c.divider} strokeWidth={1} />
      {weeks.map((w, i) => {
        const h = (w.sends / max) * (height - 6);
        return w.sends ? <Rect key={i} x={i * slot + (slot - bw) / 2} y={height - 1 - h} width={bw} height={h} rx={2} fill={c.text} /> : null;
      })}
    </Svg>
  );
}
