import {
  MUSIC_BY_SCENE,
  chooseVoiceClip,
  type AudioScene,
  type VoiceGroup,
} from "./audioAssets";
import { setGameAudioMix } from "./audio";

export interface AudioMix {
  enabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
}

export interface DayKareAudioDebug {
  unlocked: boolean;
  scene: AudioScene;
  currentTrack: string | null;
  musicPlaying: boolean;
  musicCurrentTime: number;
  lastVoice: string | null;
  voicesPlayed: number;
  sfxPlayed: number;
  failures: string[];
}

declare global {
  interface Window {
    __daykareAudioDebug?: DayKareAudioDebug;
  }
}

const clamp = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
const warned = new Set<string>();
const recentVoices: string[] = [];

let mix: AudioMix = {
  enabled: true,
  musicVolume: 0.32,
  sfxVolume: 0.65,
  voiceVolume: 0.72,
};
let unlocked = false;
let scene: AudioScene = "menu";
let music: HTMLAudioElement | null = null;
let fadeTimer: number | null = null;
let dialogueDucked = false;
let activeVoice: HTMLAudioElement | null = null;
let lastAmbientVoiceAt = -Infinity;
let lastTeacherVoiceAt = -Infinity;

const debug = (): DayKareAudioDebug => {
  if (typeof window === "undefined") {
    return {
      unlocked,
      scene,
      currentTrack: null,
      musicPlaying: false,
      musicCurrentTime: 0,
      lastVoice: null,
      voicesPlayed: 0,
      sfxPlayed: 0,
      failures: [],
    };
  }
  return (window.__daykareAudioDebug ??= {
    unlocked,
    scene,
    currentTrack: null,
    musicPlaying: false,
    musicCurrentTime: 0,
    lastVoice: null,
    voicesPlayed: 0,
    sfxPlayed: 0,
    failures: [],
  });
};

function reportFailure(label: string, error: unknown) {
  const message = `[DayKare audio] ${label}: ${error instanceof Error ? error.message : String(error)}`;
  const state = debug();
  state.failures = [...state.failures.slice(-7), message];
  if (!warned.has(message)) {
    warned.add(message);
    console.warn(message);
  }
}

function targetMusicVolume() {
  if (!mix.enabled) return 0;
  const cue = MUSIC_BY_SCENE[scene];
  return clamp(
    mix.musicVolume *
      cue.defaultVolume *
      (dialogueDucked || activeVoice ? 0.52 : 1),
  );
}

function fadeVolume(
  audio: HTMLAudioElement,
  target: number,
  durationMs: number,
  onDone?: () => void,
) {
  if (fadeTimer !== null) window.clearInterval(fadeTimer);
  const start = audio.volume;
  const startedAt = performance.now();
  fadeTimer = window.setInterval(() => {
    const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
    audio.volume = clamp(start + (target - start) * progress);
    if (progress < 1) return;
    if (fadeTimer !== null) window.clearInterval(fadeTimer);
    fadeTimer = null;
    onDone?.();
  }, 50);
}

function refreshDebug() {
  const state = debug();
  state.unlocked = unlocked;
  state.scene = scene;
  state.currentTrack = music?.dataset.cue ?? null;
  state.musicPlaying = Boolean(
    music &&
    !music.paused &&
    music.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
  );
  state.musicCurrentTime = music?.currentTime ?? 0;
  if (typeof document !== 'undefined') {
    const root = document.documentElement.dataset;
    root.audioUnlocked = String(state.unlocked);
    root.audioScene = state.scene;
    root.audioTrack = state.currentTrack ?? '';
    root.audioPlaying = String(state.musicPlaying);
    root.audioCurrentTime = state.musicCurrentTime.toFixed(2);
    root.audioVoiceCount = String(state.voicesPlayed);
    root.audioSfxCount = String(state.sfxPlayed);
    root.audioLastVoice = state.lastVoice ?? '';
    root.audioFailures = String(state.failures.length);
  }
}

