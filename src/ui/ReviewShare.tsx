import { forwardRef, useRef } from "react";
import { View, useWindowDimensions } from "react-native";
import { bandForV } from "../core/grades";
import type { CardGrade, ReviewCardFacts, YearCardFacts, WeekCardFacts } from "../core/reviewShare";
import { ropedBand } from "../data/ropedGrades";
import type { ViewHandle } from "../state/shareImage";
import { c, font } from "../theme";
import { Button, GradeChip, Sheet } from "./parts";
import { Dot } from "./StreakSheet";
import { Text } from "./Text";
import { useCardActions } from "./useCardActions";

/** The width the card is designed at; everything scales from it. */
const BASE = 360;
const PAD = 20;

const bandOf = (g: CardGrade) => (g.scale === "boulder" ? bandForV(g.grade) : ropedBand(g.grade));

function Figures({ figures, u }: { figures: { value: number; label: string }[]; u: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 14 * u }}>
      {figures.map((f) => (
        <View key={f.label} style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 52 * u, lineHeight: 56 * u, color: c.text }}>{f.value}</Text>
          <Text style={{ fontFamily: font.ui, fontSize: 13 * u, lineHeight: 17 * u, color: c.text2 }}>{f.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Hardest({ hardest, u }: { hardest: CardGrade[]; u: number }) {
  if (!hardest.length) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 * u, flexWrap: "wrap" }}>
      <Text style={{ fontFamily: font.ui, fontSize: 13 * u, color: c.text2 }}>Hardest</Text>
      {hardest.map((g) => <GradeChip key={g.scale} band={bandOf(g)} label={g.label} />)}
    </View>
  );
}

function Week({ f, u }: { f: WeekCardFacts; u: number }) {
  return (
    <View style={{ gap: 16 * u }}>
      <Figures figures={f.figures} u={u} />
      <Hardest hardest={f.hardest} u={u} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {f.dots.map((d, i) => (
          <View key={i} style={{ alignItems: "center", gap: 6 * u }}>
            <Text style={{ fontFamily: font.display, fontSize: 14 * u, color: c.muted }}>{d.letter}</Text>
            <Dot mark={d.mark} size={20 * u} />
          </View>
        ))}
      </View>
      {f.streak ? <Text style={{ fontFamily: font.uiSemi, fontSize: 14 * u, color: c.text }}>{`Streak: ${f.streak}`}</Text> : null}
      {f.highlight ? <Text style={{ fontFamily: font.ui, fontSize: 14 * u, lineHeight: 19 * u, color: c.text, fontStyle: "italic" }} numberOfLines={3}>{f.highlight}</Text> : null}
    </View>
  );
}

function Year({ f, u, width }: { f: YearCardFacts; u: number; width: number }) {
  const max = Math.max(1, ...f.pyramid.map((p) => p.count));
  const barW = width - PAD * 2 * u - 120 * u;
  const cell = Math.max(3, Math.floor((width - PAD * 2 * u - 38 * u - 31) / 31));
  return (
    <View style={{ gap: 14 * u }}>
      <Figures figures={f.figures} u={u} />
      <Hardest hardest={f.hardest} u={u} />
      {f.pyramid.length ? (
        <View style={{ gap: 4 * u }}>
          {f.pyramid.map((p) => (
            <View key={`${p.scale}${p.grade}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 * u }}>
              <Text style={{ width: 48 * u, fontFamily: font.display, fontSize: 15 * u, color: bandOf(p).bar }}>{p.label}</Text>
              <View style={{ height: 11 * u, borderRadius: 3 * u, width: Math.max(5 * u, (barW * p.count) / max), backgroundColor: bandOf(p).bar }} />
              <Text style={{ fontFamily: font.ui, fontSize: 12 * u, color: c.text2 }}>{p.count}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 2 * u }}>
        {f.months.map((m) => (
          <View key={m.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 * u }}>
            <Text style={{ width: 32 * u, fontFamily: font.ui, fontSize: 10 * u, color: c.muted }}>{m.label}</Text>
            <View style={{ flexDirection: "row", gap: 1 }}>
              {Array.from({ length: m.length }, (_, i) => <View key={i} style={{ width: cell, height: 7 * u, borderRadius: 1.5, backgroundColor: m.days.includes(i + 1) ? c.starOn : c.raised }} />)}
            </View>
          </View>
        ))}
      </View>
      {f.longestStreak ? <Text style={{ fontFamily: font.ui, fontSize: 13 * u, color: c.text2 }}>{f.longestStreak}</Text> : null}
      {f.bestWeek ? <Text style={{ fontFamily: font.ui, fontSize: 13 * u, color: c.text2 }}>{f.bestWeek}</Text> : null}
    </View>
  );
}

/** The review image. Drawn on screen in the preview and captured as it stands. Sizes derive from `width`. */
export const ReviewShareCard = forwardRef<ViewHandle, { facts: ReviewCardFacts; width: number }>(function ReviewShareCard({ facts, width }, ref) {
  const u = width / BASE;
  return (
    <View ref={ref} collapsable={false} style={{ width, backgroundColor: c.ground, padding: PAD * u, gap: 18 * u }}>
      <View>
        <Text style={{ fontFamily: font.display, fontSize: 30 * u, lineHeight: 34 * u, color: c.text }} numberOfLines={1} adjustsFontSizeToFit>{facts.title}</Text>
        {facts.kind === "week" ? <Text style={{ fontFamily: font.ui, fontSize: 13 * u, color: c.text2 }}>{facts.range}</Text> : null}
      </View>
      {facts.kind === "week" ? <Week f={facts} u={u} /> : <Year f={facts} u={u} width={width} />}
      <Text style={{ fontFamily: font.wordmark, fontSize: 22 * u, lineHeight: 26 * u, color: c.text2 }}>slackboard</Text>
    </View>
  );
});

/** Previews the review image and offers to save or share it. */
export function ReviewShareSheet({ facts, onClose }: { facts: ReviewCardFacts | null; onClose: () => void }) {
  const { width: screenW } = useWindowDimensions();
  const ref = useRef<ViewHandle>(null);
  const { busy, note, run } = useCardActions(ref);
  // The last facts stay for the sheet's closing animation.
  const kept = useRef<ReviewCardFacts | null>(null);
  if (facts) kept.current = facts;
  const f = facts ?? kept.current;
  const title = f?.kind === "week" ? "Share your week" : "Share your year";
  return (
    <Sheet visible={!!facts} onClose={onClose} title={title}
      footer={
        <View style={{ gap: 8 }}>
          {note ? <Text v="caption" style={{ textAlign: "center" }} aria-live="polite">{note}</Text> : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button variant="secondary" label={busy === "save" ? "Saving" : "Save image"} disabled={!!busy} style={{ flex: 1 }} onPress={() => void (f && run("save", f.kind, f.fileKey, title))} />
            <Button label={busy === "share" ? "Opening" : "Share"} disabled={!!busy} style={{ flex: 1 }} onPress={() => void (f && run("share", f.kind, f.fileKey, title))} />
          </View>
        </View>
      }>
      {f ? <View style={{ alignItems: "center" }}><ReviewShareCard ref={ref} facts={f} width={Math.min(screenW - 40, 420)} /></View> : null}
    </Sheet>
  );
}
