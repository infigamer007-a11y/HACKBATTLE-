"use client";

/**
 * Web Audio API synthesizer for call notification sounds.
 *
 * Provides pleasant, warm harmonic chimes without any external audio asset dependencies:
 * - Join Sound: Ascending 3-tone harmonic chime (C5 -> E5 -> G5)
 * - Leave Sound: Descending 2-tone soft chime (E5 -> A4)
 * - Call Initiated Sound: Sleek 2-tone outgoing chime (A4 -> D5)
 * - Call Ended Sound: Soft resolution tone (A4 -> F4)
 */

const STORAGE_KEY = "truevoice_call_sounds_muted";

let sharedAudioCtx: AudioContext | null = null;
let isMutedCache: boolean | null = null;

export function isCallSoundsMuted(): boolean {
  if (typeof window === "undefined") return false;
  if (isMutedCache !== null) return isMutedCache;
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    isMutedCache = val === "true";
  } catch {
    isMutedCache = false;
  }
  return isMutedCache;
}

export function setCallSoundsMuted(muted: boolean): void {
  isMutedCache = muted;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? "true" : "false");
    } catch {
      /* ignore */
    }
  }
}

export function toggleCallSoundsMuted(): boolean {
  const next = !isCallSoundsMuted();
  setCallSoundsMuted(next);
  return next;
}

/**
 * Ensures the AudioContext is instantiated and resumed upon user gesture.
 */
export function initCallAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioCtx();
    }

    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }

    return sharedAudioCtx;
  } catch {
    return null;
  }
}

interface ToneParam {
  freq: number;
  delay: number;
  duration: number;
  gain: number;
}

/**
 * Plays an individual synthesized musical note with fundamental and 2nd harmonic
 * using smooth exponential envelope to avoid clicks and pops.
 */
function playHarmonicNote(
  ctx: AudioContext,
  startTime: number,
  { freq, delay, duration, gain }: ToneParam
) {
  const noteStart = startTime + delay;
  const master = ctx.createGain();
  master.connect(ctx.destination);

  // Smooth attack & exponential decay envelope
  master.gain.setValueAtTime(0.0001, noteStart);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), noteStart + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);

  // Fundamental frequency
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(freq, noteStart);
  osc1.connect(master);
  osc1.start(noteStart);
  osc1.stop(noteStart + duration + 0.05);

  // Gentle 2nd harmonic overtone for warmth (bell/chime feel)
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(freq * 2, noteStart);

  const osc2Gain = ctx.createGain();
  osc2Gain.gain.setValueAtTime(gain * 0.22, noteStart);
  osc2Gain.connect(master);
  osc2.connect(osc2Gain);

  osc2.start(noteStart);
  osc2.stop(noteStart + duration + 0.05);
}

function playTones(tones: ToneParam[]): void {
  if (isCallSoundsMuted()) return;

  const ctx = initCallAudioContext();
  if (!ctx) return;

  try {
    const startTime = ctx.currentTime + 0.02;
    tones.forEach((tone) => playHarmonicNote(ctx, startTime, tone));
  } catch (err) {
    console.warn("[callSounds] Error playing tone:", err);
  }
}

/**
 * Pleasant 3-tone ascending entrance chime when a peer (patient or clinician) joins the call.
 * C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz)
 */
export function playJoinSound(): void {
  playTones([
    { freq: 523.25, delay: 0.0, duration: 0.16, gain: 0.18 },
    { freq: 659.25, delay: 0.11, duration: 0.16, gain: 0.20 },
    { freq: 783.99, delay: 0.22, duration: 0.38, gain: 0.22 },
  ]);
}

/**
 * Distinct 2-tone descending exit chime when a peer leaves the call.
 * E5 (659.25 Hz) -> A4 (440.00 Hz)
 */
export function playLeaveSound(): void {
  playTones([
    { freq: 659.25, delay: 0.0, duration: 0.16, gain: 0.20 },
    { freq: 440.0, delay: 0.13, duration: 0.35, gain: 0.18 },
  ]);
}

/**
 * Sleek 2-tone ascending confirmation chime when initiating/entering the call.
 * A4 (440.00 Hz) -> D5 (587.33 Hz)
 */
export function playCallInitiatedSound(): void {
  playTones([
    { freq: 440.0, delay: 0.0, duration: 0.12, gain: 0.16 },
    { freq: 587.33, delay: 0.09, duration: 0.28, gain: 0.18 },
  ]);
}

/**
 * Soft ending chime when consultation concludes or user hangs up.
 * A4 (440.00 Hz) -> F4 (349.23 Hz)
 */
export function playCallEndedSound(): void {
  playTones([
    { freq: 440.0, delay: 0.0, duration: 0.15, gain: 0.16 },
    { freq: 349.23, delay: 0.11, duration: 0.32, gain: 0.15 },
  ]);
}
