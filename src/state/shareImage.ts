import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { ComponentRef, RefObject } from "react";
import type { View } from "react-native";

/** What a ref to a View holds. */
export type ViewHandle = ComponentRef<typeof View>;
import { captureRef } from "react-native-view-shot";
import { cardFileName, type ShareKind } from "../core/shareCard";

/** Draws the card on screen into a PNG in the app's cache and returns its file URI. */
export async function captureCard(ref: RefObject<ViewHandle | null>, kind: ShareKind, climbName: string): Promise<string> {
  if (!ref.current) throw new Error("The image isn't on screen yet.");
  const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile", fileName: cardFileName(kind, climbName) });
  return uri.startsWith("file://") ? uri : `file://${uri}`;
}

/** Opens the system share sheet for the image. False when this device has no share sheet. */
export async function shareImage(uri: string, title: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title, UTI: "public.png" });
  return true;
}

export type SaveResult = "saved" | "denied" | "failed";

/** Adds the image to the phone's photo library. Asks only for permission to write, never to read the user's photos. */
export async function saveImage(uri: string): Promise<SaveResult> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
    if (!perm.granted) return "denied";
    await MediaLibrary.Asset.create(uri);
    return "saved";
  } catch {
    return "failed";
  }
}
