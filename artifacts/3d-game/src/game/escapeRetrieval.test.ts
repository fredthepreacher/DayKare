import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ESCAPE_GRACE_SECONDS,
  ESCAPE_PENALTY_STRIKE,
  ESCAPE_SAFE_POINT,
  TEACHER_PERSONAL_SPACE,
  advanceCarriedPlayer,
  beginEscapeRetrieval,
  evaluateScheduleRetrieval,
  getEscapeRetrievalSnapshot,
  isDaycareEscape,
  markEscapePlayerCaught,
  resetEscapeRetrieval,
  updateEscapeGrace,
} from './escapeRetrieval';
import { SCHEDULE_DETECTION_GRACE_SECONDS, SCHEDULE_RECAPTURE_GRACE_SECONDS } from './schedulePolicy';

resetEscapeRetrieval(true);
assert.equal(isDaycareEscape([0, 0, 0], 'hub', false), false, 'ordinary daycare exploration never starts a chase');
assert.equal(isDaycareEscape([-7, 0, 7], 'hub', false), false, 'walking near Storage remains ordinary exploration');
assert.equal(isDaycareEscape([-9, 0, 9], 'hub', false), false, 'the Storage doorway has a comfortable warning buffer');
assert.equal(isDaycareEscape([0, 0, 11.3], 'hub', false), false, 'the cafeteria is never mistaken for restricted Storage');
assert.equal(isDaycareEscape([-11, 0, 11], 'hub', false), true, 'going clearly into unauthorized Storage starts retrieval');
assert.equal(isDaycareEscape([-11, 0, 11], 'hub', true), false, 'quest authorization overrides the restricted-area gate');
assert.equal(isDaycareEscape([18, 0, 0], 'hub', false), true, 'crossing the real outer boundary starts retrieval');
assert.ok(TEACHER_PERSONAL_SPACE >= 2, 'teachers preserve comfortable space during routine patrols');

let now = 10;
let retrieval = beginEscapeRetrieval(now, [-11, 0, 11]);
assert.equal(retrieval.assignedTeacher, 'Ms. Harper');
assert.equal(retrieval.phase, 'chasing');
assert.equal(beginEscapeRetrieval(now + 1, [18, 0, 0]).assignedTeacher, 'Ms. Harper', 'a second teacher cannot dog-pile an active retrieval');
assert.equal(markEscapePlayerCaught('Mr. Davis', now + 2), false, 'the unassigned teacher abandons the chase');
assert.equal(markEscapePlayerCaught('Ms. Harper', now + 2), true);

let carried = advanceCarriedPlayer(now + 2.1, ESCAPE_SAFE_POINT.clone(), 0.1);
assert.equal(carried.released, true, 'the player is released immediately at the safe point');
assert.equal(carried.strikes, 1);
assert.equal(getEscapeRetrievalSnapshot().phase, 'grace');
assert.equal(beginEscapeRetrieval(now + 3, [-11, 0, 11]).phase, 'grace', 'the player cannot be immediately reacquired');
retrieval = updateEscapeGrace(now + 2.1 + ESCAPE_GRACE_SECONDS + 0.1);
assert.equal(retrieval.phase, 'idle', 'the grace period ends cleanly');
assert.equal(beginEscapeRetrieval(now + 20, [18, 0, 0]).assignedTeacher, 'Mr. Davis', 'a later escape can begin again');

resetEscapeRetrieval(true);
for (let strike = 1; strike <= ESCAPE_PENALTY_STRIKE; strike += 1) {
  now += 20;
  const assignment = beginEscapeRetrieval(now, strike % 2 ? [-11, 0, 11] : [18, 0, 0]);
  assert.equal(markEscapePlayerCaught(assignment.assignedTeacher!, now + 1), true);
  carried = advanceCarriedPlayer(now + 1.1, new THREE.Vector3(...ESCAPE_SAFE_POINT.toArray()), 0.1);
  assert.equal(carried.penalty, strike === ESCAPE_PENALTY_STRIKE, 'only the seventh capture triggers the lighthearted consequence');
  updateEscapeGrace(now + 1.1 + ESCAPE_GRACE_SECONDS + 0.1);
}

for (const free of ['pickup', 'recess', 'juice-club', 'storybook-lane'] as const) {
  resetEscapeRetrieval(true);
  assert.equal(evaluateScheduleRetrieval(0, free, 'hub', [15, 0, 15]).phase, 'idle', `${free} is free-roam`);
  assert.equal(evaluateScheduleRetrieval(60, free, 'hub', [15, 0, 15]).phase, 'idle', `${free} never starts attendance retrieval`);
}

for (const mandatory of ['breakfast', 'show-and-tell', 'art-time', 'lunch', 'nap'] as const) {
  resetEscapeRetrieval(true);
  assert.equal(evaluateScheduleRetrieval(0, mandatory, 'hub', [15, 0, 15]).phase, 'idle', `${mandatory} begins with travel grace`);
  const assigned = evaluateScheduleRetrieval(SCHEDULE_DETECTION_GRACE_SECONDS + .1, mandatory, 'hub', [15, 0, 15]);
  assert.equal(assigned.phase, 'chasing', `${mandatory} assigns a retriever after grace`);
  assert.equal(markEscapePlayerCaught(assigned.assignedTeacher!, SCHEDULE_DETECTION_GRACE_SECONDS + 1), true);
  const returned = advanceCarriedPlayer(SCHEDULE_DETECTION_GRACE_SECONDS + 2, new THREE.Vector3(...assigned.returnTarget), .1);
  assert.equal(returned.released, true);
  assert.equal(getEscapeRetrievalSnapshot().graceUntil, SCHEDULE_DETECTION_GRACE_SECONDS + 2 + SCHEDULE_RECAPTURE_GRACE_SECONDS);
}

console.log('DayKare escape retrieval tests passed.');
