export type AudioScene =
  "menu" | "daycare" | "garden" | "juice-club" | "storybook" | "nap";

export interface MusicCue {
  id: string;
  file: string;
  label: string;
  defaultVolume: number;
}

/**
 * Family-safe instrumental loops cut from owner-supplied DayKare masters.
 * The original archives remain untouched; vocal sections were deliberately
 * excluded after a release-content transcription audit.
 */
export const MUSIC_BY_SCENE: Record<AudioScene, MusicCue> = {
  menu: {
    id: "menu-calm",
    file: "daycare-calm-loop.mp3",
    label: "DayKare Calm",
    defaultVolume: 0.75,
  },
  daycare: {
    id: "daycare-calm",
    file: "daycare-calm-loop.mp3",
    label: "Daycare Day",
    defaultVolume: 0.78,
  },
  garden: {
    id: "garden-sunshine",
    file: "garden-sunshine-loop.mp3",
    label: "Garden Sunshine",
    defaultVolume: 0.82,
  },
  "juice-club": {
    id: "juice-club-bounce",
    file: "juice-club-bounce-loop.mp3",
    label: "Juice Club Bounce",
    defaultVolume: 0.88,
  },
  storybook: {
    id: "storybook-dream",
    file: "storybook-dream-loop.mp3",
    label: "Storybook Dream",
    defaultVolume: 0.7,
  },
  nap: {
    id: "nap-dream",
    file: "storybook-dream-loop.mp3",
    label: "Quiet-Time Dream",
    defaultVolume: 0.38,
  },
};

export type VoiceGroup =
  | "child-greeting"
  | "child-playful"
  | "child-food"
  | "child-social"
  | "teacher-class"
  | "teacher-art"
  | "teacher-chase";

export const VOICES_BY_GROUP: Record<VoiceGroup, readonly string[]> = {
  "child-greeting": [
    "child_hi_01.wav",
    "child_hi_02.wav",
    "child_hello_01.wav",
    "child_hello_02.wav",
  ],
  "child-playful": [
    "child_playful_vocalization_01.wav",
    "child_playful_vocalization_02.wav",
  ],
  "child-food": ["child_crackers_01.wav"],
  "child-social": [
    "child_deuce_01.wav",
    "child_deuce_02.wav",
    "child_wavy_01.wav",
    "child_wavy_02.wav",
  ],
  "teacher-class": [
    "teacher_get_back_to_class_01.wav",
    "teacher_get_back_to_class_02.wav",
  ],
  "teacher-art": [
    "teacher_get_back_to_art_room_01.wav",
    "teacher_get_back_to_art_center_01.wav",
  ],
  "teacher-chase": [
    "teacher_come_back_here_01.wav",
    "teacher_come_back_here_02.wav",
  ],
};

export function voiceGroupForAmbientContext(
  schedule: string,
  scene: AudioScene,
): VoiceGroup {
  if (
    schedule === "breakfast" ||
    schedule === "lunch" ||
    schedule === "juice-club"
  )
    return "child-food";
  if (
    scene === "garden" ||
    schedule === "recess" ||
    schedule === "outdoor-play"
  )
    return "child-playful";
  return Math.random() < 0.56 ? "child-greeting" : "child-social";
}

export function chooseVoiceClip(
  group: VoiceGroup,
  recent: readonly string[],
  random = Math.random,
) {
  const choices = VOICES_BY_GROUP[group];
  const fresh = choices.filter((file) => !recent.includes(file));
  const pool = fresh.length ? fresh : choices;
  return pool[Math.floor(random() * pool.length)] ?? choices[0];
}
