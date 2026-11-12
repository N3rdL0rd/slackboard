import { useEffect, useRef, type ComponentRef, type ReactNode } from "react";
import { Animated, Easing, PanResponder, View, type GestureResponderEvent } from "react-native";
import { r } from "../theme";

const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_ZOOM = 2.5;

/** The translation that keeps a view of `size` scaled by `scale` covering its frame. */
export function clampPan(t: number, scale: number, size: number): number {
  const limit = ((scale - 1) * size) / 2;
  return Math.max(-limit, Math.min(limit, t));
}

/**
 * Pinch to zoom, drag to pan while zoomed, double-tap to toggle zoom. At normal zoom a one-finger drag is left alone, so
 * a parent's swipe gesture still works. `resetKey` returns the view to normal when it changes (e.g. another climb).
 */
export function ZoomView({ width, height, children, resetKey, onZoomedChange }: {
  width: number; height: number; children: ReactNode; resetKey?: string; onZoomedChange?: (zoomed: boolean) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const box = useRef<ComponentRef<typeof View>>(null);
  // Plain numbers mirror the animated values: the gesture maths needs them synchronously.
  const cur = useRef({ s: 1, x: 0, y: 0 });
  const start = useRef({ s: 1, x: 0, y: 0, d: 0, mx: 0, my: 0, ox: 0, oy: 0, ready: false });
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const size = useRef({ width, height });
  size.current = { width, height };
  const notify = useRef(onZoomedChange);
  notify.current = onZoomedChange;
  const wasZoomed = useRef(false);

  const apply = (s: number, x: number, y: number) => {
    const w = size.current;
    const cx = clampPan(x, s, w.width);
    const cy = clampPan(y, s, w.height);
    cur.current = { s, x: cx, y: cy };
    scale.setValue(s); tx.setValue(cx); ty.setValue(cy);
    const z = s > 1.02;
    if (z !== wasZoomed.current) { wasZoomed.current = z; notify.current?.(z); }
  };
  const animateTo = (s: number, x: number, y: number) => {
    const w = size.current;
    const cx = clampPan(x, s, w.width);
    const cy = clampPan(y, s, w.height);
    cur.current = { s, x: cx, y: cy };
    const cfg = { duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true };
    Animated.parallel([Animated.timing(scale, { toValue: s, ...cfg }), Animated.timing(tx, { toValue: cx, ...cfg }), Animated.timing(ty, { toValue: cy, ...cfg })]).start();
    const z = s > 1.02;
    if (z !== wasZoomed.current) { wasZoomed.current = z; notify.current?.(z); }
  };

  useEffect(() => { if (cur.current.s !== 1) animateTo(1, 0, 0); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const touches = (e: GestureResponderEvent) => e.nativeEvent.touches;
  const begin = (e: GestureResponderEvent) => {
    const t = touches(e);
    const mx = t.length >= 2 ? (t[0].pageX + t[1].pageX) / 2 : t[0].pageX;
    const my = t.length >= 2 ? (t[0].pageY + t[1].pageY) / 2 : t[0].pageY;
    const d = t.length >= 2 ? Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY) : 0;
    start.current = { ...start.current, s: cur.current.s, x: cur.current.x, y: cur.current.y, d, mx, my, ready: false };
    // The container's position on screen changes as the page scrolls, so measure it when the gesture begins.
    box.current?.measureInWindow((ox, oy) => { start.current.ox = ox; start.current.oy = oy; start.current.ready = true; });
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (e, g) => touches(e).length >= 2 || (cur.current.s > 1.02 && Math.hypot(g.dx, g.dy) > 4),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: begin,
    onPanResponderMove: (e, g) => {
      const t = touches(e);
      const st = start.current;
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (st.d === 0) { begin(e); return; } // a second finger arrived mid-pan: restart from the current state
        if (!st.ready) return;
        const mx = (t[0].pageX + t[1].pageX) / 2;
        const my = (t[0].pageY + t[1].pageY) / 2;
        const s = Math.max(1, Math.min(MAX_ZOOM, st.s * (d / st.d)));
        // Keep the content point that was under the fingers at the start under them now.
        const w = size.current;
        const cxs = st.ox + w.width / 2;
        const cys = st.oy + w.height / 2;
        const qx = (st.mx - cxs - st.x) / st.s;
        const qy = (st.my - cys - st.y) / st.s;
        apply(s, mx - cxs - s * qx, my - cys - s * qy);
      } else if (cur.current.s > 1.02) {
        if (st.d !== 0) { begin(e); return; } // dropped to one finger: continue as a pan
        apply(cur.current.s, st.x + g.dx, st.y + g.dy);
      }
    },
    onPanResponderRelease: () => { if (cur.current.s < 1.05) animateTo(1, 0, 0); },
    onPanResponderTerminate: () => { if (cur.current.s < 1.05) animateTo(1, 0, 0); },
  })).current;

  // A double tap toggles zoom. Touch events bubble even when this view is not the responder, so taps are detected here.
  const onTouchEnd = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches.length > 0) return;
    const { pageX, pageY, timestamp } = e.nativeEvent;
    const lt = lastTap.current;
    if (timestamp - lt.t < DOUBLE_TAP_MS && Math.hypot(pageX - lt.x, pageY - lt.y) < 30) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      if (cur.current.s > 1.02) animateTo(1, 0, 0);
      else box.current?.measureInWindow((ox, oy) => {
        const w = size.current;
        const s = DOUBLE_TAP_ZOOM;
        animateTo(s, -(pageX - ox - w.width / 2) * (s - 1), -(pageY - oy - w.height / 2) * (s - 1));
      });
    } else lastTap.current = { t: timestamp, x: pageX, y: pageY };
  };

  return (
    <View ref={box} style={{ width, height, overflow: "hidden", borderRadius: r.board }} onTouchEnd={onTouchEnd} {...pan.panHandlers}>
      <Animated.View style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>{children}</Animated.View>
    </View>
  );
}
