import { describe, expect, it } from "vitest";
import { altStoreSource, privacyFromAppJson } from "./altstore";

const base = { version: "0.1.0", bundleId: "app.slackboard.client", site: "https://example.github.io/slackboard", privacy: { NSBluetoothAlwaysUsageDescription: "Bluetooth." } };

describe("AltStore source", () => {
  it("points the newest version at the .ipa on the site, with the build number AltStore compares", () => {
    const s = altStoreSource({ ...base, build: { number: 42, date: "2026-11-12T07:31:05Z", size: 12345 } }) as any;
    expect(s.sourceURL).toBe("https://example.github.io/slackboard/altstore.json");
    expect(s.apps[0].bundleIdentifier).toBe("app.slackboard.client");
    expect(s.apps[0].versions).toEqual([expect.objectContaining({ version: "0.1.0", buildVersion: "42", date: "2026-11-12", size: 12345, downloadURL: "https://example.github.io/slackboard/Slackboard.ipa" })]);
    expect(s.apps[0].appPermissions.privacy).toEqual(base.privacy);
  });

  it("lists no versions until a build exists, so AltStore never offers a missing file", () => {
    expect((altStoreSource({ ...base, build: null }) as any).apps[0].versions).toEqual([]);
  });
});

describe("permissions from app.json", () => {
  it("maps plugin options onto Info.plist usage keys and ignores missing or disabled ones", () => {
    const privacy = privacyFromAppJson({
      plugins: [
        "expo-router",
        ["react-native-ble-plx", { bluetoothAlwaysPermission: "Find the board." }],
        ["expo-image-picker", { photosPermission: "Pick a photo.", cameraPermission: "Take a photo." }],
        ["expo-media-library", { savePhotosPermission: "Save images.", photosPermission: false }],
      ],
    });
    expect(privacy).toEqual({
      NSBluetoothAlwaysUsageDescription: "Find the board.",
      NSPhotoLibraryUsageDescription: "Pick a photo.",
      NSCameraUsageDescription: "Take a photo.",
      NSPhotoLibraryAddUsageDescription: "Save images.",
    });
  });
});
