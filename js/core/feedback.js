/* Feedback: sounds, vibration and haptic taps.

   - Sounds use the Web Audio API. iPhone only allows a web app to make sound
     after a tap, so unlockAudio() is called from taps (like ticking off a set).
     Where supported, sounds mix with your music (it dips briefly) instead of
     stopping it.
   - Vibration works on Android. iPhone Safari has no vibration API; on iOS 18
     and later, toggling a native switch gives a light haptic tick, which is
     used as a best effort (it may only work right after a tap). */

let audioCtx = null;

function setAudioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch { /* not supported */ }
}

/** Call from a tap: lets later sounds (like the end of a rest) play. */
export function unlockAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  try {
    setAudioSession('ambient');
    audioCtx ??= new AudioCtx();
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    // Playing a silent sample inside the tap finishes unlocking audio on iPhone
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination);
    src.start(0);
  } catch { /* audio unavailable */ }
}

/** A short three-note chime. Returns false when sound isn't available yet. */
export function chime() {
  if (!audioCtx) return false;
  try {
    setAudioSession('transient'); // briefly lower other audio instead of stopping it
    if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    const t0 = audioCtx.currentTime + 0.05;
    [[0, 880, 0.16], [0.22, 880, 0.16], [0.44, 1318.5, 0.5]].forEach(([offset, freq, length]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + length + 0.05);
    });
    setTimeout(() => setAudioSession('ambient'), 1500);
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
