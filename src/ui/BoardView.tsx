import { getProvider } from "../providers";
import { useMemo } from "react";
import { Image, Pressable, View } from "react-native";
import { MOON_ART } from "../data/moonArt";
import Svg, { Circle, G, Path } from "react-native-svg";
import type { Frame } from "../core/frames";
import type { BoardSpec, Placement, Role } from "../core/types";
import { c, r, role as roleTokens, type RoleName } from "../theme";

export interface BoardViewProps {
  spec: BoardSpec;
  placements: Placement[];
  roles: Role[];
  width: number;
  /** Lit holes for the current frame. */
  frame?: Frame;
  mirror?: boolean;
  /** Hold art layers (paths under the server's /img/), drawn under the markers. */
  images?: string[];
  /** Thumbnail mode: no background dots, no padding. */
  bare?: boolean;
  shapes?: boolean;
  highContrast?: boolean;
  /** Called with the nearest placement id when the board is tapped. */
  onPressHole?: (placementId: number) => void;
}

/** Hold art is served from the same image host as the official app. */

const spacingCache = new WeakMap<Placement[], number>();
function minSpacing(placements: Placement[]): number {
  const hit = spacingCache.get(placements);
  if (hit) return hit;
  let min = Infinity;
  for (let i = 0; i < placements.length; i++)
    for (let j = i + 1; j < placements.length; j++) {
      const d = Math.hypot(placements[i].x - placements[j].x, placements[i].y - placements[j].y);
      if (d > 0 && d < min) min = d;
    }
  spacingCache.set(placements, min);
  return min;
}

// Every thumbnail in a list shares one holes array, so its id lookup is built once, not per row.
const byIdCache = new WeakMap<Placement[], Map<number, Placement>>();
function placementsById(placements: Placement[]): Map<number, Placement> {
  let m = byIdCache.get(placements);
  if (!m) byIdCache.set(placements, (m = new Map(placements.map((p) => [p.id, p]))));
  return m;
}

function roleName(roles: Role[], id: number): RoleName {
  const n = roles.find((x) => x.id === id)?.name;
  return n === "start" || n === "middle" || n === "finish" || n === "foot" ? n : "middle";
}

function shapePath(shape: string, cx: number, cy: number, rad: number): string | null {
  switch (shape) {
    case "square":
      return `M${cx - rad} ${cy - rad}H${cx + rad}V${cy + rad}H${cx - rad}Z`;
    case "triangle":
      return `M${cx} ${cy - rad * 1.15}L${cx + rad * 1.1} ${cy + rad * 0.85}H${cx - rad * 1.1}Z`;
    case "diamond":
      return `M${cx} ${cy - rad * 1.2}L${cx + rad * 1.2} ${cy}L${cx} ${cy + rad * 1.2}L${cx - rad * 1.2} ${cy}Z`;
    default:
      return null;
  }
}

/** The height BoardView draws at for a given width, so a parent can size a container around it. */
export function boardHeight(spec: BoardSpec, width: number, bare = false): number {
  const pad = bare ? 3 : 14;
  const spanX = spec.edges.right - spec.edges.left;
  const spanY = spec.edges.top - spec.edges.bottom;
  return spanY * ((width - pad * 2) / spanX) + pad * 2;
}

