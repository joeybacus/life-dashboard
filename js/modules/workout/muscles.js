/* Muscle groups and equipment.

   When you start a workout you choose what you're training from GROUPS
   (Push, Chest, Full Body…). Each exercise has one primary muscle and maybe
   some secondary ones from MUSCLES. GROUPS says which muscles each choice
   covers, so the exercise list can show what fits your workout.
   Both lists can grow later — add a name and it appears everywhere. */

export const MUSCLES = [
  'Chest', 'Shoulders', 'Triceps', 'Biceps', 'Forearms', 'Back', 'Traps', 'Lower back',
  'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Adductors', 'Abductors', 'Cardio', 'Full body', 'Other',
];

/** Workout choices → the muscles they cover (null = everything). */
export const GROUPS = {
  Push: ['Chest', 'Shoulders', 'Triceps'],
  Pull: ['Back', 'Biceps', 'Traps', 'Forearms', 'Lower back'],
  Legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Adductors', 'Abductors'],
  Arms: ['Biceps', 'Triceps', 'Forearms'],
  Shoulders: ['Shoulders', 'Traps'],
  Chest: ['Chest'],
  Back: ['Back', 'Traps', 'Lower back'],
  Biceps: ['Biceps'],
  Triceps: ['Triceps'],
  'Abs/Core': ['Abs'],
  Cardio: ['Cardio'],
  'Full Body': null,
};
export const GROUP_NAMES = Object.keys(GROUPS);

export const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Smith machine', 'Kettlebell', 'Bodyweight', 'Band', 'Cardio machine', 'Other'];

/** How sets are logged: weight × reps (most exercises), time only (planks), or distance + time (cardio). */
export const KINDS = {
  weight: 'Weight & reps',
  duration: 'Time',
  cardio: 'Distance & time',
};

/** The muscles covered by a set of workout choices, or null for "everything". */
export function musclesFor(groups = []) {
  if (!groups.length || groups.some((g) => GROUPS[g] === null)) return null;
  const muscles = new Set();
  groups.forEach((g) => (GROUPS[g] ?? [g]).forEach((m) => muscles.add(m)));
  return muscles;
}

/** Does this exercise fit the chosen groups? (Its primary muscle decides.) */
export function fitsGroups(exercise, groups) {
  const muscles = musclesFor(groups);
  return !muscles || muscles.has(exercise.primary);
}

/** Short label for a workout's groups: "Push", "Chest + Triceps", "Workout". */
export function groupsLabel(groups = []) {
  if (!groups.length) return 'Workout';
  if (groups.length > 3) return `${groups.slice(0, 2).join(' + ')} + ${groups.length - 2} more`;
  return groups.join(' + ');
}

/** A friendly default name for a new workout: "Push day", "Chest & Triceps", "Cardio". */
export function defaultTitle(groups = []) {
  if (!groups.length) return 'Workout';
  if (groups.length === 1) {
    const [g] = groups;
    if (g === 'Cardio') return 'Cardio';
    if (g === 'Full Body') return 'Full body';
    if (g === 'Abs/Core') return 'Abs & core';
    return `${g} day`;
  }
  return groups.length <= 3 ? groups.join(' & ') : `${groups.slice(0, 2).join(' & ')} & more`;
}

const PUSH = new Set(GROUPS.Push);
const PULL = new Set(GROUPS.Pull);
const LEGS = new Set(GROUPS.Legs);

/**
 * Work out what a workout trained from its exercises' primary muscles, e.g.
 * for workouts imported from Hevy. counts: Map(muscle → number of sets).
 */
export function inferGroups(counts) {
  let total = 0;
  const share = { push: 0, pull: 0, legs: 0, abs: 0, cardio: 0 };
  counts.forEach((n, muscle) => {
    total += n;
    if (PUSH.has(muscle)) share.push += n;
    else if (PULL.has(muscle)) share.pull += n;
    else if (LEGS.has(muscle)) share.legs += n;
    else if (muscle === 'Abs') share.abs += n;
    else if (muscle === 'Cardio') share.cardio += n;
  });
  if (!total) return [];
  const main = [['Push', share.push], ['Pull', share.pull], ['Legs', share.legs]]
    .filter(([, n]) => n / total >= 0.2)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  if (main.length === 3) return ['Full Body'];
  if (main.length) {
    if (share.abs / total >= 0.2) main.push('Abs/Core');
    return main;
  }
  if (share.cardio / total >= 0.5) return ['Cardio'];
  if (share.abs / total >= 0.5) return ['Abs/Core'];
  return ['Full Body'];
}

/** Workout splits (Settings → Workout split), used to suggest what to train next. */
export const SPLITS = {
  ppl: { name: 'Push · Pull · Legs', days: ['Push', 'Pull', 'Legs'] },
  body: { name: 'Body-part split', days: ['Arms', 'Shoulders', 'Chest', 'Abs/Core', 'Legs', 'Cardio'] },
};

/** The split day after your most recent workout that matches one (finished workouts, newest first). */
export function suggestNext(split, workouts) {
  for (const w of workouts) {
    const groups = w.muscleGroups ?? [];
    const day = split.days.find((d) => groups.includes(d)) ?? (split.days.includes(w.type) ? w.type : null);
    if (day) return split.days[(split.days.indexOf(day) + 1) % split.days.length];
  }
  return split.days[0];
}
