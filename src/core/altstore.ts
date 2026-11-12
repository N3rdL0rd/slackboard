/**
 * The AltStore source for the iOS nightly: a JSON file that tells AltStore (and SideStore) what Slackboard is and where the latest
 * unsigned .ipa is. AltStore signs it with the installer's own Apple ID. Pure, so it can be tested; scripts/make-altstore.ts feeds it.
 */

export interface IosBuild {
  /** The workflow run number, which is also the app's build number (see ios.yml). */
  number: number;
  /** When the build ran, ISO 8601. */
  date: string;
  /** Size of the .ipa in bytes. */
  size: number;
}

export interface AltStoreInput {
  /** The marketing version from app.json. */
  version: string;
  bundleId: string;
  /** The site the source and the .ipa are served from, without a trailing slash. */
  site: string;
  /** Info.plist usage descriptions, shown by AltStore as the app's permissions. */
  privacy: Record<string, string>;
  build: IosBuild | null;
}

const MIN_IOS = "16.0";

export function altStoreSource(i: AltStoreInput): Record<string, unknown> {
  const version = i.build
    ? [{
        version: i.version,
        buildVersion: String(i.build.number),
        date: i.build.date.slice(0, 10),
        localizedDescription: "A nightly build of the latest code. It may be unstable.",
        downloadURL: `${i.site}/Slackboard.ipa`,
        size: i.build.size,
        minOSVersion: MIN_IOS,
      }]
    : [];
  return {
    name: "Slackboard",
    identifier: "app.slackboard.source",
    sourceURL: `${i.site}/altstore.json`,
    subtitle: "Open-source climbing logbook",
    description: "An unofficial, open-source logbook and companion app for Tension, Decoy, Grasshopper and MoonBoard climbing boards.",
    iconURL: `${i.site}/assets/app-icon.png`,
    website: `${i.site}/`,
    tintColor: "E8C766",
    apps: [{
      name: "Slackboard",
      bundleIdentifier: i.bundleId,
      developerName: "Slackboard contributors",
      subtitle: "One logbook for every climbing board",
      localizedDescription: "One logbook for Tension, Decoy, Grasshopper and MoonBoard. Log your sends once and see your stats across every board you climb on. Works offline, with no ads and no tracking. Not affiliated with any board maker.",
      iconURL: `${i.site}/assets/app-icon.png`,
      tintColor: "E8C766",
      screenshotURLs: [],
      versions: version,
      appPermissions: { entitlements: [], privacy: i.privacy },
    }],
    news: [],
  };
}

/** Info.plist usage descriptions, read from the Expo plugin options in app.json. */
export function privacyFromAppJson(expo: { plugins?: unknown[] }): Record<string, string> {
  const opts = (name: string): Record<string, unknown> => {
    const hit = (expo.plugins ?? []).find((p) => Array.isArray(p) && p[0] === name) as [string, Record<string, unknown>] | undefined;
    return hit?.[1] ?? {};
  };
  const pick: [string, string, string][] = [
    ["react-native-ble-plx", "bluetoothAlwaysPermission", "NSBluetoothAlwaysUsageDescription"],
    ["expo-location", "locationWhenInUsePermission", "NSLocationWhenInUseUsageDescription"],
    ["expo-image-picker", "photosPermission", "NSPhotoLibraryUsageDescription"],
    ["expo-image-picker", "cameraPermission", "NSCameraUsageDescription"],
    ["expo-media-library", "savePhotosPermission", "NSPhotoLibraryAddUsageDescription"],
  ];
  const out: Record<string, string> = {};
  for (const [plugin, option, key] of pick) {
    const v = opts(plugin)[option];
    if (typeof v === "string" && v) out[key] = v;
  }
  return out;
}
