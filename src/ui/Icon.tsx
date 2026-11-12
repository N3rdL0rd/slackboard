import Svg, { Path } from "react-native-svg";
import { c } from "../theme";

const PATHS = {
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 9v4.5l3 1.5M9.5 2.5h5",
  bolt: "M13 3 5.5 13H11l-1 8 7.5-10H12l1-8Z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z",
  climb: "M3 20 L9.5 8 L13 14 L16 9.5 L21 20 Z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM20 20l-4.8-4.8",
  log: "M5 5h14M5 12h14M5 19h9",
  you: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0",
  bell: "M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15L6 17ZM10 21h4",
  gear: "M19.45 10.49 L21.92 10.70 L21.92 13.30 L19.45 13.51 L18.33 16.20 L19.93 18.09 L18.09 19.93 L16.20 18.33 L13.51 19.45 L13.30 21.92 L10.70 21.92 L10.49 19.45 L7.80 18.33 L5.91 19.93 L4.07 18.09 L5.67 16.20 L4.55 13.51 L2.08 13.30 L2.08 10.70 L4.55 10.49 L5.67 7.80 L4.07 5.91 L5.91 4.07 L7.80 5.67 L10.49 4.55 L10.70 2.08 L13.30 2.08 L13.51 4.55 L16.20 5.67 L18.09 4.07 L19.93 5.91 L18.33 7.80Z M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.5 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z",
  share: "M12 15V4M7.5 8.5 12 4l4.5 4.5M5 13v6h14v-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  back: "M15 5l-7 7 7 7",
  chevR: "M9 5l7 7-7 7",
  chevL: "M15 5l-7 7 7 7",
  chevD: "M5 9l7 7 7-7",
  close: "M6 6l12 12M18 6 6 18",
  filter: "M4 6h16M7 12h10M10 18h4",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z",
  mirror: "M12 3v18M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z",
  locate: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3",
  play: "M8 5v14l11-7Z",
  pause: "M9 5v14M15 5v14",
  up: "M12 19V5M5 12l7-7 7 7",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  // A die: the rounded square, and a dot at each pip (a zero-length stroke with round caps).
  dice: "M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  edit: "M4 20l1-4L16 5l3 3L8 19l-4 1Z",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, color = c.text, filled = false, stroke = 2 }: {
  name: IconName; size?: number; color?: string; filled?: boolean; stroke?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : "none"}
      />
    </Svg>
  );
}
