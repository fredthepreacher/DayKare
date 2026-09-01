export type GameSound =
  | 'arrival'
  | 'drawing'
  | 'play'
  | 'greeting'
  | 'juice-service'
  | 'interaction'
  | 'dialogue'
  | 'tidy-place'
  | 'footstep'
  | 'door'
  | 'pickup'
  | 'reward'
  | 'garden-plant'
  | 'garden-harvest'
  | 'garden-bird';

export type SoundPriority = 'ambient' | 'social' | 'interaction' | 'dialogue';

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;
let audioUnlocked = false;
let audioEnabled = true;
let sfxVolume = 0.65;
let lastAmbientAt = -Infinity;
let lastSocialAt = -Infinity;
let activePriority = 0;
let activeUntil = 0;
const warnedAudioErrors = new Set<string>();

function warnAudio(message: string, error?: unknown) {
  const detail = error instanceof Error ? `: ${error.message}` : '';
  const full = `[DayKare audio] ${message}${detail}`;
  if (warnedAudioErrors.has(full)) return;
  warnedAudioErrors.add(full);
  console.warn(full);
}

const priorityValues: Record<SoundPriority, number> = {
  ambient: 1,
  social: 2,
  interaction: 3,
  dialogue: 4,
};

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;

  const audioWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
  const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    audioContext = new AudioContextClass();
  } catch (error) {
    // Web Audio is an enhancement. Browsers that do not allow a context
    // should continue to render the game normally.
    warnAudio('Web Audio context creation failed', error);
    return null;
  }
  return audioContext;
}

/**
 * Starts audio only from a browser gesture. Calling resume() is deliberately
 * guarded and caught so a browser policy can never create an unhandled error.
 */
export function unlockGameAudio() {
  if (!audioEnabled) return;
  audioUnlocked = true;
  const context = getAudioContext();
  if (!context || context.state === 'running') return;
  try {
    void context.resume().catch((error) => warnAudio('browser blocked audio resume', error));
  } catch (error) {
    warnAudio('browser rejected audio resume', error);
  }
}

export function setGameAudioEnabled(enabled: boolean) {
  audioEnabled = enabled;
  if (!enabled && audioContext?.state === 'running') {
    try {
      void audioContext.suspend().catch(() => undefined);
    } catch {
      // Losing or suspending audio must never affect gameplay.
    }
  }
}

export function gameAudioIsEnabled() {
  return audioEnabled;
}

function shouldPlay(context: AudioContext, priority: SoundPriority) {
  const now = context.currentTime;
  const numericPriority = priorityValues[priority];
  if (numericPriority < activePriority && now < activeUntil) return false;
  if (priority === 'ambient' && now - lastAmbientAt < 0.7) return false;
  if (priority === 'social' && now - lastSocialAt < 1.8) return false;
  return true;
}

function scheduleTone(
  context: AudioContext,
  output: GainNode,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.025);
}

