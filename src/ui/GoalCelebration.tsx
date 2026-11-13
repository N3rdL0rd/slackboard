import { useEffect, useState } from "react";
import { View } from "react-native";
import { randomHex } from "../core/api";
import { goalTitle, newGoal, suggestNext } from "../core/goals";
import { useGoalLabels, useGoalsStore } from "../state/goals";
import { useToday } from "../state/today";
import { Confetti } from "./Confetti";
import { haptic } from "./haptics";
import { Button, Sheet } from "./parts";
import { Text } from "./Text";
import { c, font, r } from "../theme";

/**
 * When a goal is reached: confetti once, "Congrats!", the goal, and one sensible follow-up to accept with a tap or leave. It shows once
 * per goal (the queue is in memory), and the follow-up is only ever an offer.
 */
export function GoalCelebration() {
  const goal = useGoalsStore((s) => s.celebrating[0]);
  const today = useToday();
  const labels = useGoalLabels();
  const [confetti, setConfetti] = useState(0);
  const id = goal?.id;
  useEffect(() => { if (id) { haptic.done(); setConfetti((n) => n + 1); } }, [id]);
  if (!goal) return confetti > 0 ? <Confetti key={confetti} onDone={() => setConfetti(0)} /> : null;

  const next = suggestNext(goal, today);
  const nextTitle = next ? goalTitle(next.spec, next.window, labels) : null;
  const close = () => useGoalsStore.getState().celebrated(goal.id);
  const accept = async () => {
    if (next) await useGoalsStore.getState().save(newGoal(randomHex(16), next, "", labels, new Date()));
    close();
  };
  return (
    <>
      {confetti > 0 ? <Confetti key={confetti} onDone={() => setConfetti(0)} /> : null}
      <Sheet visible onClose={close} title="Goal reached"
        footer={next && nextTitle ? (
          <View style={{ gap: 8 }}>
            <Button label="Set this goal" onPress={() => void accept()} />
            <Button variant="secondary" label="Not now" onPress={close} />
          </View>
        ) : <Button label="Nice" onPress={close} />}>
        <View style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.display, fontSize: 30, lineHeight: 34, color: c.starOn }}>Congrats!</Text>
          <Text v="climbName">{goal.title}</Text>
          {next && nextTitle ? (
            <View style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 2 }}>
              <Text v="secondary">Next goal?</Text>
              <Text v="bodyStrong">{nextTitle}</Text>
            </View>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
