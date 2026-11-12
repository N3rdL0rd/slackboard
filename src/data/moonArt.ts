/**
 * Hold art for MoonBoard setups, bundled with the app (assets/moonboard/*.webp, built by scripts/make-moon-assets.py). A layer's
 * name in the database is `bundled:moonboard/<setup>`; Metro needs the `require` paths spelled out, so they are listed here.
 */
export const MOON_ART: Record<string, number> = {
  "bundled:moonboard/2016": require("../../assets/moonboard/2016.webp"),
  "bundled:moonboard/2017": require("../../assets/moonboard/2017.webp"),
  "bundled:moonboard/2019": require("../../assets/moonboard/2019.webp"),
  "bundled:moonboard/2024": require("../../assets/moonboard/2024.webp"),
  "bundled:moonboard/mini2020": require("../../assets/moonboard/mini2020.webp"),
  "bundled:moonboard/mini2025": require("../../assets/moonboard/mini2025.webp"),
};
