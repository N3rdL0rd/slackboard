import { forwardRef, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { cardComment, communityLine, isFlash, sendHeadline, shortDate, type ShareFacts } from "../core/shareCard";
import { grades } from "../data/grades";
import { captureCard, saveImage, shareImage, type ViewHandle } from "../state/shareImage";
import { c, font, r, role } from "../theme";
import { BoardView, boardHeight } from "./BoardView";
import { haptic } from "./haptics";
import { Button, ClassicTag, GradeChip, Sheet, Stars } from "./parts";
import { Text } from "./Text";

/** The width the card is designed at; everything scales from it. The card is landscape: info on the left, the board on the right. */
const BASE = 560;
const PAD = 16;
/** The board's largest size on the card, in design units. A tall board is limited by height, a square one by width. */
const BOARD_MAX_W = 250;
const BOARD_MAX_H = 330;

/**
 * The image that gets shared. It is drawn on screen in the preview and captured as it stands, so what the user sees is what they send.
 * Sizes derive from `width`, so the same card works at any preview size.
 */
export const ShareCard = forwardRef<ViewHandle, { facts: ShareFacts; width: number }>(function ShareCard({ facts, width }, ref) {
  const u = width / BASE;
  const d = facts.difficulty;
  const label = d != null ? grades.label(d, facts.gradeDisplay, facts.isRoute) : null;
  const send = facts.kind === "send" ? facts.send : undefined;
  const head = send ? sendHeadline(send.attempts) : null;
  const accent = send && isFlash(send.attempts) ? c.starOn : role.start.color;
  const ratio = Math.max(0.5, boardHeight(facts.spec, 1));
  const boardW = Math.min(BOARD_MAX_W, BOARD_MAX_H / ratio) * u;
  const boardH = boardHeight(facts.spec, boardW);
  const height = Math.max((head ? 340 : 290) * u, boardH + PAD * 2 * u);
  const community = communityLine(facts.stat);
  const comment = send ? cardComment(send.comment, 90) : "";
  const stars = send ? send.stars : facts.stat?.[3] ?? 0;
  return (
    <View ref={ref} collapsable={false} style={{ width, height, backgroundColor: c.ground, flexDirection: "row", padding: PAD * u, gap: 16 * u }}>
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ gap: 10 * u }}>
          {head ? (
            <View>
              <Text style={{ fontFamily: font.display, fontSize: 54 * u, lineHeight: 60 * u, color: accent }} numberOfLines={1} adjustsFontSizeToFit>{head.text}</Text>
              {head.sub ? <Text style={{ fontFamily: font.uiSemi, fontSize: 12 * u, lineHeight: 16 * u, letterSpacing: 1.6 * u, textTransform: "uppercase", color: c.text2 }}>{head.sub}</Text> : null}
            </View>
          ) : null}
          <View style={{ gap: 2 * u }}>
            <Text style={{ fontFamily: font.display, fontSize: (head ? 26 : 32) * u, lineHeight: (head ? 30 : 36) * u, color: c.text }} numberOfLines={2}>{facts.name}</Text>
            <Text style={{ fontFamily: font.ui, fontSize: 13 * u, lineHeight: 17 * u, color: c.text2 }} numberOfLines={1}>Set by {facts.setter} · {facts.angle}°{facts.mirror ? " · mirrored" : ""}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 * u, flexWrap: "wrap" }}>
            {label && d != null ? <GradeChip band={grades.band(d)} label={label.primary} /> : null}
            <View style={{ gap: 4 * u }}>
              {stars > 0 ? <Stars value={stars} size={16 * u} /> : null}
              {facts.classic ? <ClassicTag /> : null}
            </View>
          </View>
          {community ? <Text style={{ fontFamily: font.ui, fontSize: 12 * u, lineHeight: 16 * u, color: c.text2 }}>{community}</Text> : null}
          {comment ? <Text style={{ fontFamily: font.ui, fontSize: 13 * u, lineHeight: 18 * u, color: c.text, fontStyle: "italic" }} numberOfLines={3}>{"\u201C"}{comment}{"\u201D"}</Text> : null}
        </View>
        <View style={{ gap: 2 * u }}>
          <Text style={{ fontFamily: font.wordmark, fontSize: 24 * u, lineHeight: 28 * u, color: c.text2 }}>slackboard</Text>
          <Text style={{ fontFamily: font.ui, fontSize: 11 * u, lineHeight: 15 * u, color: c.muted }} numberOfLines={1}>
            {[facts.boardName, send ? shortDate(send.climbedAt) : ""].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      <View style={{ alignSelf: "center", width: boardW, height: boardH, borderRadius: 10 * u, overflow: "hidden" }}>
        <BoardView spec={facts.spec} placements={facts.placements} roles={facts.roles} images={facts.spec.images} width={boardW} frame={facts.frame}
          mirror={facts.mirror} shapes={facts.shapes} highContrast={facts.highContrast} />
      </View>
    </View>
  );
});

/** Previews the card and offers to save or share it. */
export function ShareSheet({ facts, onClose }: { facts: ShareFacts | null; onClose: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const ref = useRef<ViewHandle>(null);
  const [busy, setBusy] = useState<null | "save" | "share">(null);
  const [note, setNote] = useState("");
  // The last facts stay for the sheet's closing animation.
  const kept = useRef<ShareFacts | null>(null);
  if (facts) kept.current = facts;
  const f = facts ?? kept.current;
  const send = f?.kind === "send";
  const run = async (what: "save" | "share") => {
    if (!f) return;
    setBusy(what);
    setNote("");
    try {
      const uri = await captureCard(ref, f.kind, f.name);
      if (what === "share") {
        const ok = await shareImage(uri, send ? "Share your send" : "Share this climb");
        if (!ok) setNote("This device has no share sheet. Use Save image instead.");
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
  return (
    <Sheet visible={!!facts} onClose={onClose} title={send ? "Share your send" : "Share this climb"}
      footer={
        <View style={{ gap: 8 }}>
          {note ? <Text v="caption" style={{ textAlign: "center" }} aria-live="polite">{note}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button variant="secondary" label={busy === "save" ? "Saving" : "Save image"} disabled={!!busy} style={{ flex: 1 }} onPress={() => void run("save")} />
            <Button label={busy === "share" ? "Opening" : "Share"} disabled={!!busy} style={{ flex: 1 }} onPress={() => void run("share")} />
          </View>
        </View>
      }>
      {f ? <View style={{ alignItems: "center" }}><ShareCard ref={ref} facts={f} width={screenW - 40} /></View> : null}
    </Sheet>
  );
}
