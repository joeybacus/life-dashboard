/* Feedback: sounds, vibration and haptic taps.

   Sounds use the Web Audio API. iPhone only lets a web app make sound after a
   tap, so unlockAudio() is called from taps (starting a workout, ticking a set).
   Between sounds the audio engine is paused, so the app never holds on to the
   phone's audio.

   iPhone gives web apps two kinds of sound (it doesn't allow a mix of both):
     - mixed in with your music, but silent while the iPhone is on silent (the default)
     - "playback", which also plays on silent but pauses music apps while it plays
   chime(kind, { onSilent }) chooses between them.

   Vibration works on Android. iPhone Safari has no vibration API; on iOS 18 and
   later, toggling a native switch gives a light haptic tick, used as a best
   effort (it may only work right after a tap). */

let audioCtx = null;
let idleTimer = null;

function setAudioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch { /* not supported */ }
}

/** Pause the audio engine once nothing is playing, and go back to mixing with other audio. */
function sleepSoon(ms) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    audioCtx?.suspend().catch(() => {});
    setAudioSession('ambient');
  }, ms);
}

/** Call from a tap: lets later sounds (like the end of a rest) play. */
export function unlockAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    if (!audioCtx) {
      setAudioSession('ambient'); // unlocking should never interrupt your music
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    sleepSoon(1500);
  } catch { /* audio unavailable */ }
}

/** One note in the chosen sound, fading out. peak: how loud (0–1). */
function voice(sound, start, freq, length, peak) {
  const shape = VOICES[sound] ?? VOICES.bell;
  const end = start + length * shape.stretch;
  const master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(peak, start + shape.attack);
  if (shape.hold) master.gain.setValueAtTime(peak, end - 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, end);
  shape.partials.forEach(([ratio, level]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = shape.wave;
    osc.frequency.value = freq * shape.pitch * ratio;
    gain.gain.value = level;
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(end + 0.05);
  });
}

/* How each alarm sound is made: the wave, its overtones, how fast it starts,
   how long it rings (stretch) and how high it sits (pitch). */
const VOICES = {
  bell: { wave: 'sine', partials: [[1, 1], [2.76, 0.22], [5.4, 0.08]], attack: 0.012, stretch: 1, pitch: 1 },
  soft: { wave: 'sine', partials: [[1, 1], [2, 0.12]], attack: 0.08, stretch: 1.2, pitch: 0.5 },
  beep: { wave: 'square', partials: [[1, 0.35]], attack: 0.005, stretch: 0.25, pitch: 1, hold: true },
  gong: { wave: 'sine', partials: [[1, 1], [1.48, 0.5], [2.1, 0.35], [3.2, 0.15]], attack: 0.02, stretch: 3, pitch: 0.25 },
  marimba: { wave: 'triangle', partials: [[1, 1], [4, 0.15]], attack: 0.004, stretch: 0.45, pitch: 0.5 },
};

/** The alarm sounds you can pick (the chime clock), in the order shown. */
export const ALARM_SOUNDS = [
  ['bell', 'Bell'], ['soft', 'Soft'], ['marimba', 'Marimba'], ['beep', 'Beep'], ['gong', 'Gong'], ['alarm', 'Alarm clock'],
];

/* "Alarm clock": fast beeps in four bursts, whatever the kind of chime */
const ALARM_CLOCK = [0, 0.5, 1, 1.5].flatMap((burst) => [0, 0.1, 0.2, 0.3].map((t) => [burst + t, 2093]));

const CHIMES = {
  set: [[0, 1318.5], [0.24, 1046.5]],                  // two notes: next set
  exercise: [[0, 1046.5], [0.2, 1318.5], [0.4, 1568]], // three rising notes: next exercise
  reminder: [[0, 1174.7], [0.18, 1568], [0.58, 1174.7], [0.76, 1568]], // two rising pairs: a to-do reminder
  focus: [[0, 784], [0.3, 1046.5], [0.6, 1318.5], [0.9, 1568]],        // four rising notes: focus time is up
  break: [[0, 1568], [0.3, 1174.7], [0.6, 784]],                       // three falling notes: break is over
  interval: [[0, 1568], [0.22, 1568]],                                 // two high strokes: the chime clock's interval
};

/**
 * A short chime: kind 'set', 'exercise' or 'reminder' (they sound different, so
 * you can tell without looking). onSilent: play even when the iPhone is on silent.
 * sound: one of ALARM_SOUNDS (bell by default); volume: 0–1 (0.6 is the usual
 * level — the phone's own volume still applies on top).
 * Returns false when sound isn't available (no tap yet since the app opened).
 */
export async function chime(kind = 'set', { onSilent = false, sound = 'bell', volume = 0.6 } = {}) {
  if (!audioCtx) return false;
  if (!(volume > 0)) return true; // muted
  try {
    clearTimeout(idleTimer);
    setAudioSession(onSilent ? 'playback' : 'ambient');
    if (audioCtx.state !== 'running') await audioCtx.resume();
    const peak = Math.min(1, volume) * 0.85;
    const t0 = audioCtx.currentTime + 0.06;
    if (sound === 'alarm') {
      ALARM_CLOCK.forEach(([offset, freq]) => voice('beep', t0 + offset, freq, 0.28, peak * 0.8));
      sleepSoon(3000);
      return true;
    }
    const notes = CHIMES[kind] ?? CHIMES.set;
    notes.forEach(([offset, freq], i) => voice(sound, t0 + offset, freq, i === notes.length - 1 ? 1.3 : 0.7, peak));
    sleepSoon(sound === 'gong' ? 5500 : 2500);
    return true;
  } catch {
    return false;
  }
}

/** A light haptic tick (iPhone, iOS 18+) or a very short vibration (Android). */
export function haptic() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(12);
    return;
  }
  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.body.append(label);
    label.click();
    label.remove();
  } catch { /* no haptics here */ }
}

/** A noticeable buzz: a vibration pattern where supported, otherwise haptic ticks. */
export function buzz() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([220, 120, 220]);
    return;
  }
  haptic();
  setTimeout(haptic, 180);
}
