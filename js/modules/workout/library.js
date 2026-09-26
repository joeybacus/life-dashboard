/* Exercise library.

   Built-in exercises live here in the code (names follow Hevy's, so imported
   Hevy workouts match them). The "exercises" store only holds what's yours:
     - custom exercises you create ({ custom: true, … })
     - your changes to a built-in one, saved under the same id (favourite,
       notes, rest time, video link, or even its name and muscles).
   So the built-in list can grow in later versions without touching your data.

   Built-in ids come from their names ("Bench Press (Barbell)" → "bench-press-barbell").
   Workouts refer to exercises by id, so never rename a built-in exercise here:
   add a new one instead. */
import { db, stamp } from '../../core/db.js';
import { saveRecord } from '../../core/records.js';
import { KINDS } from './muscles.js';

// [name, primary muscle, secondary muscles, equipment, kind (default: weight)]
const BUILT_IN_TABLE = [
  // Chest
  ['Bench Press (Barbell)', 'Chest', 'Triceps, Shoulders', 'Barbell'],
  ['Bench Press (Dumbbell)', 'Chest', 'Triceps, Shoulders', 'Dumbbell'],
  ['Bench Press (Smith Machine)', 'Chest', 'Triceps, Shoulders', 'Smith machine'],
  ['Bench Press (Cable)', 'Chest', 'Triceps, Shoulders', 'Cable'],
  ['Incline Bench Press (Barbell)', 'Chest', 'Shoulders, Triceps', 'Barbell'],
  ['Incline Bench Press (Dumbbell)', 'Chest', 'Shoulders, Triceps', 'Dumbbell'],
  ['Incline Bench Press (Smith Machine)', 'Chest', 'Shoulders, Triceps', 'Smith machine'],
  ['Decline Bench Press (Barbell)', 'Chest', 'Triceps, Shoulders', 'Barbell'],
  ['Decline Bench Press (Dumbbell)', 'Chest', 'Triceps, Shoulders', 'Dumbbell'],
  ['Chest Press (Machine)', 'Chest', 'Triceps, Shoulders', 'Machine'],
  ['Incline Chest Press (Machine)', 'Chest', 'Shoulders, Triceps', 'Machine'],
  ['Iso-Lateral Chest Press (Machine)', 'Chest', 'Triceps, Shoulders', 'Machine'],
  ['Chest Fly (Dumbbell)', 'Chest', 'Shoulders', 'Dumbbell'],
  ['Incline Chest Fly (Dumbbell)', 'Chest', 'Shoulders', 'Dumbbell'],
  ['Chest Fly (Machine)', 'Chest', 'Shoulders', 'Machine'],
  ['Butterfly (Pec Deck)', 'Chest', 'Shoulders', 'Machine'],
  ['Cable Fly Crossovers', 'Chest', 'Shoulders', 'Cable'],
  ['Low Cable Fly Crossovers', 'Chest', 'Shoulders', 'Cable'],
  ['Seated Chest Flys (Cable)', 'Chest', 'Shoulders', 'Cable'],
  ['Push Up', 'Chest', 'Triceps, Shoulders, Abs', 'Bodyweight'],
  ['Push Up (Weighted)', 'Chest', 'Triceps, Shoulders', 'Other'],
  ['Incline Push Ups', 'Chest', 'Triceps, Shoulders', 'Bodyweight'],
  ['Decline Push Up', 'Chest', 'Triceps, Shoulders', 'Bodyweight'],
  ['Diamond Push Up', 'Chest', 'Triceps, Shoulders', 'Bodyweight'],
  ['Chest Dip', 'Chest', 'Triceps, Shoulders', 'Bodyweight'],
  ['Chest Dip (Weighted)', 'Chest', 'Triceps, Shoulders', 'Other'],
  ['Chest Dip (Assisted)', 'Chest', 'Triceps, Shoulders', 'Machine'],
  ['Pullover (Dumbbell)', 'Chest', 'Back, Triceps', 'Dumbbell'],
  ['Floor Press (Barbell)', 'Chest', 'Triceps', 'Barbell'],

  // Shoulders
  ['Overhead Press (Barbell)', 'Shoulders', 'Triceps, Abs', 'Barbell'],
  ['Overhead Press (Dumbbell)', 'Shoulders', 'Triceps', 'Dumbbell'],
  ['Overhead Press (Smith Machine)', 'Shoulders', 'Triceps', 'Smith machine'],
  ['Seated Overhead Press (Barbell)', 'Shoulders', 'Triceps', 'Barbell'],
  ['Seated Overhead Press (Dumbbell)', 'Shoulders', 'Triceps', 'Dumbbell'],
  ['Seated Shoulder Press (Machine)', 'Shoulders', 'Triceps', 'Machine'],
  ['Shoulder Press (Machine Plates)', 'Shoulders', 'Triceps', 'Machine'],
  ['Arnold Press (Dumbbell)', 'Shoulders', 'Triceps', 'Dumbbell'],
  ['Push Press', 'Shoulders', 'Triceps, Quads', 'Barbell'],
  ['Landmine Press', 'Shoulders', 'Chest, Triceps', 'Barbell'],
  ['Lateral Raise (Dumbbell)', 'Shoulders', 'Traps', 'Dumbbell'],
  ['Lateral Raise (Cable)', 'Shoulders', 'Traps', 'Cable'],
  ['Lateral Raise (Machine)', 'Shoulders', 'Traps', 'Machine'],
  ['Single Arm Lateral Raise (Cable)', 'Shoulders', 'Traps', 'Cable'],
  ['Seated Lateral Raise (Dumbbell)', 'Shoulders', 'Traps', 'Dumbbell'],
  ['Front Raise (Dumbbell)', 'Shoulders', 'Chest', 'Dumbbell'],
  ['Front Raise (Cable)', 'Shoulders', 'Chest', 'Cable'],
  ['Front Raise (Barbell)', 'Shoulders', 'Chest', 'Barbell'],
  ['Plate Front Raise', 'Shoulders', 'Chest', 'Other'],
  ['Rear Delt Reverse Fly (Dumbbell)', 'Shoulders', 'Back, Traps', 'Dumbbell'],
  ['Rear Delt Reverse Fly (Machine)', 'Shoulders', 'Back, Traps', 'Machine'],
  ['Rear Delt Reverse Fly (Cable)', 'Shoulders', 'Back, Traps', 'Cable'],
  ['Face Pull', 'Shoulders', 'Back, Traps', 'Cable'],
  ['Upright Row (Barbell)', 'Shoulders', 'Traps, Biceps', 'Barbell'],
  ['Upright Row (Dumbbell)', 'Shoulders', 'Traps, Biceps', 'Dumbbell'],
  ['Upright Row (Cable)', 'Shoulders', 'Traps, Biceps', 'Cable'],
  ['Shrug (Barbell)', 'Traps', 'Forearms', 'Barbell'],
  ['Shrug (Dumbbell)', 'Traps', 'Forearms', 'Dumbbell'],
  ['Shrug (Machine)', 'Traps', 'Forearms', 'Machine'],
  ['Shrug (Smith Machine)', 'Traps', 'Forearms', 'Smith machine'],

  // Triceps
  ['Triceps Pushdown', 'Triceps', '', 'Cable'],
  ['Triceps Rope Pushdown', 'Triceps', '', 'Cable'],
  ['Single Arm Triceps Pushdown (Cable)', 'Triceps', '', 'Cable'],
  ['Triceps Extension (Dumbbell)', 'Triceps', '', 'Dumbbell'],
  ['Triceps Extension (Cable)', 'Triceps', '', 'Cable'],
  ['Triceps Extension (Barbell)', 'Triceps', '', 'Barbell'],
  ['Triceps Extension (Machine)', 'Triceps', '', 'Machine'],
  ['Overhead Triceps Extension (Cable)', 'Triceps', '', 'Cable'],
  ['Skullcrusher (Barbell)', 'Triceps', '', 'Barbell'],
  ['Skullcrusher (Dumbbell)', 'Triceps', '', 'Dumbbell'],
  ['Triceps Kickback (Dumbbell)', 'Triceps', '', 'Dumbbell'],
  ['Triceps Kickback (Cable)', 'Triceps', '', 'Cable'],
  ['Bench Press - Close Grip (Barbell)', 'Triceps', 'Chest, Shoulders', 'Barbell'],
  ['Triceps Dip', 'Triceps', 'Chest, Shoulders', 'Bodyweight'],
  ['Triceps Dip (Weighted)', 'Triceps', 'Chest, Shoulders', 'Other'],
  ['Triceps Dip (Assisted)', 'Triceps', 'Chest, Shoulders', 'Machine'],
  ['Bench Dip', 'Triceps', 'Chest, Shoulders', 'Bodyweight'],
  ['Seated Dip Machine', 'Triceps', 'Chest, Shoulders', 'Machine'],

  // Biceps & forearms
  ['Bicep Curl (Barbell)', 'Biceps', 'Forearms', 'Barbell'],
  ['Bicep Curl (Dumbbell)', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Bicep Curl (Cable)', 'Biceps', 'Forearms', 'Cable'],
  ['Bicep Curl (Machine)', 'Biceps', 'Forearms', 'Machine'],
  ['EZ Bar Biceps Curl', 'Biceps', 'Forearms', 'Barbell'],
  ['Hammer Curl (Dumbbell)', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Rope Cable Curl', 'Biceps', 'Forearms', 'Cable'],
  ['Cross Body Hammer Curl', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Preacher Curl (Barbell)', 'Biceps', 'Forearms', 'Barbell'],
  ['Preacher Curl (Dumbbell)', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Preacher Curl (Machine)', 'Biceps', 'Forearms', 'Machine'],
  ['Concentration Curl', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Seated Incline Curl (Dumbbell)', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Spider Curl (Dumbbell)', 'Biceps', 'Forearms', 'Dumbbell'],
  ['Drag Curl', 'Biceps', 'Forearms', 'Barbell'],
  ['Reverse Curl (Barbell)', 'Forearms', 'Biceps', 'Barbell'],
  ['Reverse Curl (Dumbbell)', 'Forearms', 'Biceps', 'Dumbbell'],
  ['Wrist Curl (Barbell)', 'Forearms', '', 'Barbell'],
  ['Wrist Curl (Dumbbell)', 'Forearms', '', 'Dumbbell'],
  ['Dead Hang', 'Forearms', 'Back', 'Bodyweight', 'duration'],

  // Back
  ['Lat Pulldown (Cable)', 'Back', 'Biceps', 'Cable'],
  ['Lat Pulldown (Machine)', 'Back', 'Biceps', 'Machine'],
  ['Lat Pulldown - Close Grip (Cable)', 'Back', 'Biceps', 'Cable'],
  ['Reverse Grip Lat Pulldown (Cable)', 'Back', 'Biceps', 'Cable'],
  ['Single Arm Lat Pulldown', 'Back', 'Biceps', 'Cable'],
  ['Straight Arm Lat Pulldown (Cable)', 'Back', 'Shoulders', 'Cable'],
  ['Rope Straight Arm Pulldown', 'Back', 'Shoulders', 'Cable'],
  ['Pull Up', 'Back', 'Biceps, Forearms', 'Bodyweight'],
  ['Pull Up (Assisted)', 'Back', 'Biceps, Forearms', 'Machine'],
  ['Pull Up (Weighted)', 'Back', 'Biceps, Forearms', 'Other'],
  ['Pull Up (Band)', 'Back', 'Biceps, Forearms', 'Band'],
  ['Wide Pull Up', 'Back', 'Biceps, Forearms', 'Bodyweight'],
  ['Chin Up', 'Back', 'Biceps, Forearms', 'Bodyweight'],
  ['Chin Up (Assisted)', 'Back', 'Biceps, Forearms', 'Machine'],
  ['Chin Up (Weighted)', 'Back', 'Biceps, Forearms', 'Other'],
  ['Bent Over Row (Barbell)', 'Back', 'Biceps, Lower back, Traps', 'Barbell'],
  ['Bent Over Row (Dumbbell)', 'Back', 'Biceps, Traps', 'Dumbbell'],
  ['Dumbbell Row', 'Back', 'Biceps, Traps', 'Dumbbell'],
  ['Pendlay Row (Barbell)', 'Back', 'Biceps, Lower back, Traps', 'Barbell'],
  ['T Bar Row', 'Back', 'Biceps, Traps', 'Barbell'],
  ['Meadows Rows (Barbell)', 'Back', 'Biceps, Traps', 'Barbell'],
  ['Seated Cable Row - V Grip (Cable)', 'Back', 'Biceps, Traps', 'Cable'],
  ['Seated Cable Row - Bar Grip', 'Back', 'Biceps, Traps', 'Cable'],
  ['Seated Cable Row - Bar Wide Grip', 'Back', 'Biceps, Traps, Shoulders', 'Cable'],
  ['Single Arm Cable Row', 'Back', 'Biceps', 'Cable'],
  ['Seated Row (Machine)', 'Back', 'Biceps, Traps', 'Machine'],
  ['Iso-Lateral Row (Machine)', 'Back', 'Biceps, Traps', 'Machine'],
  ['Iso-Lateral High Row (Machine)', 'Back', 'Biceps, Traps', 'Machine'],
  ['Iso-Lateral Low Row', 'Back', 'Biceps, Traps', 'Machine'],
  ['Chest Supported Incline Row (Dumbbell)', 'Back', 'Biceps, Traps', 'Dumbbell'],
  ['Inverted Row', 'Back', 'Biceps', 'Bodyweight'],
  ['Pullover (Machine)', 'Back', 'Chest', 'Machine'],

  // Lower back
  ['Deadlift (Barbell)', 'Lower back', 'Hamstrings, Glutes, Back, Traps, Forearms', 'Barbell'],
  ['Deadlift (Dumbbell)', 'Lower back', 'Hamstrings, Glutes, Traps, Forearms', 'Dumbbell'],
  ['Deadlift (Trap bar)', 'Lower back', 'Quads, Hamstrings, Glutes, Traps', 'Barbell'],
  ['Rack Pull', 'Lower back', 'Back, Traps, Glutes, Hamstrings', 'Barbell'],
  ['Back Extension (Hyperextension)', 'Lower back', 'Glutes, Hamstrings', 'Bodyweight'],
  ['Back Extension (Weighted Hyperextension)', 'Lower back', 'Glutes, Hamstrings', 'Other'],
  ['Back Extension (Machine)', 'Lower back', 'Glutes, Hamstrings', 'Machine'],
  ['Good Morning (Barbell)', 'Lower back', 'Hamstrings, Glutes', 'Barbell'],
  ['Superman', 'Lower back', 'Glutes', 'Bodyweight'],

  // Legs
  ['Squat (Barbell)', 'Quads', 'Glutes, Hamstrings, Lower back', 'Barbell'],
  ['Front Squat', 'Quads', 'Glutes, Abs', 'Barbell'],
  ['Box Squat (Barbell)', 'Quads', 'Glutes, Hamstrings', 'Barbell'],
  ['Squat (Smith Machine)', 'Quads', 'Glutes, Hamstrings', 'Smith machine'],
  ['Squat (Dumbbell)', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Goblet Squat', 'Quads', 'Glutes, Abs', 'Dumbbell'],
  ['Hack Squat (Machine)', 'Quads', 'Glutes', 'Machine'],
  ['Pendulum Squat (Machine)', 'Quads', 'Glutes', 'Machine'],
  ['Belt Squat (Machine)', 'Quads', 'Glutes', 'Machine'],
  ['Jump Squat', 'Quads', 'Glutes, Calves', 'Bodyweight'],
  ['Leg Press (Machine)', 'Quads', 'Glutes, Hamstrings', 'Machine'],
  ['Leg Press Horizontal (Machine)', 'Quads', 'Glutes, Hamstrings', 'Machine'],
  ['Single Leg Press (Machine)', 'Quads', 'Glutes, Hamstrings', 'Machine'],
  ['Bulgarian Split Squat', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Split Squat (Dumbbell)', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Lunge', 'Quads', 'Glutes, Hamstrings', 'Bodyweight'],
  ['Lunge (Barbell)', 'Quads', 'Glutes, Hamstrings', 'Barbell'],
  ['Lunge (Dumbbell)', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Walking Lunge (Dumbbell)', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Reverse Lunge (Dumbbell)', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Step Up', 'Quads', 'Glutes, Hamstrings', 'Dumbbell'],
  ['Box Jump', 'Quads', 'Glutes, Calves', 'Bodyweight'],
  ['Leg Extension (Machine)', 'Quads', '', 'Machine'],
  ['Single Leg Extensions', 'Quads', '', 'Machine'],
  ['Wall Sit', 'Quads', 'Glutes', 'Bodyweight', 'duration'],
  ['Lying Leg Curl (Machine)', 'Hamstrings', 'Calves', 'Machine'],
  ['Seated Leg Curl (Machine)', 'Hamstrings', 'Calves', 'Machine'],
  ['Standing Leg Curls', 'Hamstrings', 'Calves', 'Machine'],
  ['Nordic Hamstrings Curls', 'Hamstrings', 'Glutes', 'Bodyweight'],
  ['Romanian Deadlift (Barbell)', 'Hamstrings', 'Glutes, Lower back', 'Barbell'],
  ['Romanian Deadlift (Dumbbell)', 'Hamstrings', 'Glutes, Lower back', 'Dumbbell'],
  ['Single Leg Romanian Deadlift (Dumbbell)', 'Hamstrings', 'Glutes, Lower back', 'Dumbbell'],
  ['Stiff Leg Deadlift', 'Hamstrings', 'Glutes, Lower back', 'Barbell'],
  ['Sumo Deadlift', 'Glutes', 'Hamstrings, Quads, Adductors, Lower back', 'Barbell'],
  ['Hip Thrust (Barbell)', 'Glutes', 'Hamstrings', 'Barbell'],
  ['Hip Thrust (Machine)', 'Glutes', 'Hamstrings', 'Machine'],
  ['Hip Thrust (Smith Machine)', 'Glutes', 'Hamstrings', 'Smith machine'],
  ['Glute Bridge', 'Glutes', 'Hamstrings', 'Bodyweight'],
  ['Glute Kickback (Machine)', 'Glutes', 'Hamstrings', 'Machine'],
  ['Glute Kickback on Floor', 'Glutes', 'Hamstrings', 'Bodyweight'],
  ['Cable Pull Through', 'Glutes', 'Hamstrings', 'Cable'],
  ['Hip Abduction (Machine)', 'Abductors', 'Glutes', 'Machine'],
  ['Hip Adduction (Machine)', 'Adductors', '', 'Machine'],
  ['Standing Calf Raise (Machine)', 'Calves', '', 'Machine'],
  ['Standing Calf Raise (Smith)', 'Calves', '', 'Smith machine'],
  ['Standing Calf Raise (Dumbbell)', 'Calves', '', 'Dumbbell'],
  ['Standing Calf Raise', 'Calves', '', 'Bodyweight'],
  ['Seated Calf Raise', 'Calves', '', 'Machine'],
  ['Calf Press (Machine)', 'Calves', '', 'Machine'],

  // Abs
  ['Crunch', 'Abs', '', 'Bodyweight'],
  ['Crunch (Machine)', 'Abs', '', 'Machine'],
  ['Crunch (Weighted)', 'Abs', '', 'Other'],
  ['Cable Crunch', 'Abs', '', 'Cable'],
  ['Decline Crunch', 'Abs', '', 'Bodyweight'],
  ['Bicycle Crunch', 'Abs', '', 'Bodyweight'],
  ['Sit Up', 'Abs', '', 'Bodyweight'],
  ['Hanging Leg Raise', 'Abs', 'Forearms', 'Bodyweight'],
  ['Hanging Knee Raise', 'Abs', 'Forearms', 'Bodyweight'],
  ['Knee Raise Parallel Bars', 'Abs', '', 'Bodyweight'],
  ['Leg Raise Parallel Bars', 'Abs', '', 'Bodyweight'],
  ['Lying Leg Raise', 'Abs', '', 'Bodyweight'],
  ['Toes to Bar', 'Abs', 'Forearms', 'Bodyweight'],
  ['V Up', 'Abs', '', 'Bodyweight'],
  ['Russian Twist (Weighted)', 'Abs', '', 'Other'],
  ['Russian Twist (Bodyweight)', 'Abs', '', 'Bodyweight'],
  ['Ab Wheel', 'Abs', 'Lower back', 'Other'],
  ['Dead Bug', 'Abs', '', 'Bodyweight'],
  ['Heel Taps', 'Abs', '', 'Bodyweight'],
  ['Mountain Climber', 'Abs', 'Shoulders', 'Bodyweight'],
  ['Pallof Press', 'Abs', '', 'Cable'],
  ['Plank', 'Abs', 'Shoulders', 'Bodyweight', 'duration'],
  ['Side Plank', 'Abs', 'Shoulders', 'Bodyweight', 'duration'],

  // Full body
  ['Kettlebell Swing', 'Full body', 'Glutes, Hamstrings, Lower back', 'Kettlebell'],
  ['Clean and Jerk', 'Full body', 'Shoulders, Quads, Glutes', 'Barbell'],
  ['Power Clean', 'Full body', 'Quads, Glutes, Traps', 'Barbell'],
  ['Thruster (Barbell)', 'Full body', 'Quads, Shoulders', 'Barbell'],
  ['Farmers Walk', 'Full body', 'Forearms, Traps', 'Dumbbell'],
  ['Burpee', 'Full body', 'Chest, Quads', 'Bodyweight'],
  ['Battle Ropes', 'Full body', 'Shoulders', 'Other', 'duration'],

  // Cardio
  ['Treadmill', 'Cardio', '', 'Cardio machine', 'cardio'],
  ['Running', 'Cardio', '', 'Bodyweight', 'cardio'],
  ['Walking', 'Cardio', '', 'Bodyweight', 'cardio'],
  ['Hiking', 'Cardio', '', 'Bodyweight', 'cardio'],
  ['Cycling', 'Cardio', '', 'Cardio machine', 'cardio'],
  ['Spinning', 'Cardio', '', 'Cardio machine', 'cardio'],
  ['Air Bike', 'Cardio', '', 'Cardio machine', 'cardio'],
  ['Rowing Machine', 'Cardio', 'Back', 'Cardio machine', 'cardio'],
  ['Elliptical Trainer', 'Cardio', '', 'Cardio machine', 'cardio'],
  ['Stair Machine', 'Cardio', 'Glutes', 'Cardio machine', 'cardio'],
  ['Swimming', 'Cardio', '', 'Other', 'cardio'],
  ['Jump Rope', 'Cardio', 'Calves', 'Other', 'duration'],
];

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const splitList = (text) => (text ? text.split(',').map((s) => s.trim()).filter(Boolean) : []);

export const BUILT_IN = BUILT_IN_TABLE.map(([name, primary, secondary, equipment, kind = 'weight']) => ({
  id: slugify(name),
  name,
  primary,
  secondary: splitList(secondary),
  equipment,
  kind,
  builtIn: true,
}));
const BUILT_IN_IDS = new Set(BUILT_IN.map((e) => e.id));

/* ---- Matching names ("Tricep Push Down" ≈ "Triceps Pushdown") ---- */

const STOP_WORDS = new Set(['the', 'a', 'with', 'on', 'and']);

/** "crunches" → "crunch", "raises" → "raise", "presses" → "press" */
function singular(word) {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** A spelling-insensitive key for an exercise name. */
export function exerciseKey(name) {
  return String(name ?? '').toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(pull|push|chin|sit|step|pick)[\s-]?ups?\b/g, '$1up')
    .replace(/\bpush[\s-]?downs?\b/g, 'pushdown')
    .replace(/\bpull[\s-]?downs?\b/g, 'pulldown')
    .replace(/\bskull[\s-]?crushers?\b/g, 'skullcrusher')
    .replace(/\bflyes\b/g, 'fly')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t))
    .map(singular)
    .sort()
    .join(' ');
}

/* ---- Your library: built-in exercises + your changes + custom exercises ---- */

/** Fields of a built-in exercise that your saved changes may replace. */
const OVERRIDABLE = ['name', 'primary', 'secondary', 'equipment', 'instructions', 'notes', 'restSeconds', 'videoUrl', 'favorite'];

function applyOverride(base, record) {
  const out = { ...base, record };
  OVERRIDABLE.forEach((key) => {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') out[key] = record[key];
  });
  if (record.favorite === false) out.favorite = false;
  return out;
}

function customExercise(record) {
  return {
    id: record.id,
    name: record.name || 'Untitled exercise',
    primary: record.primary || 'Other',
    secondary: Array.isArray(record.secondary) ? record.secondary : [],
    equipment: record.equipment || 'Other',
    kind: KINDS[record.kind] ? record.kind : 'weight',
    instructions: record.instructions ?? '',
    notes: record.notes ?? '',
    restSeconds: record.restSeconds ?? null,
    videoUrl: record.videoUrl ?? '',
    favorite: Boolean(record.favorite),
    custom: true,
    record,
  };
}

/** Combine the built-in list with the records in the "exercises" store. */
export function buildLibrary(records = []) {
  const byId = new Map(BUILT_IN.map((e) => [e.id, e]));
  for (const record of records) {
    if (!record?.id || record.deletedAt) continue;
    if (BUILT_IN_IDS.has(record.id)) byId.set(record.id, applyOverride(byId.get(record.id), record));
    else if (record.custom) byId.set(record.id, customExercise(record));
  }
  const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const byKey = new Map();
  // Built-in names win over custom ones with the same spelling-insensitive name
  [...list].sort((a, b) => Number(Boolean(a.custom)) - Number(Boolean(b.custom))).forEach((e) => {
    const key = exerciseKey(e.name);
    if (!byKey.has(key)) byKey.set(key, e);
  });
  return {
    list,
    byId,
    get: (id) => byId.get(id) ?? null,
    findByName: (name) => byKey.get(exerciseKey(name)) ?? null,
  };
}

export async function loadLibrary() {
  return buildLibrary(await db.all('exercises'));
}

/**
 * Save changes to an exercise: custom ones are saved whole, built-in ones as
 * "your changes" under the same id. Returns the saved record.
 */
export async function saveExercise(exercise, patch) {
  const now = new Date().toISOString();
  let record;
  if (exercise?.builtIn) {
    const existing = (await db.get('exercises', exercise.id)) ?? { id: exercise.id, builtIn: true };
    record = stamp({ ...existing, ...patch, deletedAt: null }, now);
  } else if (exercise) {
    record = stamp({ ...(exercise.record ?? {}), ...patch, id: exercise.id, custom: true }, now);
  } else {
    record = stamp({ custom: true, ...patch }, now);
  }
  await saveRecord('exercises', record);
  return record;
}

/** Remove a custom exercise (kept in past workouts under its name). */
export async function deleteCustomExercise(exercise) {
  if (!exercise?.custom) return null;
  const record = stamp({ ...exercise.record, deletedAt: new Date().toISOString() });
  await saveRecord('exercises', record);
  return record;
}

/* ---- Display & search ---- */

export const exerciseMeta = (e) => [e.primary, e.equipment].filter((x) => x && x !== 'Other').join(' · ');

export function youTubeSearchUrl(name) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form`)}`;
}

/** Exercises matching every word typed (in the name, muscles or equipment). */
export function searchExercises(list, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  const scored = [];
  for (const e of list) {
    const name = e.name.toLowerCase();
    const hay = `${name} ${e.primary} ${e.secondary.join(' ')} ${e.equipment}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const score = name.startsWith(words[0]) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2;
    scored.push([score, e]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, e]) => e);
}

/* ---- Guessing details for exercises that aren't in the library (e.g. from Hevy) ---- */

const MUSCLE_RULES = [
  [/treadmill|elliptical|stair ?(machine|master|climb)|rowing machine|\brower\b|ski ?erg|air ?bike|exercise bike|stationary bike|cycling|spinning|swimming|hiking|jump ?rope|skipping|sprint|jogging|^(running|walking|run|walk)\b/, 'Cardio'],
  [/calf|calves/, 'Calves'],
  [/leg curl|hamstring|nordic|romanian|stiff.?leg|\brdl\b/, 'Hamstrings'],
  [/abduct/, 'Abductors'],
  [/adduct/, 'Adductors'],
  [/hip thrust|glute|bridge|pull.?through/, 'Glutes'],
  [/squat|leg press|lunge|step.?up|leg extension|sissy|wall sit/, 'Quads'],
  [/tricep|skull|pushdown|push down|kickback|close.?grip|\bdips?\b|jm press/, 'Triceps'],
  [/wrist|forearm|grip|farmer|dead hang/, 'Forearms'],
  [/curl/, 'Biceps'],
  [/shrug/, 'Traps'],
  [/leg raise|knee raise|toes to bar/, 'Abs'],
  [/\braise|rear delt|reverse fly|shoulder|overhead press|military|arnold|face pull|upright row|\bdelt/, 'Shoulders'],
  [/bench|chest|\bfly|flye|\bpec|push.?up|crossover/, 'Chest'],
  [/row|pulldown|pull.?down|pull.?up|chin.?up|\blats?\b|pullover/, 'Back'],
  [/deadlift|good morning|back extension|hyperextension|superman/, 'Lower back'],
  [/crunch|plank|sit.?up|leg raise|knee raise|\babs?\b|core|twist|v.?up|hollow|oblique|toes to bar|dead bug|mountain climber|ab wheel|rollout/, 'Abs'],
  [/clean|snatch|thruster|burpee|swing|get.?up|jerk/, 'Full body'],
];

const EQUIPMENT_RULES = [
  [/smith/, 'Smith machine'],
  [/barbell|ez.?bar|trap.?bar|\bbb\b/, 'Barbell'],
  [/dumbbell|\bdb\b/, 'Dumbbell'],
  [/kettlebell|\bkb\b/, 'Kettlebell'],
  [/cable|rope/, 'Cable'],
  [/band/, 'Band'],
  [/machine|pec deck|leg press|hack squat|lever|plate.?loaded|assisted/, 'Machine'],
  [/treadmill|elliptical|bike|rowing machine|rower|stair|erg/, 'Cardio machine'],
  [/push.?up|pull.?up|chin.?up|\bdips?\b|plank|crunch|sit.?up|burpee|bodyweight|leg raise|knee raise|lunge\b/, 'Bodyweight'],
];

export function guessPrimary(name) {
  const n = String(name ?? '').toLowerCase();
  return MUSCLE_RULES.find(([re]) => re.test(n))?.[1] ?? 'Other';
}

export function guessEquipment(name) {
  const n = String(name ?? '').toLowerCase();
  return EQUIPMENT_RULES.find(([re]) => re.test(n))?.[1] ?? 'Other';
}
