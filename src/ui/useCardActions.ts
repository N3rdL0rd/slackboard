import { useState, type RefObject } from "react";
import type { ShareKind } from "../core/shareCard";
import { captureCard, saveImage, shareImage, type ViewHandle } from "../state/shareImage";
import { haptic } from "./haptics";

/** Saving or sharing the image a card draws, with the one note to show afterwards. Used by every share sheet. */
export function useCardActions(ref: RefObject<ViewHandle | null>) {
  const [busy, setBusy] = useState<null | "save" | "share">(null);
  const [note, setNote] = useState("");
  const run = async (what: "save" | "share", kind: ShareKind, name: string, shareTitle: string) => {
    setBusy(what);
    setNote("");
    try {
      const uri = await captureCard(ref, kind, name);
      if (what === "share") {
        if (!(await shareImage(uri, shareTitle))) setNote("This device has no share sheet. Use Save image instead.");
      } else {
        const res = await saveImage(uri);
        if (res === "saved") { haptic.success(); setNote("Saved to your photos."); }
        else setNote(res === "denied" ? "Slackboard needs permission to save photos. You can allow it in the phone's settings." : "Couldn't save the image.");
      }
    } catch {
      setNote("Couldn't make the image. Try again.");
    }
    setBusy(null);
  };
  return { busy, note, run };
}
