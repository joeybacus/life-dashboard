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

/** One bell stroke: the note plus two softer overtones, fading out. */
function bell(start, freq, length) {
  const master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.5, start + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, start + length);
  [[1, 1], [2.76, 0.22], [5.4, 0.08]].forEach(([ratio, level]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    gain.gain.value = level;
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + length + 0.05);
  });
}

const CHIMES = {
  set: [[0, 1318.5], [0.24, 1046.5]],                  // two notes: next set
  exercise: [[0, 1046.5], [0.2, 1318.5], [0.4, 1568]], // three rising notes: next exercise
};

/**
 * A short chime: kind 'set' or 'exercise' (they sound different, so you can
 * tell without looking). onSilent: play even when the iPhone is on silent.
 * Returns false when sound isn't available (no tap yet since the app opened).
 */
export async function chime(kind = 'set', { onSilent = false } = {}) {
  if (!audioCtx) return false;
  try {
    clearTimeout(idleTimer);
    setAudioSession(onSilent ? 'playback' : 'ambient');
    if (audioCtx.state !== 'running') await audioCtx.resume();
    const notes = CHIMES[kind] ?? CHIMES.set;
    const t0 = audioCtx.currentTime + 0.06;
    notes.forEach(([offset, freq], i) => bell(t0 + offset, freq, i === notes.length - 1 ? 1.3 : 0.7));
    sleepSoon(2500);
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
