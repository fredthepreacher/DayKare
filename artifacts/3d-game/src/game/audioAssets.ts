export type AudioScene =
  | "menu"
  | "daycare"
  | "art"
  | "show-and-tell"
  | "garden"
  | "recess"
  | "fishing"
  | "juice-club"
  | "heist"
  | "storybook"
  | "nap";

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
const calm: MusicCue = {
    id: "menu-calm",
    file: "daycare-calm-loop.mp3",
    label: "DayKare Calm",
    defaultVolume: 0.75,
};
const daycare: MusicCue = {
    id: "daycare-calm",
    file: "daycare-calm-loop.mp3",
    label: "Daycare Day",
    defaultVolume: 0.78,
};
const garden: MusicCue = {
    id: "garden-sunshine",
    file: "garden-sunshine-loop.mp3",
    label: "Garden Sunshine",
    defaultVolume: 0.82,
};
const juice: MusicCue = {
    id: "juice-club-bounce",
    file: "juice-club-bounce-loop.mp3",
    label: "Juice Club Bounce",
    defaultVolume: 0.88,
};
const storybook: MusicCue = {
    id: "storybook-dream",
    file: "storybook-dream-loop.mp3",
    label: "Storybook Dream",
    defaultVolume: 0.7,
};
const nap: MusicCue = {
    id: "nap-dream",
    file: "storybook-dream-loop.mp3",
    label: "Quiet-Time Dream",
    defaultVolume: 0.38,
};

const variation = (id: string, file: string, label: string, defaultVolume: number): MusicCue => ({
  id, file, label, defaultVolume,
});

/** Existing loops remain first-class; supplied alternatives expand each context pool. */
export const MUSIC_BY_SCENE: Record<AudioScene, readonly MusicCue[]> = {
  menu: [calm, variation("menu-alt-01", "music_menu_alt_01.ogg", "Playroom Welcome", 0.68)],
  daycare: [daycare, variation("daycare-alt-01", "music_daycare_alt_01.ogg", "Daycare Friends", 0.72)],
  art: [daycare, variation("daycare-art-alt-01", "music_daycare_alt_01.ogg", "Creative Corner", 0.7)],
  "show-and-tell": [calm, variation("show-and-tell-alt-01", "music_daycare_alt_01.ogg", "Sharing Circle", 0.68)],
  garden: [garden, variation("garden-alt-01", "music_garden_alt_01.ogg", "Garden Adventure", 0.76)],
  recess: [garden, variation("recess-alt-01", "music_recess_alt_01.ogg", "Recess Rush", 0.78)],
  fishing: [garden, variation("fishing-alt-01", "music_garden_alt_01.ogg", "Pond Day", 0.7)],
  "juice-club": [juice],
  heist: [variation("heist-tech-alt-01", "music_heist_tech_alt_01.ogg", "Sneaky Tech", 0.76)],
  storybook: [storybook, variation("storybook-alt-01", "music_storybook_alt_01.ogg", "Storybook Stroll", 0.66)],
  nap: [nap],
};

export function chooseMusicCue(scene: AudioScene, previousId?: string, random = Math.random) {
  const pool = MUSIC_BY_SCENE[scene];
  const fresh = pool.filter((cue) => cue.id !== previousId);
  const choices = fresh.length ? fresh : pool;
  return choices[Math.floor(random() * choices.length)] ?? pool[0];
}

export type VoiceGroup =
  | "child-greeting"
  | "child-playful"
  | "child-food"
  | "child-social"
  | "teacher-class"
  | "teacher-art"
  | "teacher-show"
  | "teacher-recess"
  | "teacher-nap"
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
    // Supplied clip: child reaction, "Oh man!"
    "new_voice_variant_04.wav",
  ],
  "child-food": [
    "child_crackers_01.wav",
    // Supplied clips: "Juice time!" and an excited "Mmm, delicioso!"
    "new_voice_variant_06.wav",
    "new_voice_variant_07.wav",
  ],
  "child-social": [
    "child_deuce_01.wav",
    "child_deuce_02.wav",
    "child_wavy_01.wav",
    "child_wavy_02.wav",
    // Supplied learning/counting clips: alphabet and "one, two, three."
    "new_voice_variant_01.wav",
    "new_voice_variant_02.wav",
  ],
  "teacher-class": [
    "teacher_get_back_to_class_01.wav",
    "teacher_get_back_to_class_02.wav",
  ],
  "teacher-art": [
    "teacher_get_back_to_art_room_01.wav",
    "teacher_get_back_to_art_center_01.wav",
  ],
  // Supplied schedule announcements, mapped from their spoken content.
  "teacher-show": ["new_voice_variant_03.wav"],
  "teacher-recess": ["new_voice_variant_05.wav"],
  "teacher-nap": ["new_voice_variant_08.wav"],
  "teacher-chase": [
    "teacher_come_back_here_01.wav",
    "teacher_come_back_here_02.wav",
  ],
};

export function teacherVoiceGroupForSchedule(schedule: string): VoiceGroup | null {
  if (schedule === "show-and-tell") return "teacher-show";
  if (schedule === "art-time") return "teacher-art";
  if (schedule === "recess") return "teacher-recess";
  if (schedule === "nap") return "teacher-nap";
  return null;
}

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
