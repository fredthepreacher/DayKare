import assert from "node:assert/strict";
import {
  MUSIC_BY_SCENE,
  VOICES_BY_GROUP,
  chooseVoiceClip,
  voiceGroupForAmbientContext,
} from "./audioAssets";

assert.equal(
  new Set(Object.values(MUSIC_BY_SCENE).map((cue) => cue.file)).size,
  4,
  "four perceptibly different production loops are mapped",
);
assert.match(MUSIC_BY_SCENE.daycare.file, /daycare-calm/);
assert.match(MUSIC_BY_SCENE.garden.file, /garden-sunshine/);
assert.match(MUSIC_BY_SCENE["juice-club"].file, /juice-club-bounce/);
assert.match(MUSIC_BY_SCENE.storybook.file, /storybook-dream/);

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
assert.ok(
  VOICES_BY_GROUP["teacher-chase"].every((file) => file.startsWith("teacher_")),
);
assert.ok(
  VOICES_BY_GROUP["child-greeting"].every((file) => file.startsWith("child_")),
);

console.log("audio asset and voice routing tests passed");
