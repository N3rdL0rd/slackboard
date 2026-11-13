/**
 * The exercise library. Data, not code, so an entry can be corrected as advice improves. Ids are stable strings: a saved training entry
 * keeps its exercise id, so never reuse or rename one. The numbers are starting points for a first session, not prescriptions; the
 * how-to and safety text is general guidance and always says to stop when something hurts.
 */

export type Category = "finger" | "endurance" | "pulling" | "power" | "core" | "antagonist" | "mobility";

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "finger", label: "Finger strength" },
  { value: "endurance", label: "Finger endurance" },
  { value: "pulling", label: "Pulling" },
  { value: "power", label: "Power" },
  { value: "core", label: "Core" },
  { value: "antagonist", label: "Antagonist and shoulder" },
  { value: "mobility", label: "Mobility and warm-up" },
];

export type Grip = "halfCrimp" | "openHand" | "fullCrimp" | "threeFinger" | "pinch" | "none";

export const GRIP_LABEL: Record<Grip, string> = {
  halfCrimp: "Half crimp",
  openHand: "Open hand",
  fullCrimp: "Full crimp",
  threeFinger: "Three-finger drag",
  pinch: "Pinch",
  none: "No grip",
};

/** What a set of this exercise records. Reps and time are per set; `onS` is the hang or work time of one rep. */
export type Field = "reps" | "loadKg" | "timeS" | "edgeMm" | "grip";

/** A first-session set, copied to every set of the exercise until the user changes it. */
export interface Template {
  sets: number;
  /** Reps per set. Null for a single timed hold or a count-less exercise. */
  reps: number | null;
  /** Work seconds of one rep, for timed exercises. Null for exercises counted in reps. */
  onS: number | null;
  /** Rest between the reps of a set. Null when a set is a single hold. */
  offS: number | null;
  /** Rest between sets. */
  restS: number;
  loadKg: number | null;
  edgeMm: number | null;
  grip: Grip | null;
}

export type Equipment = "hangboard" | "weights" | "pullupBar" | "campus";

export const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "hangboard", label: "Hangboard" },
  { value: "pullupBar", label: "Pull-up bar" },
  { value: "weights", label: "Weights or bands" },
  { value: "campus", label: "Campus board" },
];

export interface Exercise {
  id: string;
  name: string;
  category: Category;
  equipment: string;
  /** What a person needs to have to do it. The planner only uses exercises whose requirements the user has. */
  requires: Equipment[];
  fields: Field[];
  howTo: string;
  safety: string;
  /** Finger-intense work: it counts toward the rest nudge, and sharp finger pain holds it off. */
  fingerIntense: boolean;
  level: "beginner" | "intermediate" | "advanced";
  template: Template;
}

const FINGER_SAFETY = "Warm up first. Stop at once if a finger, pulley or tendon gives a sharp pain; an ache in the muscles is not the same thing. Take more rest than you think you need between sessions.";
const GENERAL_SAFETY = "Keep the movement controlled and stop a set when your form goes. Pain that is sharp or in a joint is a reason to stop, not to push through.";

const timed = (sets: number, onS: number, restS: number, edgeMm: number | null, grip: Grip | null, loadKg: number | null = null): Template => ({
  sets, reps: null, onS, offS: null, restS, loadKg, edgeMm, grip,
});
const counted = (sets: number, reps: number, restS: number, loadKg: number | null = null): Template => ({
  sets, reps, onS: null, offS: null, restS, loadKg, edgeMm: null, grip: null,
});

