import tokens from "./tokens.json";

export const c = {
  ground: tokens.color.surface.ground,
  card: tokens.color.surface.card,
  raised: tokens.color.surface.raised,
  board: tokens.color.surface.board,
  /** Backing for hold art: lighter than the app, so black holds (a third of the 2016 MoonBoard) do not vanish into it. */
  boardArt: tokens.color.surface.boardArt,
  scrim: tokens.color.surface.scrim,
  line: tokens.color.line.default,
  lineStrong: tokens.color.line.strong,
  divider: tokens.color.line.divider,
  dim: tokens.color.line.dim,
  text: tokens.color.text.primary,
  text2: tokens.color.text.secondary,
  muted: tokens.color.text.muted,
  caption: tokens.color.text.caption,
  placeholder: tokens.color.text.placeholder,
  btn: tokens.color.action.primaryFill,
  btnText: tokens.color.action.primaryText,
  btnOff: tokens.color.action.disabledFill,
  btnOffText: tokens.color.action.disabledText,
  danger: tokens.color.action.danger,
  starOn: tokens.color.rating.starOn,
  starOff: tokens.color.rating.starOff,
  classicBorder: tokens.color.rating.classicBorder,
  classicText: tokens.color.rating.classicText,
  ledOff: tokens.color.ledStatus.disconnected,
};

export type RoleName = "start" | "middle" | "finish" | "foot";
export const role = tokens.color.holdRole as Record<RoleName | "highContrast", any>;

export const r = tokens.radius;
export const size = tokens.size;

export const font = {
  display: "BarlowCondensed_700Bold",
  displaySemi: "BarlowCondensed_600SemiBold",
  ui: "Barlow_400Regular",
  uiMedium: "Barlow_500Medium",
  uiSemi: "Barlow_600SemiBold",
  wordmark: "CaveatBrush_400Regular",
} as const;
