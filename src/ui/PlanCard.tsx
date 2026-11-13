import { blockOver, nextBlockProposal, retestDue, retestReport } from "../core/adapt";
import { useAdapted, usePlanner } from "../state/planner";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { addDays, weekStartDay, type Day } from "../core/days";
import { testInfo } from "../data/protocols";
import { alternativesFor, nextSession, sessionsInWeek, todaysSession, weekdayName, type Plan, type PlanSession, type Profile } from "../core/planner";
import { setText } from "../core/training";
import { EXERCISES, exerciseById } from "../data/exercises";
import { planActions, useCurrentPlan } from "../state/planner";
import { useStore } from "../state/store";
import { useActivities, useToday } from "../state/today";
import { Icon } from "./Icon";
import { Button, Chip, LinkButton, SectionLabel, Sheet, Tap } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLabel = (d: Day) => `${SHORT[(new Date(`${d}T12:00:00`).getDay() + 6) % 7]} ${Number(d.slice(8))}`;

/** A session's main lines: each exercise with its work sets, warm-up left out. */
function lines(s: PlanSession, units: ReturnType<typeof useStore.getState>["settings"]["units"]): string[] {
  return s.items.filter((i) => i.exerciseId !== "climbing-warm-up").map((i) => {
    const work = i.sets.filter((t, k) => !(t.onS === 5 && t.restS === 60 && k < i.sets.length - 1));
    const t = work[work.length - 1] ?? i.sets[0];
    const detail = setText({ reps: t.reps, timeS: t.onS, loadKg: t.loadKg, edgeMm: t.edgeMm, grip: t.grip }, units);
    return `${exerciseById(i.exerciseId)?.name ?? "Exercise"}  ${work.length} \u00D7 ${detail || "set"}`;
  });
}