export const EXERCISES: Exercise[] = [
  {
    id: "max-hang", name: "Max hangs", category: "finger", equipment: "Hangboard", requires: ["hangboard"], fields: ["timeS", "loadKg", "edgeMm", "grip"], fingerIntense: true, level: "intermediate",
    howTo: "Hang from a fixed edge for 10 seconds with the weight (added, or taken off by a pulley) that makes the last second hard but clean. Rest about three minutes between hangs.",
    safety: FINGER_SAFETY, template: timed(5, 10, 180, 20, "halfCrimp"),
  },
  {
    id: "min-edge-hang", name: "Minimum-edge hangs", category: "finger", equipment: "Hangboard", requires: ["hangboard"], fields: ["timeS", "edgeMm", "grip"], fingerIntense: true, level: "intermediate",
    howTo: "Hang bodyweight only, and make the edge smaller over the weeks instead of adding weight. Use the smallest edge you can hold for the full 10 seconds.",
    safety: FINGER_SAFETY, template: timed(5, 10, 180, 18, "halfCrimp"),
  },
  {
    id: "lock-off-progression", name: "One-arm lock-off progression", category: "finger", equipment: "Pull-up bar or hangboard", requires: ["pullupBar"], fields: ["timeS", "loadKg"], fingerIntense: true, level: "advanced",
    howTo: "Pull up with both arms, then take one hand away and hold the lock-off for a few seconds. Use a pulley or foot support to make it easier, and lower it as you get stronger.",
    safety: FINGER_SAFETY, template: timed(4, 5, 150, null, "halfCrimp"),
  },
  {
    id: "repeaters", name: "Repeaters (7 on, 3 off)", category: "endurance", equipment: "Hangboard", requires: ["hangboard"], fields: ["reps", "timeS", "edgeMm", "grip", "loadKg"], fingerIntense: true, level: "beginner",
    howTo: "Hang for 7 seconds, rest for 3, and repeat six times: that is one set. Rest about three minutes between sets. Pick a weight and edge you can finish all six reps on.",
    safety: FINGER_SAFETY, template: { sets: 3, reps: 6, onS: 7, offS: 3, restS: 180, loadKg: null, edgeMm: 20, grip: "halfCrimp" },
  },
  {
    id: "intermittent-hang", name: "Intermittent hangs (10 on, 5 off)", category: "endurance", equipment: "Hangboard", requires: ["hangboard"], fields: ["reps", "timeS", "edgeMm", "grip", "loadKg"], fingerIntense: true, level: "intermediate",
    howTo: "Hang for 10 seconds and rest for 5, for several reps in a row. It builds the stamina to stay on small holds through a long problem.",
    safety: FINGER_SAFETY, template: { sets: 3, reps: 5, onS: 10, offS: 5, restS: 180, loadKg: null, edgeMm: 20, grip: "halfCrimp" },
  },
  {
    id: "density-hang", name: "Density hangs", category: "endurance", equipment: "Hangboard", requires: ["hangboard"], fields: ["timeS", "edgeMm", "grip"], fingerIntense: true, level: "intermediate",
    howTo: "Hang a big, comfortable edge for 30 to 60 seconds, with your fingers relaxed and the shoulders engaged. It is long and easy, not maximal.",
    safety: FINGER_SAFETY, template: timed(3, 30, 120, 25, "openHand"),
  },
  {
    id: "weighted-pull-up", name: "Weighted pull-ups", category: "pulling", equipment: "Pull-up bar, a belt or pack", requires: ["pullupBar", "weights"], fields: ["reps", "loadKg"], fingerIntense: false, level: "intermediate",
    howTo: "Pull until your chin is over the bar, lower under control to straight arms, and add weight until 3 to 5 reps is hard.",
    safety: GENERAL_SAFETY, template: counted(4, 5, 150, 5),
  },
  {
    id: "pull-up-ladder", name: "Pull-up ladders", category: "pulling", equipment: "Pull-up bar", requires: ["pullupBar"], fields: ["reps"], fingerIntense: false, level: "beginner",
    howTo: "Do 1 pull-up, rest briefly, then 2, then 3, and climb the ladder as far as you can keep the reps clean. It is a gentle way to add volume.",
    safety: GENERAL_SAFETY, template: counted(3, 6, 90),
  },
  {
    id: "lock-off", name: "Lock-offs", category: "pulling", equipment: "Pull-up bar", requires: ["pullupBar"], fields: ["timeS", "loadKg"], fingerIntense: false, level: "beginner",
    howTo: "Pull up and hold with your elbows bent at 90 degrees, or at the top, for the time. Build up the seconds before you add weight.",
    safety: GENERAL_SAFETY, template: timed(3, 8, 90, null, null),
  },
  {
    id: "campus-ladder", name: "Campus ladders", category: "power", equipment: "Campus board", requires: ["campus"], fields: ["reps"], fingerIntense: true, level: "advanced",
    howTo: "Reach up the rungs with one hand at a time, controlled and not wild, using rungs that suit your finger strength. Keep sets short and rest long.",
    safety: "Hard on the fingers and elbows, and not for beginners or anyone with a recent finger injury. " + FINGER_SAFETY, template: counted(4, 3, 180),
  },
  {
    id: "dynamic-pull-up", name: "Dynamic pull-ups", category: "power", equipment: "Pull-up bar", requires: ["pullupBar"], fields: ["reps", "loadKg"], fingerIntense: false, level: "intermediate",
    howTo: "Pull up fast and as high as you can, then lower under control. Stop the set when the speed drops, not when you are tired.",
    safety: GENERAL_SAFETY, template: counted(4, 4, 120),
  },
  {
    id: "hanging-leg-raise", name: "Hanging leg raises", category: "core", equipment: "Pull-up bar", requires: ["pullupBar"], fields: ["reps"], fingerIntense: false, level: "beginner",
    howTo: "Hang with straight arms and raise your knees, or straight legs, as high as you can without swinging. Lower slowly.",
    safety: GENERAL_SAFETY, template: counted(3, 8, 90),
  },
  {
    id: "front-lever-progression", name: "Front lever progression", category: "core", equipment: "Pull-up bar or rings", requires: ["pullupBar"], fields: ["timeS"], fingerIntense: false, level: "advanced",
    howTo: "Hold the easiest version you can keep straight, such as a tuck, then the advanced tuck, and move on as the holds get long.",
    safety: GENERAL_SAFETY, template: timed(4, 8, 120, null, null),
  },
  {
    id: "plank", name: "Plank", category: "core", equipment: "None", requires: [], fields: ["timeS"], fingerIntense: false, level: "beginner",
    howTo: "Hold a straight line from your head to your heels on your forearms, with your glutes and stomach tight.",
    safety: GENERAL_SAFETY, template: timed(3, 45, 60, null, null),
  },
  {
    id: "push-up", name: "Push-ups", category: "antagonist", equipment: "None", requires: [], fields: ["reps", "loadKg"], fingerIntense: false, level: "beginner",
    howTo: "The push to balance all the pulling. Keep your body straight, lower until your chest is near the floor, and push back up.",
    safety: GENERAL_SAFETY, template: counted(3, 12, 90),
  },
  {
    id: "reverse-wrist-curl", name: "Reverse wrist curls", category: "antagonist", equipment: "Light dumbbell or band", requires: ["weights"], fields: ["reps", "loadKg"], fingerIntense: false, level: "beginner",
    howTo: "With your forearm on a bench and the palm down, lift the back of the hand slowly with a light weight. It works the muscles opposite the ones that climbing overuses.",
    safety: "Keep it light. " + GENERAL_SAFETY, template: counted(3, 15, 60, 2),
  },
  {
    id: "scapular-pull-up", name: "Scapular pull-ups", category: "antagonist", equipment: "Pull-up bar", requires: ["pullupBar"], fields: ["reps"], fingerIntense: false, level: "beginner",
    howTo: "Hang with straight arms and pull your shoulder blades down and together, without bending your elbows, so your body rises a few centimetres.",
    safety: GENERAL_SAFETY, template: counted(3, 10, 60),
  },
  {
    id: "face-pull", name: "Face pulls", category: "antagonist", equipment: "Band or cable", requires: ["weights"], fields: ["reps", "loadKg"], fingerIntense: false, level: "beginner",
    howTo: "Pull a band or cable toward your face with your elbows high, and finish with your hands beside your ears. It looks after the rear of the shoulders.",
    safety: "Keep it light. " + GENERAL_SAFETY, template: counted(3, 15, 60),
  },
  {
    id: "climbing-warm-up", name: "Climbing warm-up", category: "mobility", equipment: "None", requires: [], fields: ["timeS"], fingerIntense: false, level: "beginner",
    howTo: "Start with five to ten minutes of light movement to raise your pulse, then arm circles, wrist and finger mobility, then a few easy climbs or hangs before anything hard.",
    safety: "A warm-up should never feel hard.", template: timed(1, 600, 0, null, null),
  },
  {
    id: "hip-thoracic-mobility", name: "Hip and thoracic mobility", category: "mobility", equipment: "None", requires: [], fields: ["timeS"], fingerIntense: false, level: "beginner",
    howTo: "Hold gentle positions for the hips and the upper back, for example a deep squat and an open-book rotation on the floor, and breathe slowly.",
    safety: "Stretch to a mild pull, never to pain.", template: timed(2, 60, 20, null, null),
  },
];

/** Whether someone with this equipment can do the exercise. */
export const canDo = (e: Exercise, have: readonly Equipment[]): boolean => e.requires.every((r) => have.includes(r));

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

/** The exercise with this id, or undefined for one this version doesn't know (a newer backup, say). */
export const exerciseById = (id: string): Exercise | undefined => BY_ID.get(id);

export const categoryLabel = (c: Category): string => CATEGORIES.find((x) => x.value === c)!.label;

/** Library search: the name, the category or the equipment contains every word typed. */
export function searchExercises(list: Exercise[], query: string, category: Category | null): Exercise[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (category && e.category !== category) return false;
    const hay = `${e.name} ${categoryLabel(e.category)} ${e.equipment}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
