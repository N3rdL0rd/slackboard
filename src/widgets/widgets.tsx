import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { WidgetView } from "../core/widgetData";

/** The app's colours as literal hex values (see tokens.json); widgets can't use the app theme, and the library wants literal types. */
const COLOR = { ground: "#121618", card: "#1A2023", text: "#EDEBE4", secondary: "#C5CBC9", muted: "#A3ABA9", green: "#4DD08A", line: "#2F383D" } as const;
const DISPLAY = "BarlowCondensed_700Bold";
const BODY = "Barlow_400Regular";
const LINK = (uri: string) => ({ clickAction: "OPEN_URI" as const, clickActionData: { uri } });

const Frame = ({ children, uri, label }: { children: unknown; uri?: string; label: string }) => (
  <FlexWidget
    accessibilityLabel={label}
    style={{ width: "match_parent", height: "match_parent", backgroundColor: COLOR.card, borderRadius: 20, padding: 14, flexDirection: "column", justifyContent: "center" }}
    {...(uri ? LINK(uri) : { clickAction: "OPEN_APP" })}
  >
    {children}
  </FlexWidget>
);

const Label = ({ text }: { text: string }) => <TextWidget text={text.toUpperCase()} style={{ fontSize: 11, fontFamily: DISPLAY, letterSpacing: 1.2, color: COLOR.muted }} />;

/** The streak as a number and one quiet line. Never negative: a break shows the best streak instead. */
export function StreakWidget({ v }: { v: WidgetView }) {
  const n = v.streak.current;
  return (
    <Frame label={`Streak: ${n} ${n === 1 ? "day" : "days"}. ${v.streak.text}`}>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
        <TextWidget text={String(n)} style={{ fontSize: 40, fontFamily: DISPLAY, color: COLOR.text }} />
        <TextWidget text={n === 1 ? " day" : " days"} style={{ fontSize: 16, fontFamily: DISPLAY, color: COLOR.secondary }} />
      </FlexWidget>
      <TextWidget text={v.streak.text} maxLines={2} style={{ fontSize: 12, fontFamily: BODY, color: COLOR.secondary }} />
    </Frame>
  );
}

/** Today's planned session with a Start button that opens it, or the one honest line for a rest day. */
export function TodayWidget({ v }: { v: WidgetView }) {
  const t = v.today;
  const line = t.kind === "session" ? t.title : t.kind === "done" ? `${t.title} is logged` : t.kind === "rest" ? "Rest day" : "Open Train to build a plan";
  return (
    <Frame label={`Today. ${line}`} uri={t.kind === "none" ? "slackboard://train" : undefined}>
      <Label text="Today" />
      <TextWidget text={line} maxLines={2} style={{ fontSize: 22, fontFamily: DISPLAY, color: COLOR.text }} />
      {t.kind === "session" ? <TextWidget text={`About ${t.minutes} min`} style={{ fontSize: 12, fontFamily: BODY, color: COLOR.secondary }} /> : null}
      {t.kind === "session" && t.sessionId ? (
        <FlexWidget {...LINK(`slackboard://session?plan=${encodeURIComponent(t.sessionId)}`)} accessibilityLabel="Start today's session"
          style={{ marginTop: 10, height: 36, borderRadius: 18, backgroundColor: COLOR.text, alignItems: "center", justifyContent: "center", width: "match_parent" }}>
          <TextWidget text="START" style={{ fontSize: 16, fontFamily: DISPLAY, letterSpacing: 1, color: COLOR.ground }} />
        </FlexWidget>
      ) : null}
    </Frame>
  );
}

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** This week: seven days marked climbed, rest, today or ahead, and the number of sends. */
export function WeekWidget({ v }: { v: WidgetView }) {
  const sends = v.week.sends;
  return (
    <Frame label={`This week: ${sends} ${sends === 1 ? "send" : "sends"}. ${v.streak.label}`}>
      <FlexWidget style={{ flexDirection: "row", width: "match_parent" }}>
        {v.week.dots.map((d, i) => (
          <FlexWidget key={d.day} style={{ flex: 1, alignItems: "center" }}>
            <TextWidget text={LETTERS[i]} style={{ fontSize: 12, fontFamily: DISPLAY, color: COLOR.muted }} />
            <FlexWidget style={{ width: 18, height: 18, borderRadius: 9, marginTop: 4, backgroundColor: d.mark === "climbed" ? COLOR.green : COLOR.ground, borderWidth: d.mark === "climbed" && d.day !== v.week.today ? 0 : 2, borderColor: d.day === v.week.today ? COLOR.text : d.mark === "future" ? COLOR.line : COLOR.muted }} />
          </FlexWidget>
        ))}
      </FlexWidget>
      <TextWidget text={`${sends} ${sends === 1 ? "send" : "sends"} this week`} style={{ marginTop: 10, fontSize: 18, fontFamily: DISPLAY, color: COLOR.text }} />
      {v.streak.label ? <TextWidget text={v.streak.label} style={{ fontSize: 12, fontFamily: BODY, color: COLOR.secondary }} /> : null}
    </Frame>
  );
}

const Button = ({ label, uri }: { label: string; uri: string }) => (
  <FlexWidget {...LINK(uri)} accessibilityLabel={label} style={{ flex: 1, height: 40, marginHorizontal: 3, borderRadius: 20, backgroundColor: COLOR.ground, borderWidth: 1, borderColor: COLOR.line, alignItems: "center", justifyContent: "center" }}>
    <TextWidget text={label.toUpperCase()} style={{ fontSize: 14, fontFamily: DISPLAY, letterSpacing: 0.8, color: COLOR.text }} />
  </FlexWidget>
);

/** Three buttons straight to the logging screens. */
export function QuickLogWidget() {
  return (
    <Frame label="Quick log">
      <FlexWidget style={{ flexDirection: "row", width: "match_parent" }}>
        <Button label="Gym" uri="slackboard://outside" />
        <Button label="Roped" uri="slackboard://roped" />
        <Button label="Train" uri="slackboard://train" />
      </FlexWidget>
    </Frame>
  );
}

/** The goal closest to done, with a progress bar. */
export function GoalWidget({ v }: { v: WidgetView }) {
  const g = v.goal;
  const pct = g ? Math.round(g.progress * 100) : 0;
  return (
    <Frame label={g ? `Goal: ${g.title}. ${g.summary}` : "No goal set"} uri={g ? "slackboard://goals" : "slackboard://goal-new"}>
      <Label text="Goal" />
      <TextWidget text={g ? g.title : "Set a goal"} maxLines={1} style={{ fontSize: 20, fontFamily: DISPLAY, color: COLOR.text }} />
      {g ? (
        <>
          <FlexWidget style={{ flexDirection: "row", width: "match_parent", height: 8, borderRadius: 4, marginTop: 8, backgroundColor: COLOR.ground, overflow: "hidden" }}>
            <FlexWidget style={{ flex: Math.max(pct, 1), height: "match_parent", backgroundColor: COLOR.green }} />
            <FlexWidget style={{ flex: Math.max(100 - pct, 1), height: "match_parent" }} />
          </FlexWidget>
          <TextWidget text={g.summary} maxLines={1} style={{ marginTop: 6, fontSize: 12, fontFamily: BODY, color: COLOR.secondary }} />
        </>
      ) : null}
    </Frame>
  );
}