/** Today's session with Start, Swap, Skip and Why. On a rest day or a done day it says that, and what is next. */
export function PlanTodayCard({ plan, profile, today }: { plan: Plan; profile: Profile; today: Day }) {
  const router = useRouter();
  const units = useStore((s) => s.settings.units);
  const actions = planActions();
  const [sheet, setSheet] = useState<null | "swap" | "why">(null);
  const adapted = useAdapted(todaysSession(plan, today), plan.block.kind);
  const session = adapted?.session ?? null;
  const doneToday = plan.sessions.find((s) => s.day === today && s.status === "done");
  const next = nextSession(plan, addDays(today, 1));

  if (!session) {
    return (
      <View style={{ padding: 16, gap: 6, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
        <Text v="section">{doneToday ? "Done today" : "Rest day"}</Text>
        <Text v="body">{doneToday ? `${doneToday.title} is logged. Nicely done.` : "Nothing planned for today. Rest is part of the plan."}</Text>
        {next ? <Text v="secondary">{`Next: ${next.title}, ${weekdayName(next.day)}`}</Text> : <Text v="secondary">That is the end of this block.</Text>}
      </View>
    );
  }
  const main = session.items.find((i) => i.exerciseId !== "climbing-warm-up");
  const alts = main ? alternativesFor(main.exerciseId, profile.equipment, EXERCISES) : [];
  return (
    <>
      <View style={{ padding: 16, gap: 8, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.lineStrong }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text v="section" style={{ flex: 1 }}>{`Today: ${session.title}`}</Text>
          <Text v="secondary">{`about ${session.minutes} min`}</Text>
        </View>
        {lines(session, units).slice(0, 4).map((l) => <Text key={l} v="body">{l}</Text>)}
        {adapted?.reasons.map((x) => <Text key={x} v="caption">{x}</Text>)}
        {session.light && !adapted?.reasons.length ? <Text v="caption">A light session.</Text> : null}
        <Button label="Start" onPress={() => router.push({ pathname: "/session", params: { plan: session.id } })} />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <LinkButton label="Swap" onPress={() => setSheet("swap")} />
          <LinkButton label="Skip" onPress={() => void actions.skip(session.id)} />
          <LinkButton label="Why?" onPress={() => setSheet("why")} />
        </View>
      </View>
      <Sheet visible={sheet === "swap"} onClose={() => setSheet(null)} title="Swap">
        <View style={{ gap: 8 }}>
          {main && alts.length ? <Text v="secondary">{`Instead of ${exerciseById(main.exerciseId)?.name}, something that trains the same thing:`}</Text> : <Text v="secondary">There is nothing else here you have the equipment for.</Text>}
          {alts.map((e) => <Button key={e.id} variant="secondary" label={e.name} onPress={() => { void actions.swap(session.id, main!.exerciseId, e.id); setSheet(null); }} />)}
        </View>
      </Sheet>
      <Sheet visible={sheet === "why"} onClose={() => setSheet(null)} title="Why this session?">
        <View style={{ gap: 8 }}>
          {session.why.map((w) => <Text key={w} v="body">{w}</Text>)}
          <SectionLabel>The block</SectionLabel>
          {plan.block.reasons.map((w) => <Text key={w} v="secondary">{w}</Text>)}
        </View>
      </Sheet>
    </>
  );
}

/** The compact plan row for the Climb tab, reading the current plan itself. Nothing when there is no plan or no session today. */
export function PlanHeader() {
  const plan = useCurrentPlan();
  const today = useToday();
  return plan && plan.status === "active" ? <PlanCompact plan={plan} today={today} /> : null;
}

/** Today's session as one slim row for the Climb tab: what it is, and Start. Nothing when there is no session today. */
export function PlanCompact({ plan, today }: { plan: Plan; today: Day }) {
  const router = useRouter();
  const session = todaysSession(plan, today);
  if (!session) return null;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Today's plan: ${session.title}, about ${session.minutes} minutes. Open`} onPress={() => router.push("/train")}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginTop: 6, paddingVertical: 8, paddingHorizontal: 12, minHeight: 48, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Icon name="muscle" size={20} color={c.text} />
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong" style={{ fontSize: 14 }} numberOfLines={1}>{`Today: ${session.title}`}</Text>
        <Text v="caption">{`About ${session.minutes} min`}</Text>
      </View>
      <Button label="Start" onPress={() => router.push({ pathname: "/session", params: { plan: session.id } })} />
    </Tap>
  );
}

/** This week, one row a day: your plan, your own climbing, or rest. Tapping a planned day opens its options. */
export function WeekStrip({ plan, profile, today }: { plan: Plan; profile: Profile; today: Day }) {
  const activities = useActivities();
  const [open, setOpen] = useState<PlanSession | null>(null);
  const start = weekStartDay(today);
  const week = sessionsInWeek(plan, start);
  const climbed = useMemo(() => new Set(activities.filter((a) => a.kind !== "training" && a.day >= start && a.day <= addDays(start, 6)).map((a) => a.day)), [activities, start]);
  return (
    <>
      <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
        {Array.from({ length: 7 }, (_, i) => {
          const day = addDays(start, i);
          const s = week.find((x) => x.day === day);
          const isToday = day === today;
          const own = climbed.has(day) || (day >= today && profile.climbDays.includes(i));
          const label = s ? `${s.title}${s.light ? " (light)" : ""}${s.movedFrom ? `, moved from ${weekdayName(s.movedFrom)}` : ""}` : own ? "Your climbing" : "Rest";
          const status = s?.status === "done" ? "Done" : s?.status === "skipped" ? "Skipped" : isToday ? "Today" : "";
          return (
            <Tap key={day} accessibilityRole="button" accessibilityLabel={`${weekdayName(day)}. ${label}. ${status}`} disabled={!s || s.status !== "planned"} onPress={() => s && setOpen(s)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider, backgroundColor: isToday ? c.raised : "transparent" }}>
              <Text v="bodyStrong" style={{ width: 44 }}>{SHORT[i]}</Text>
              <Text v={s ? "body" : "secondary"} style={{ flex: 1 }} numberOfLines={1}>{label}</Text>
              <Text v="caption">{status}</Text>
              {s && s.status === "planned" ? <Icon name="chevR" size={16} color={c.muted} /> : null}
            </Tap>
          );
        })}
      </View>
      {open ? <PlanDaySheet plan={plan} session={open} today={today} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** A planned day's options: move it (with the rule that applies when it can't go), skip it, or make it lighter. No dragging. */
function PlanDaySheet({ plan, session, today, onClose }: { plan: Plan; session: PlanSession; today: Day; onClose: () => void }) {
  const actions = planActions();
  const [mode, setMode] = useState<"menu" | "move">("menu");
  const [problem, setProblem] = useState<{ reason: string; nearest: Day | null } | null>(null);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i)).filter((d) => d !== session.day);
  const go = async (day: Day) => {
    const r = await actions.move(session.id, day, today);
    if (r.ok) onClose(); else setProblem({ reason: r.reason, nearest: r.nearest });
  };
  return (
    <Sheet visible onClose={onClose} title={`${weekdayName(session.day)}: ${session.title}`}>
      {mode === "menu" ? (
        <View style={{ gap: 8 }}>
          <Button variant="secondary" label="Move to another day" onPress={() => setMode("move")} />
          <Button variant="secondary" label="Make it lighter" onPress={() => { void actions.lighten(session.id); onClose(); }} />
          <Button variant="secondary" label="Skip" onPress={() => { void actions.skip(session.id); onClose(); }} />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text v="secondary">Pick a day. Finger sessions need 48 hours between them.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {days.map((d) => <Chip key={d} label={dayLabel(d)} onPress={() => void go(d)} />)}
          </View>
          {problem ? (
            <View style={{ gap: 6 }}>
              <Text v="bodyStrong" style={{ color: c.danger }}>{problem.reason}</Text>
              {problem.nearest ? <Button label={`Use ${dayLabel(problem.nearest)} instead`} onPress={() => void go(problem.nearest!)} /> : null}
            </View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

/** Retest week and the end of a block: what to retest, what changed, and what the next block would be. Shown only when it applies. */
export function BlockCard({ plan, today }: { plan: Plan; today: Day }) {
  const router = useRouter();
  const { tests } = usePlanner();
  const over = blockOver(plan, today);
  if (!over && !retestDue(plan, today)) return null;
  const report = retestReport(plan, tests);
  const proposal = over ? nextBlockProposal(plan, report) : null;
  return (
    <View style={{ padding: 16, gap: 8, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.lineStrong }}>
      <Text v="section">{over ? "This block is finished" : "Retest week"}</Text>
      {report.map((x) => (
        <Text key={x.test} v="body">{`${testInfo(x.test).label}: ${x.before} to ${x.after}${x.percent === null ? "" : ` (${x.percent >= 0 ? "+" : ""}${Math.round(x.percent)}%)`}`}</Text>
      ))}
      {!report.length ? <Text v="secondary">Take your tests again so the next block starts from where you are now.</Text> : null}
      {proposal?.lines.map((l) => <Text key={l} v="secondary">{l}</Text>)}
      <Button label={report.length ? "Retest again" : "Retest"} variant={over ? "secondary" : "primary"} onPress={() => router.push("/plan-test")} />
      {over ? <Button label="Plan the next block" onPress={() => router.push("/plan-setup")} /> : null}
    </View>
  );
}
