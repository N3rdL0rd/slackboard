import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { PanResponder, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import { describeRange } from "../core/filters";
import type { GradeScale } from "../core/grades";
import { c } from "../theme";
import { Text } from "./Text";

const HANDLE_W = 20;
const HANDLE_H = 40;
const CELL_W = 52;
const CELL_H = 60;
/** While dragging a handle this close to either edge of the viewport, the strip scrolls. */
const EDGE = 44;
const EDGE_SPEED = 9;

/**
 * Grade range picker on a strip wider than the screen. Swipe the strip sideways to move around;
 * drag either handle to resize the bracket (the strip follows when you reach an edge), or tap a
 * grade to move the nearest handle there. Covering every grade means "any grade".
 */
export function GradeRange({ scale, min, max, onChange }: {
  scale: GradeScale; min: number | null; max: number | null; onChange: (min: number | null, max: number | null) => void;
}) {
  const vs = useMemo(() => scale.vNumbers(), [scale]);
  const n = vs.length;
  const total = n * CELL_W;
  const [viewW, setViewW] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const lo = min == null ? 0 : Math.max(0, vs.indexOf(min));
  const hi = max == null ? n - 1 : Math.max(0, vs.indexOf(max));
  const active = min != null || max != null;

  const commit = (a: number, b: number) => {
    const l = Math.min(a, b);
    const h = Math.max(a, b);
    if (l <= 0 && h >= n - 1) onChange(null, null);
    else onChange(l <= 0 ? null : vs[l], h >= n - 1 ? null : vs[h]);
  };

  // Responders and timers are created once, so they read the latest state through a ref.
  const live = useRef({ lo, hi, n, viewW, commit });
  live.current = { lo, hi, n, viewW, commit };
  const scrollX = useRef(0);
  const drag = useRef({ side: "lo" as "lo" | "hi", startViewportX: 0, dx: 0, timer: undefined as ReturnType<typeof setInterval> | undefined });

  const scrollTo = (x: number) => {
    const clamped = Math.max(0, Math.min(x, Math.max(0, total - live.current.viewW)));
    scrollX.current = clamped;
    scroller.current?.scrollTo({ x: clamped, animated: false });
  };

  // Handle position follows the finger: content x = viewport x of finger + scroll offset.
  const applyDrag = () => {
    const { side, startViewportX, dx } = drag.current;
    const { lo: l, hi: h, n: count, commit: save } = live.current;
    const boundary = Math.round((startViewportX + dx + scrollX.current) / CELL_W);
    if (side === "lo") {
      const next = Math.max(0, Math.min(boundary, h));
      if (next !== l) save(next, h);
    } else {
      const next = Math.max(l, Math.min(boundary - 1, count - 1));
      if (next !== h) save(l, next);
    }
  };

  const stopAuto = () => {
    clearInterval(drag.current.timer);
    drag.current.timer = undefined;
  };

  const makeHandle = (side: "lo" | "hi") =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { lo: l, hi: h } = live.current;
        const contentX = side === "lo" ? l * CELL_W : (h + 1) * CELL_W;
        drag.current = { side, startViewportX: contentX - scrollX.current, dx: 0, timer: undefined };
      },
      onPanResponderMove: (_, g) => {
        drag.current.dx = g.dx;
        applyDrag();
        const fingerX = drag.current.startViewportX + g.dx;
        const dir = fingerX < EDGE ? -1 : fingerX > live.current.viewW - EDGE ? 1 : 0;
        if (dir && !drag.current.timer) {
          drag.current.timer = setInterval(() => {
            const f = drag.current.startViewportX + drag.current.dx;
            const d = f < EDGE ? -1 : f > live.current.viewW - EDGE ? 1 : 0;
            if (!d) return stopAuto();
            scrollTo(scrollX.current + d * EDGE_SPEED);
            applyDrag();
          }, 16);
        } else if (!dir) stopAuto();
      },
      onPanResponderRelease: stopAuto,
      onPanResponderTerminate: stopAuto,
    });
  const loHandle = useRef(makeHandle("lo")).current;
  const hiHandle = useRef(makeHandle("hi")).current;
  useEffect(() => stopAuto, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bring the current range into view when the sheet opens.
  const placed = useRef(false);
  useEffect(() => {
    if (viewW > 0 && !placed.current) {
      placed.current = true;
      scrollTo(((lo + hi + 1) / 2) * CELL_W - viewW / 2);
    }
  }, [viewW]); // eslint-disable-line react-hooks/exhaustive-deps

  const tapCell = (i: number) => {
    if (i < lo) commit(i, hi);
    else if (i > hi) commit(lo, i);
    else if (i - lo <= hi - i) commit(i, hi);
    else commit(lo, i);
  };

  const count = hi - lo + 1;
  const left = lo * CELL_W;
  const right = (hi + 1) * CELL_W;
  const ink = active ? c.text : c.muted;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 }}>
        <View>
          <Text v="sheetTitle" style={{ fontSize: 30 }}>{describeRange(min, max)}</Text>
          <Text v="caption">{active ? `${count} ${count === 1 ? "grade" : "grades"}` : "Drag the handles to narrow it down"}</Text>
        </View>
        {active && (
          <Pressable accessibilityRole="button" onPress={() => onChange(null, null)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text v="bodyStrong" style={{ color: c.text2 }}>Any grade</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollX.current = e.nativeEvent.contentOffset.x; }}
        onLayout={(e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)}
        style={{ flexGrow: 0, flexShrink: 0, marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        <View style={{ width: total, height: HANDLE_H + CELL_H }}>
          <View style={{ position: "absolute", left: 0, top: HANDLE_H, height: CELL_H, flexDirection: "row" }}>
            {vs.map((v, i) => {
              const inside = i >= lo && i <= hi;
              const band = scale.band(scale.rangeForV(v, v)[0]);
              return (
                <Pressable key={v} accessibilityRole="button" accessibilityLabel={`V${v}`} accessibilityState={{ selected: active && inside }} onPress={() => tapCell(i)}
                  style={{ width: CELL_W, height: CELL_H, paddingHorizontal: 2 }}>
                  <View style={{ flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center",
                    backgroundColor: inside ? band.fill : c.card, borderWidth: inside ? band.borderWidth : 1, borderColor: inside ? band.border : c.line }}>
                    <Text style={{ fontSize: 20, fontFamily: "BarlowCondensed_700Bold", color: inside ? band.text : c.muted }}>V{v}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Bracket: a bar between the handles, with a leg dropping down each boundary. */}
          <View pointerEvents="none" style={{ position: "absolute", left, width: right - left, top: HANDLE_H / 2 - 1.5, height: 3, backgroundColor: ink }} />
          <View pointerEvents="none" style={{ position: "absolute", left: left - 1.5, top: HANDLE_H, width: 3, height: CELL_H, backgroundColor: ink }} />
          <View pointerEvents="none" style={{ position: "absolute", left: right - 1.5, top: HANDLE_H, width: 3, height: CELL_H, backgroundColor: ink }} />

          <Handle x={left} responder={loHandle} label="Lowest grade" value={`V${vs[lo]}`} onStep={(d) => commit(Math.max(0, Math.min(lo + d, hi)), hi)} />
          <Handle x={right} responder={hiHandle} label="Highest grade" value={`V${vs[hi]}`} onStep={(d) => commit(lo, Math.max(lo, Math.min(hi + d, n - 1)))} />
        </View>
      </ScrollView>
      <Text v="caption" style={{ marginTop: 6 }}>Swipe the grades sideways. Drag a handle, or tap a grade to move the nearest handle.</Text>
    </View>
  );
}

function Handle({ x, responder, label, value, onStep }: {
  x: number; responder: ReturnType<typeof PanResponder.create>; label: string; value: string; onStep: (d: number) => void;
}) {
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === "increment" ? 1 : -1)}
      hitSlop={{ left: 14, right: 14, top: 8, bottom: 8 }}
      style={{ position: "absolute", left: x - HANDLE_W / 2, top: 0, width: HANDLE_W, height: HANDLE_H, borderRadius: 10, backgroundColor: c.text,
        alignItems: "center", justifyContent: "center", gap: 3, zIndex: 2 }}
    >
      {[0, 1, 2].map((i) => <View key={i} style={{ width: 8, height: 2, borderRadius: 1, backgroundColor: c.btnText, opacity: 0.8 }} />)}
    </View>
  );
}