function scheduleSound(context: AudioContext, sound: GameSound, start: number) {
  const output = context.createGain();
  output.gain.setValueAtTime(0.22 * sfxVolume, start);
  output.connect(context.destination);

  switch (sound) {
    case 'arrival':
      scheduleTone(context, output, 392, start, 0.12, 0.12, 'sine');
      scheduleTone(context, output, 523, start + 0.09, 0.18, 0.1, 'sine');
      return 0.29;
    case 'drawing':
      scheduleTone(context, output, 880, start, 0.07, 0.065, 'triangle');
      scheduleTone(context, output, 660, start + 0.08, 0.1, 0.05, 'triangle');
      return 0.2;
    case 'play':
      scheduleTone(context, output, 523, start, 0.1, 0.08, 'triangle');
      scheduleTone(context, output, 659, start + 0.08, 0.12, 0.08, 'triangle');
      scheduleTone(context, output, 784, start + 0.17, 0.14, 0.07, 'triangle');
      return 0.33;
    case 'greeting':
      scheduleTone(context, output, 659, start, 0.11, 0.1, 'sine');
      scheduleTone(context, output, 784, start + 0.1, 0.15, 0.08, 'sine');
      return 0.28;
    case 'juice-service':
      scheduleTone(context, output, 330, start, 0.12, 0.09, 'sine');
      scheduleTone(context, output, 494, start + 0.1, 0.18, 0.1, 'sine');
      scheduleTone(context, output, 659, start + 0.21, 0.15, 0.08, 'sine');
      return 0.39;
    case 'interaction':
      scheduleTone(context, output, 220, start, 0.055, 0.11, 'square');
      return 0.1;
    case 'dialogue':
      scheduleTone(context, output, 392, start, 0.09, 0.12, 'sine');
      scheduleTone(context, output, 587, start + 0.07, 0.16, 0.1, 'sine');
      return 0.27;
    case 'tidy-place':
      scheduleTone(context, output, 494, start, 0.09, 0.09, 'triangle');
      scheduleTone(context, output, 659, start + 0.08, 0.12, 0.08, 'triangle');
      return 0.24;
    case 'footstep':
      scheduleTone(context, output, 92, start, 0.055, 0.07, 'triangle');
      scheduleTone(context, output, 58, start + 0.018, 0.045, 0.035, 'sine');
      return 0.09;
    case 'door':
      scheduleTone(context, output, 145, start, 0.13, 0.075, 'sawtooth');
      scheduleTone(context, output, 104, start + 0.09, 0.18, 0.06, 'triangle');
      return 0.29;
    case 'pickup':
      scheduleTone(context, output, 420, start, 0.07, 0.09, 'triangle');
      scheduleTone(context, output, 610, start + 0.055, 0.11, 0.075, 'sine');
      return 0.18;
    case 'reward':
      scheduleTone(context, output, 523, start, 0.11, 0.09, 'sine');
      scheduleTone(context, output, 659, start + 0.1, 0.13, 0.085, 'sine');
      scheduleTone(context, output, 784, start + 0.21, 0.2, 0.08, 'sine');
      return 0.43;
    case 'garden-plant':
      scheduleTone(context, output, 176, start, 0.13, 0.07, 'triangle');
      scheduleTone(context, output, 246, start + 0.1, 0.16, 0.055, 'sine');
      return 0.28;
    case 'garden-harvest':
      scheduleTone(context, output, 392, start, 0.09, 0.075, 'triangle');
      scheduleTone(context, output, 523, start + 0.07, 0.12, 0.075, 'triangle');
      scheduleTone(context, output, 698, start + 0.16, 0.16, 0.07, 'sine');
      return 0.34;
    case 'garden-bird':
      scheduleTone(context, output, 1047, start, 0.075, 0.04, 'sine');
      scheduleTone(context, output, 1319, start + 0.1, 0.09, 0.035, 'sine');
      scheduleTone(context, output, 1175, start + 0.22, 0.08, 0.03, 'sine');
      return 0.32;
  }
}

export function playGameSound(sound: GameSound, priority: SoundPriority = 'ambient') {
  if (!audioUnlocked || !audioEnabled) return;
  const context = getAudioContext();
  if (!context || context.state !== 'running' || !shouldPlay(context, priority)) return;

  try {
    const start = context.currentTime + 0.005;
    const duration = scheduleSound(context, sound, start);
    const numericPriority = priorityValues[priority];
    activePriority = numericPriority;
    activeUntil = start + duration;
    if (priority === 'ambient') lastAmbientAt = start;
    if (priority === 'social') lastSocialAt = start;
  } catch (error) {
    warnAudio(`failed to schedule ${sound}`, error);
  }
}

export function setGameAudioMix(enabled: boolean, nextSfxVolume: number) {
  sfxVolume = Math.min(1, Math.max(0, Number.isFinite(nextSfxVolume) ? nextSfxVolume : 0.65));
  setGameAudioEnabled(enabled);
}