export function BoardView({ bare, images, spec, placements, roles, width, frame, mirror, shapes, highContrast, onPressHole }: BoardViewProps) {
  const geo = useMemo(() => {
    const pad = bare ? 3 : 14;
    const spanX = spec.edges.right - spec.edges.left;
    const spanY = spec.edges.top - spec.edges.bottom;
    const s = (width - pad * 2) / spanX;
    const height = spanY * s + pad * 2;
    const min = minSpacing(placements);
    const px = (x: number) => pad + (x - spec.edges.left) * s;
    const py = (y: number) => pad + (spec.edges.top - y) * s;
    return { height, px, py, // Thumbnails are tiny, so the ring is sized to the hole spacing with no minimum: a fixed floor made neighbours overlap.
      ring: bare ? Math.max(1.2, min * s * 0.36) : Math.max(4, min * s * 0.42), s, pad, art: { left: pad, top: pad, width: spanX * s, height: spanY * s } };
  }, [spec, placements, width]);

  const byId = useMemo(() => placementsById(placements), [placements]);
  const lit = useMemo(() => {
    const out: { p: Placement; name: RoleName }[] = [];
    frame?.forEach((roleId, pid) => {
      const src = byId.get(pid);
      const p = mirror && src?.mirror != null ? byId.get(src.mirror) : src;
      if (p) out.push({ p, name: roleName(roles, roleId) });
    });
    return out;
  }, [frame, mirror, byId, roles]);

  const showShapes = shapes || highContrast;
  const stroke = bare ? Math.max(1, geo.ring * 0.34) : Math.max(2.2, geo.ring * 0.32);

  const handle = (e: any) => {
    if (!onPressHole) return;
    const { locationX, locationY } = e.nativeEvent;
    let best: Placement | null = null;
    let bd = Infinity;
    for (const p of placements) {
      const d = Math.hypot(geo.px(p.x) - locationX, geo.py(p.y) - locationY);
      if (d < bd) { bd = d; best = p; }
    }
    if (best && bd <= geo.ring * 2.2) onPressHole(best.id);
  };

  // A bundled layer that is not in the build (the art is optional) is skipped, and the board draws as plain dots.
  const layers = images?.filter((f) => !f.startsWith("bundled:") || f in MOON_ART) ?? [];
  const showArt = !bare && layers.length > 0;
  const svg = (
    <View style={{ width, height: geo.height, borderRadius: r.board, overflow: "hidden", backgroundColor: showArt ? c.boardArt : c.board }}>
      {showArt && layers.map((f) => (
        <Image key={f} source={f in MOON_ART ? MOON_ART[f] : { uri: `${getProvider(spec.provider).imgHost}/${f}` }} resizeMode="stretch" accessibilityIgnoresInvertColors
          style={{ position: "absolute", ...geo.art, opacity: 0.9 }} />
      ))}
      <Svg width={width} height={geo.height} accessibilityLabel="Board" style={{ position: "absolute", left: 0, top: 0 }}>
        {!bare && !showArt && placements.map((p) => (
          <Circle key={p.id} cx={geo.px(p.x)} cy={geo.py(p.y)} r={Math.max(1.6, geo.ring * 0.16)} fill="#2B3438" />
        ))}
        {lit.map(({ p, name }) => {
          const color = highContrast ? roleTokens.highContrast : roleTokens[name].color;
          const cx = geo.px(p.x);
          const cy = geo.py(p.y);
          const path = showShapes ? shapePath(roleTokens[name].shape, cx, cy, geo.ring) : null;
          return (
            <G key={p.id}>
              {showArt ? <Circle cx={cx} cy={cy} r={geo.ring * 1.25} fill="#000" opacity={0.55} /> : null}
              {bare ? null : <Circle cx={cx} cy={cy} r={geo.ring * 1.55} fill={color} opacity={0.18} />}
              {/* On the lighter art backing a thin dark edge keeps the coloured ring readable. */}
              {showArt ? (path
                ? <Path d={path} stroke="#000" strokeWidth={stroke + 2.6} opacity={0.5} fill="none" strokeLinejoin="round" />
                : <Circle cx={cx} cy={cy} r={geo.ring} stroke="#000" strokeWidth={stroke + 2.6} opacity={0.5} fill="none" />) : null}
              {path ? (
                <Path d={path} stroke={color} strokeWidth={stroke} fill="none" strokeLinejoin="round" />
              ) : (
                <Circle cx={cx} cy={cy} r={geo.ring} stroke={color} strokeWidth={stroke} fill="none" />
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
  return onPressHole ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Board holes" onPress={handle}>{svg}</Pressable>
  ) : svg;
}
