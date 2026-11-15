import { useMemo } from "react";
import { View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { bucketSeries, valueRange, type Pt } from "../core/chartData";
import { c } from "../theme";

export interface Track {
  id: string; label: string; unit: string; color: string; points: Pt[];
  /** A second series drawn on the same scale, to compare with the first. */
  overlay?: { color: string; points: Pt[] };
}
export interface Band { start: number; end: number; color: string }
export interface Mark { at: number; color: string }

const GAP = 6;

/**
 * Several series on one shared time axis, stacked. Touch or drag to put a cursor on a moment; `onActive` says when a finger is down so the
 * page behind can stop scrolling. Bands shade stretches (attempts); marks are lines at moments (labels).
 */
export function TimeChart({ tracks, from, to, width, trackHeight = 70, bands = [], marks = [], cursor, onCursor, onActive }: {
  tracks: Track[]; from: number; to: number; width: number; trackHeight?: number; bands?: Band[]; marks?: Mark[];
  cursor: number | null; onCursor: (at: number) => void; onActive?: (active: boolean) => void;
}) {
  const height = tracks.length * (trackHeight + GAP);
  const x = (t: number) => ((t - from) / (to - from)) * width;
  const drawn = useMemo(() => tracks.map((t) => {
    const pts = bucketSeries(t.points, from, to, Math.max(1, Math.floor(width)));
    const { lo, hi } = valueRange(t.overlay ? [...t.points, ...t.overlay.points] : t.points, from, to);
    const over = t.overlay ? bucketSeries(t.overlay.points, from, to, Math.max(1, Math.floor(width))) : [];
    return { t, pts, over, lo, hi };
  }), [tracks, from, to, width]);
  const at = (e: any) => onCursor(Math.round(from + (Math.min(width, Math.max(0, e.nativeEvent.locationX)) / width) * (to - from)));

  return (
    <View
      accessible accessibilityLabel="Timeline chart" onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => { onActive?.(true); at(e); }} onResponderMove={at} onResponderTerminationRequest={() => false}
      onResponderRelease={() => onActive?.(false)} onResponderTerminate={() => onActive?.(false)}
      style={{ width, height }}
    >
      <Svg width={width} height={height} pointerEvents="none">
        {drawn.map(({ t, pts, over, lo, hi }, i) => {
          const top = i * (trackHeight + GAP);
          const y = (v: number) => top + trackHeight - ((v - lo) / (hi - lo)) * trackHeight;
          const path = (ps: typeof pts) => ps.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.at).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
          const d = path(pts);
          const d2 = path(over);
          return (
            <G key={t.id}>
              <Rect key={`${t.id}-bg`} x={0} y={top} width={width} height={trackHeight} fill={c.card} />
              {bands.map((b, k) => <Rect key={`${t.id}-b${k}`} x={Math.max(0, x(b.start))} y={top} width={Math.max(1, Math.min(width, x(b.end)) - Math.max(0, x(b.start)))} height={trackHeight} fill={b.color} opacity={0.22} />)}
              {d2 && t.overlay ? <Path key={`${t.id}-p2`} d={d2} stroke={t.overlay.color} strokeWidth={1.6} fill="none" strokeLinejoin="round" /> : null}
              {d ? <Path key={`${t.id}-p`} d={d} stroke={t.color} strokeWidth={1.6} fill="none" strokeLinejoin="round" /> : null}
              <SvgText key={`${t.id}-l`} x={6} y={top + 13} fontSize={11} fill={c.text2}>{`${t.label} (${t.unit})`}</SvgText>
              <SvgText key={`${t.id}-hi`} x={width - 4} y={top + 12} fontSize={10} fill={c.muted} textAnchor="end">{hi.toFixed(1)}</SvgText>
              <SvgText key={`${t.id}-lo`} x={width - 4} y={top + trackHeight - 3} fontSize={10} fill={c.muted} textAnchor="end">{lo.toFixed(1)}</SvgText>
            </G>
          );
        })}
        {marks.filter((m) => m.at >= from && m.at <= to).map((m, k) => <Line key={`m${k}`} x1={x(m.at)} y1={0} x2={x(m.at)} y2={height} stroke={m.color} strokeWidth={1.5} strokeDasharray="4 3" />)}
        {cursor !== null && cursor >= from && cursor <= to ? <Line x1={x(cursor)} y1={0} x2={x(cursor)} y2={height} stroke="#FFFFFF" strokeWidth={1.5} /> : null}
      </Svg>
    </View>
  );
}