function startSceneMusic() {
  if (typeof Audio === "undefined" || !unlocked || !mix.enabled) return;
  const cue = MUSIC_BY_SCENE[scene];
  if (music?.dataset.cue === cue.id) {
    music.volume = targetMusicVolume();
    if (music.paused)
      void music
        .play()
        .catch((error) => reportFailure(`resume music ${cue.file}`, error));
    refreshDebug();
    return;
  }

  const previous = music;
  const next = new Audio(assetUrl(`audio/music/safe-loops/${cue.file}`));
  next.dataset.cue = cue.id;
  next.loop = true;
  next.preload = "auto";
  next.volume = 0;
  next.addEventListener('timeupdate', refreshDebug);
  music = next;
  const play = next.play();
  void play
    .then(() => {
      debug().currentTrack = cue.id;
      fadeVolume(next, targetMusicVolume(), 1100);
      if (previous) {
        const old = previous;
        const oldStart = old.volume;
        const startedAt = performance.now();
        const oldFade = window.setInterval(() => {
          const progress = Math.min(1, (performance.now() - startedAt) / 900);
          old.volume = clamp(oldStart * (1 - progress));
          if (progress === 1) {
            window.clearInterval(oldFade);
            old.pause();
            old.removeAttribute("src");
            old.load();
          }
        }, 50);
      }
      refreshDebug();
    })
    .catch((error) => {
      if (music === next) music = previous;
      reportFailure(`play music ${cue.file}`, error);
      refreshDebug();
    });
}

export function configureRichGameAudio(next: AudioMix) {
  mix = {
    enabled: Boolean(next.enabled),
    musicVolume: clamp(next.musicVolume),
    sfxVolume: clamp(next.sfxVolume),
    voiceVolume: clamp(next.voiceVolume),
  };
  setGameAudioMix(mix.enabled, mix.sfxVolume);
  if (!mix.enabled) {
    music?.pause();
    activeVoice?.pause();
    activeVoice = null;
  } else if (unlocked) {
    startSceneMusic();
  }
  if (music) music.volume = targetMusicVolume();
  refreshDebug();
}

export function unlockRichGameAudio(initialScene?: AudioScene) {
  if (initialScene) scene = initialScene;
  unlocked = true;
  startSceneMusic();
  refreshDebug();
}

export function setAudioScene(nextScene: AudioScene) {
  if (scene === nextScene) return;
  scene = nextScene;
  startSceneMusic();
  refreshDebug();
}

export function setAudioDialogueDucked(ducked: boolean) {
  dialogueDucked = ducked;
  if (music) fadeVolume(music, targetMusicVolume(), 260);
}

export function playAssetSfx(path: string, relativeVolume = 1) {
  if (
    typeof Audio === "undefined" ||
    !unlocked ||
    !mix.enabled ||
    mix.sfxVolume <= 0
  )
    return false;
  const audio = new Audio(assetUrl(path));
  audio.preload = "auto";
  audio.volume = clamp(mix.sfxVolume * relativeVolume);
  void audio.play()
    .then(() => { debug().sfxPlayed += 1; refreshDebug(); })
    .catch((error) => reportFailure(`play SFX ${path}`, error));
  return true;
}

export interface VoiceOptions {
  ambient?: boolean;
  attenuation?: number;
  force?: boolean;
}

export function playVoice(group: VoiceGroup, options: VoiceOptions = {}) {
  if (
    typeof Audio === "undefined" ||
    !unlocked ||
    !mix.enabled ||
    mix.voiceVolume <= 0
  )
    return false;
  const now = performance.now() / 1000;
  const teacher = group.startsWith("teacher-");
  if (activeVoice && !activeVoice.paused && !activeVoice.ended) return false;
  if (!options.force) {
    if (options.ambient && now - lastAmbientVoiceAt < 18) return false;
    if (teacher && now - lastTeacherVoiceAt < 12) return false;
  }
  const file = chooseVoiceClip(group, recentVoices.slice(-4));
  const audio = new Audio(assetUrl(`audio/voices/${file}`));
  audio.preload = "auto";
  audio.volume = clamp(mix.voiceVolume * (options.attenuation ?? 1));
  activeVoice = audio;
  if (options.ambient) lastAmbientVoiceAt = now;
  if (teacher) lastTeacherVoiceAt = now;
  recentVoices.push(file);
  while (recentVoices.length > 8) recentVoices.shift();
  if (music) fadeVolume(music, targetMusicVolume(), 180);
  const restore = () => {
    if (activeVoice === audio) activeVoice = null;
    if (music) fadeVolume(music, targetMusicVolume(), 420);
  };
  audio.addEventListener("ended", restore, { once: true });
  audio.addEventListener(
    "error",
    () => {
      reportFailure(
        `load voice ${file}`,
        audio.error?.message ?? "media error",
      );
      restore();
    },
    { once: true },
  );
  void audio.play()
    .then(() => {
      const state = debug();
      state.lastVoice = file;
      state.voicesPlayed += 1;
      refreshDebug();
    })
    .catch((error) => {
      reportFailure(`play voice ${file}`, error);
      restore();
    });
  return true;
}

export function getAudioDebugSnapshot() {
  refreshDebug();
  return { ...debug(), failures: [...debug().failures] };
}
