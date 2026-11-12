import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { angleAt, centreOf, dialPitch, directionOf, dragStep, nearestAngle, rotationFor } from "../core/angleDial";
import { c } from "../theme";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

const SIZE = 264;
const MID = SIZE / 2;
const RIM = 120;

/**
 * A wheel that turns under a fixed pointer. Drag around its centre to rotate it; each angle it passes ticks under your finger, and
 * on release it settles on the nearest angle the board offers, without overshoot. The chevrons and the screen reader's
 * increment/decrement step one angle at a time. The maths is in core/angleDial.ts.
 */
export function AngleDial({ angles, value, onChange }: { angles: number[]; value: number; onChange: (a: number) => void }) {
  const sorted = useMemo(() => [...angles].sort((a, b) => a - b), [angles]);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const centre = centreOf(lo, hi);
  const k = dialPitch(lo, hi);
  const rot = useRef(new Animated.Value(rotationFor(value, centre, k))).current;
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const live = useRef({ sorted, k, centre, lo, hi, onChange });
  live.current = { sorted, k, centre, lo, hi, onChange };

  const show = (a: number) => { shownRef.current = a; setShown(a); };
  // A critically damped spring: it arrives and stops, where the old bouncy one rocked past the angle and back.
  const snapTo = (a: number) => {
    Animated.spring(rot, { toValue: rotationFor(a, live.current.centre, live.current.k), useNativeDriver: true, stiffness: 320, damping: 36, mass: 1 }).start();
  };

  // Follow external changes (e.g. the board switched) without fighting a drag.
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) { show(value); snapTo(value); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = useRef(rotationFor(value, centre, k));
  useEffect(() => { const id = rot.addListener(({ value: v }) => { cur.current = v; }); return () => rot.removeListener(id); }, [rot]);

  // The finger is tracked by screen position against the dial's measured centre: `locationX/Y` is relative to whatever view the
  // touch landed on, and jumps when that changes.
  const box = useRef<ComponentRef<typeof View>>(null);
  const centrePx = useRef({ x: 0, y: 0 });
  const lastDirection = useRef(0);
  const ready = useRef(false);
  const atLimit = useRef(false);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      dragging.current = true;
      ready.current = false;
      atLimit.current = false;
      const { pageX, pageY } = e.nativeEvent;
      rot.stopAnimation((v) => {
        cur.current = v;
        box.current?.measureInWindow((x, y, w, h) => {
          centrePx.current = { x: x + w / 2, y: y + h / 2 };
          lastDirection.current = directionOf(pageX, pageY, centrePx.current.x, centrePx.current.y);
          ready.current = true;
        });
      });
    },
    onPanResponderMove: (e) => {
      if (!ready.current) return;
      const L = live.current;
      const dir = directionOf(e.nativeEvent.pageX, e.nativeEvent.pageY, centrePx.current.x, centrePx.current.y);
      const step = dragStep(cur.current, lastDirection.current, dir, { min: L.lo, max: L.hi, centre: L.centre, pitch: L.k });
      lastDirection.current = step.direction;
      cur.current = step.rotation;
      rot.setValue(step.rotation);
      const a = nearestAngle(L.sorted, angleAt(step.rotation, L.centre, L.k));
      if (a !== shownRef.current) { show(a); haptic.selection(); }
      if (step.clamped && !atLimit.current) haptic.medium(); // the end of the dial
      atLimit.current = step.clamped;
    },
    onPanResponderRelease: () => {
      dragging.current = false;
      ready.current = false;
      const L = live.current;
      const a = nearestAngle(L.sorted, angleAt(cur.current, L.centre, L.k));
      show(a); snapTo(a);
      L.onChange(a);
    },
    onPanResponderTerminate: () => { dragging.current = false; ready.current = false; snapTo(shownRef.current); },
  })).current;

  const step = (dir: number) => {
    const i = sorted.indexOf(shown) + dir;
    if (i < 0 || i >= sorted.length) return;
    haptic.selection();
    show(sorted[i]); snapTo(sorted[i]); onChange(sorted[i]);
  };

  const spin = rot.interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] });
  const pos = (deg: number, rad: number) => { const t = (deg * Math.PI) / 180; return { x: MID + Math.sin(t) * rad, y: MID - Math.cos(t) * rad }; };
  const arcFrom = pos(-(hi - lo) * k / 2 - 8, RIM + 10);
  const arcTo = pos((hi - lo) * k / 2 + 8, RIM + 10);

  return (
    <View style={{ alignItems: "center" }}>
      <View accessible accessibilityRole="adjustable" accessibilityLabel="Board angle" accessibilityValue={{ text: `${shown} degrees` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        ref={box} collapsable={false} style={{ width: SIZE, height: SIZE }} {...pan.panHandlers}>
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: SIZE, height: SIZE, transform: [{ rotate: spin }] }}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={MID} cy={MID} r={RIM + 6} fill={c.card} stroke={c.lineStrong} strokeWidth={2} />
            {sorted.map((a) => {
              const deg = (a - centre) * k;
              const major = a % 10 === 0;
              const p1 = pos(deg, RIM - (major ? 16 : 9));
              const p2 = pos(deg, RIM);
              const lab = pos(deg, RIM - 32);
              return (
                <G key={a}>
                  <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={a === shown ? c.text : c.muted} strokeWidth={a === shown ? 4 : major ? 3 : 2} strokeLinecap="round" />
                  {major ? <SvgText x={lab.x} y={lab.y + 4} fill={a === shown ? c.text : c.muted} fontSize={12} fontWeight="600" textAnchor="middle" rotation={deg} origin={`${lab.x}, ${lab.y}`}>{String(a)}</SvgText> : null}
                </G>
              );
            })}
          </Svg>
        </Animated.View>
        <Svg width={SIZE} height={SIZE} pointerEvents="none" style={{ position: "absolute" }}>
          <Path d={`M ${MID - 11} 3 L ${MID + 11} 3 L ${MID} 24 Z`} fill={c.text} />
          <Circle cx={MID} cy={MID} r={62} fill={c.ground} stroke={c.lineStrong} strokeWidth={2} />
        </Svg>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: MID - 34, alignItems: "center" }}>
          <Text v="numeral" style={{ fontSize: 46, lineHeight: 60, color: c.text }}>{shown}°</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous angle" disabled={shown <= lo} onPress={() => step(-1)}
          style={{ width: 52, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: shown <= lo ? 0.35 : 1 }}>
          <Icon name="chevL" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next angle" disabled={shown >= hi} onPress={() => step(1)}
          style={{ width: 52, height: 44, borderRadius: 22, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: shown >= hi ? 0.35 : 1 }}>
          <Icon name="chevR" />
        </Pressable>
      </View>
    </View>
  );
}
