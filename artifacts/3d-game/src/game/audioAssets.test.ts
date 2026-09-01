import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  MUSIC_BY_SCENE,
  VOICES_BY_GROUP,
  chooseMusicCue,
  chooseVoiceClip,
  teacherVoiceGroupForSchedule,
  voiceGroupForAmbientContext,
} from "./audioAssets";

assert.equal(
  new Set(Object.values(MUSIC_BY_SCENE).flat().map((cue) => cue.file)).size,
  10,
  "existing and supplied production tracks are mapped",
);
assert.ok(MUSIC_BY_SCENE.menu.some(({ file }) => file === "music_menu_alt_01.ogg"));
assert.ok(MUSIC_BY_SCENE.garden.some(({ file }) => file === "music_garden_alt_01.ogg"));
assert.ok(MUSIC_BY_SCENE.storybook.some(({ file }) => file === "music_storybook_alt_01.ogg"));
const firstMenu = chooseMusicCue("menu", undefined, () => 0);
assert.notEqual(chooseMusicCue("menu", firstMenu.id, () => 0).id, firstMenu.id);

const recentGreeting = VOICES_BY_GROUP["child-greeting"][0];
const alternateGreeting = chooseVoiceClip(
  "child-greeting",
  [recentGreeting],
  () => 0,
);
assert.notEqual(
  alternateGreeting,
  recentGreeting,
  "a recently played take is avoided when alternatives exist",
);
assert.equal(voiceGroupForAmbientContext("lunch", "daycare"), "child-food");
assert.equal(voiceGroupForAmbientContext("recess", "garden"), "child-playful");
assert.equal(teacherVoiceGroupForSchedule("show-and-tell"), "teacher-show");
assert.equal(teacherVoiceGroupForSchedule("recess"), "teacher-recess");
assert.equal(teacherVoiceGroupForSchedule("nap"), "teacher-nap");
assert.ok(
  VOICES_BY_GROUP["teacher-chase"].every((file) => file.startsWith("teacher_")),
);
assert.ok(
  VOICES_BY_GROUP["child-greeting"].every((file) => file.startsWith("child_")),
);

for (const pool of Object.values(MUSIC_BY_SCENE)) {
  for (const cue of pool) {
    assert.ok(
      existsSync(new URL(`../../public/audio/music/safe-loops/${cue.file}`, import.meta.url)),
      `music asset exists: ${cue.file}`,
    );
  }
}
for (const file of Array.from({ length: 8 }, (_, index) =>
  `new_voice_variant_${String(index + 1).padStart(2, "0")}.wav`
)) {
  assert.ok(
    existsSync(new URL(`../../public/audio/voices/${file}`, import.meta.url)),
    `variation voice exists: ${file}`,
  );
}

console.log("audio asset and voice routing tests passed");
