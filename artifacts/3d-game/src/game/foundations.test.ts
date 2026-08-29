import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  activateQuest,
  advanceObjective,
  createInitialQuests,
  normalizeQuestStates,
} from './quests';
import { getPortalWaypoints } from './navigation';
import { PLAYER_RADIUS, isWalkable, resolveMovement } from './world';

const migratedFound = normalizeQuestStates(undefined, 'found', []);
assert.equal(migratedFound['where-binky'].currentObjectiveId, 'return-binky');
assert.equal(migratedFound['where-binky'].objectiveStates['search-storage'], 'complete');

const migratedComplete = normalizeQuestStates(undefined, 'returned-good', ['keepsake']);
assert.equal(migratedComplete['where-binky'].status, 'complete');
assert.equal(migratedComplete['rainbow-tidy-up'].status, 'active');

const interrupted = normalizeQuestStates({
  'where-binky': {
    status: 'active',
    currentObjectiveId: null,
    objectiveStates: {
      'talk-to-leo': 'complete',
      'ask-mia': 'complete',
      'trade-with-sam': 'complete',
      'search-storage': 'complete',
      'return-binky': 'pending',
    },
  },
}, 'found', []);
assert.equal(interrupted['where-binky'].currentObjectiveId, 'return-binky');
assert.equal(interrupted['where-binky'].objectiveStates['return-binky'], 'active');

let quests = createInitialQuests();
quests = advanceObjective(quests, 'where-binky', 'talk-to-leo');
assert.equal(quests['where-binky'].currentObjectiveId, 'ask-mia');
const unchanged = advanceObjective(quests, 'where-binky', 'return-binky');
assert.equal(unchanged, quests);
quests = activateQuest(quests, 'rainbow-tidy-up');
assert.equal(quests['rainbow-tidy-up'].currentObjectiveId, 'collect-blue-block');

const wallSlideStart = new THREE.Vector3(7.1, 0, 4);
const wallSlideDesired = new THREE.Vector3(9, 0, 2.6);
const wallSlideResult = resolveMovement(wallSlideStart, wallSlideDesired, PLAYER_RADIUS);
assert.ok(wallSlideResult.x < 7.4, 'divider blocks traversal outside the doorway');
assert.ok(wallSlideResult.z < wallSlideStart.z, 'axis separation still permits wall sliding');

const doorwayStart = new THREE.Vector3(7.1, 0, 0);
const doorwayResult = resolveMovement(doorwayStart, new THREE.Vector3(9, 0, 0), PLAYER_RADIUS);
assert.ok(doorwayResult.x > 8.5, 'authored doorway remains traversable');
assert.ok(isWalkable(doorwayResult, PLAYER_RADIUS));

const route = getPortalWaypoints(new THREE.Vector3(0, 0, 0), new THREE.Vector3(12, 0, 5));
assert.equal(route[0].x, 7.1);
assert.equal(route.at(-1)?.x, 12);

console.log('DayKare foundation checks passed');