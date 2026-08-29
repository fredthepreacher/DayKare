export type GameSound =
  | 'arrival'
  | 'drawing'
  | 'play'
  | 'greeting'
  | 'juice-service'
  | 'interaction'
  | 'dialogue'
  | 'tidy-place';

export type SoundPriority = 'ambient' | 'social' | 'interaction' | 'dialogue';

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;
let audioUnlocked = false;
let lastAmbientAt = -Infinity;
let lastSocialAt = -Infinity;
let activePriority = 0;
let activeUntil = 0;

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
  } catch {
    // Web Audio is an enhancement. Browsers that do not allow a context
    // should continue to render the game normally.
    return null;
  }
  return audioContext;
}

/**
 * Starts audio only from a browser gesture. Calling resume() is deliberately
 * guarded and caught so a browser policy can never create an unhandled error.
 */
export function unlockGameAudio() {
  audioUnlocked = true;
  const context = getAudioContext();
  if (!context || context.state === 'running') return;
  void context.resume().catch(() => undefined);
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
  output.gain.setValueAtTime(0.22, start);
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
  }
}

export function playGameSound(sound: GameSound, priority: SoundPriority = 'ambient') {
  if (!audioUnlocked) return;
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
  } catch {
    // A lost audio device or suspended context must not affect gameplay.
  }
}