import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { advanceRide, releaseRideable, riderFor, tryClaimRideable } from './rideables';
import { commitSocialAction, currentApproacher, decideSocialAction, releaseApproach } from './npcSocial';
import { useIsRainy } from './WeatherSystem';
import { CharacterModel, type CharacterModelProps } from './CharacterModel';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { clearNpcNavigation, getNavigationTarget, registerNpcPosition } from './navigation';
import { useGameStore, type JuiceClubCustomerPhase } from './store';
import { advanceLogicalPosition, capabilitiesForTier, tierIntervalMs } from './npcTiers';
import { reportNpc, resetNpcTiers, tierFor, updateNpcTiers } from './npcTierRegistry';
import { useQualitySettings } from './useQualitySettings';
import { resolveMovement } from './world';
import { playGameSound } from './audio';
import { objectiveIsActive } from './quests';
import {
  activitySessionIsInterrupted,
  getSharedActivitySession,
  reportSessionArrival,
  sessionParticipant,
  sessionSlotVector,
  shouldUseSessionSlot,
  type SharedActivityParticipant,
} from './activitySessions';
import { shouldUpdateOptionalAnimation } from './performanceTelemetry';
import {
  getChildIntervention,
  getTeacherIntervention,
  getTeacherSupervisionTarget,
  interventionIsActive,
  resetTeacherInterventions,
  teacherInterventionDestination,
  updateChildBehavior,
  type TeacherScanProfile,
  type TeacherInterventionState,
} from './teacherInterventions';
import {
  childActivityPosition,
  getChildActivityPlan,
  type ChildActivityPlan,
} from './npcActivities';

type KidDefinition = {
  name: string;
  color: string;
  accent: string;
  hairColor: string;
  hairStyle: NonNullable<CharacterModelProps['hairStyle']>;
  skinColor: string;
  defaultPos: [number, number, number];
};

export const KID_CAST: KidDefinition[] = [
  { name: 'Leo', color: '#e65a4f', accent: '#ffd166', hairColor: '#5b352c', hairStyle: 'sprout', skinColor: '#efb58f', defaultPos: [2, 0, 3] },
  { name: 'Mia', color: '#54b9bd', accent: '#f1d985', hairColor: '#3f2927', hairStyle: 'ponytail', skinColor: '#c98562', defaultPos: [-3, 0, 4] },
  { name: 'Sam', color: '#2a9d8f', accent: '#ecb56b', hairColor: '#2f231f', hairStyle: 'curls', skinColor: '#8f5139', defaultPos: [11, 0, -10] },
  { name: 'Zoe', color: '#e9aa45', accent: '#e76f8c', hairColor: '#8d5d2f', hairStyle: 'bob', skinColor: '#f2c4a0', defaultPos: [12, 0, -2] },
  { name: 'Eli', color: '#f08a5d', accent: '#6a8caf', hairColor: '#d0a16d', hairStyle: 'cap', skinColor: '#f2c8a8', defaultPos: [13, 0, 4] },
  { name: 'Noah', color: '#7654bd', accent: '#71d4b4', hairColor: '#4d2c25', hairStyle: 'curls', skinColor: '#b66f50', defaultPos: [5, 0, -5] },
  { name: 'Lily', color: '#db568a', accent: '#8fd0c5', hairColor: '#202334', hairStyle: 'ponytail', skinColor: '#e4aa7f', defaultPos: [-6, 0, -6] },
  { name: 'Finn', color: '#4c82d4', accent: '#f3ca52', hairColor: '#bd7448', hairStyle: 'sprout', skinColor: '#f1bf98', defaultPos: [0, 0, 6] },
  { name: 'Ruby', color: '#e8613c', accent: '#8bc5db', hairColor: '#7a2d2d', hairStyle: 'bob', skinColor: '#d5916b', defaultPos: [-4, 0, 0] },
  { name: 'Max', color: '#e6ae2f', accent: '#4b7f8c', hairColor: '#4b382c', hairStyle: 'cap', skinColor: '#d79b78', defaultPos: [4, 0, 2] },
  { name: 'Mae', color: '#6f62b5', accent: '#f4b65f', hairColor: '#342c45', hairStyle: 'bob', skinColor: '#bd795d', defaultPos: [-1.2, 0, 5.2] },
];

function namePhase(name: string) {
  return [...name].reduce((total, character) => total + character.charCodeAt(0), 0) * 0.37;
}

export interface TeacherPatrolProfile extends TeacherScanProfile {
  speed: number;
  patrolDwell: number;
  scanHold: number;
  scanInterval: number;
}

const TEACHER_PATROL_PROFILES: Record<string, TeacherPatrolProfile> = {
  'Ms. Harper': {
    scanRadius: 8.5,
    crowdRadius: 2.4,
    disruptionWeight: 10,
    speed: 1.38,
    patrolDwell: 2.4,
    scanHold: 2.8,
    scanInterval: 1.15,
  },
  'Mr. Davis': {
    scanRadius: 10.5,
    crowdRadius: 2.8,
    disruptionWeight: 7,
    speed: 1.2,
    patrolDwell: 1.7,
    scanHold: 3.4,
    scanInterval: 1.75,
  },
};

export function teacherPatrolProfile(name: string): TeacherPatrolProfile {
  return TEACHER_PATROL_PROFILES[name] ?? TEACHER_PATROL_PROFILES['Mr. Davis'];
}

/**
 * Ranks the whole cast on an interval and writes each NPC's tier back.
 *
 * One component does this for everyone because the simulation budget belongs
 * to the cast, not to any one child: twenty-five NPCs each deciding "I am near,
 * so I am Tier A" is precisely the moment a phone gives up.
 */
function NpcTierCoordinator() {
  const quality = useQualitySettings();
  useFrame((state) => {
    updateNpcTiers(state.clock.elapsedTime * 1000, {
      animationDistance: quality.settings.npcAnimationDistance,
      simulationDistance: quality.settings.npcSimulationDistance,
      maxFullySimulatedNpcs: quality.settings.maxFullySimulatedNpcs,
    });
  });
  return null;
}

export function NPCs({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  useEffect(() => {
    resetTeacherInterventions();
    return resetTeacherInterventions;
  }, []);
  // The hub's cast leaves with the hub. A stale tier from a previous visit
  // would otherwise decide how a child behaves on the first frame back.
  useEffect(() => resetNpcTiers, []);

  return (
    <group>
      <NpcTierCoordinator />
      <AmbientSocialMoments />
      <JuiceClubQueue />
      <Teacher name="Ms. Harper" color="#457b9d" accent="#e4bd6a" hairColor="#46352f" hairStyle="bob" skinColor="#c98562" defaultPos={[-2, 0, -2]} playerRef={playerRef} />
      <Teacher name="Mr. Davis" color="#355272" accent="#68a9a7" hairColor="#6a4a3c" hairStyle="curls" skinColor="#e6ad88" defaultPos={[10, 0, 0]} playerRef={playerRef} />
      {KID_CAST.map((kid) => <Kid key={kid.name} {...kid} playerRef={playerRef} />)}
    </group>
  );
}

function scheduleDestination(
  schedule: string,
  isRainy: boolean,
  defaultPos: [number, number, number],
  phase: number,
  cycle = 0,
) {
  const slot = (Math.abs(Math.floor(phase * 10)) + cycle) % 6;
  const activitySpots: Record<string, [number, number, number][]> = {
    'morning-play': [
      [-3.4, 0, -0.8], [-2.2, 0, 2.4], [0, 0, 3.4],
      [2.5, 0, 2.2], [3.5, 0, 0.2], [1.8, 0, -1.8],
    ],
    'art-time': [
      [-14.5, 0, -12.8], [-14.5, 0, -10.4], [-12.8, 0, -9.2],
      [-10.4, 0, -9.2], [-9.2, 0, -11.2], [-9.2, 0, -14.4],
    ],
    'juice-club': [
      [0.9, 0, -3.0], [0.6, 0, -1.7], [-0.6, 0, -2.2],
      [-1.6, 0, -1.0], [0.8, 0, 0.2], [-2.2, 0, 0.5],
    ],
    pickup: [
      [-9.2, 0, -5.2], [-9.2, 0, -3.2], [-9.2, 0, -1.2],
      [-9.2, 0, 1.2], [-9.2, 0, 3.2], [-9.2, 0, 5.2],
    ],
  };
  if (schedule === 'outdoor-play' && isRainy) {
    const rainySpots: [number, number, number][] = [
      [3.6, 0, -6.7], [3.4, 0, -5.1], [1.8, 0, -6.2],
      [1.1, 0, -4.8], [-1.6, 0, -5.6], [-3.4, 0, -5.2],
    ];
    return new THREE.Vector3(...rainySpots[slot]);
  }
  if (schedule === 'outdoor-play') {
    const playgroundSpots: [number, number, number][] = [
      [10, 0, -11.5], [14.1, 0, -9], [10.1, 0, -2.2],
      [14.3, 0, 0.5], [14.5, 0, 8.7], [9.5, 0, 10.5],
    ];
    return new THREE.Vector3(...playgroundSpots[slot]);
  }
  const spots = activitySpots[schedule];
  return spots ? new THREE.Vector3(...spots[slot]) : new THREE.Vector3(...defaultPos);
}

function smoothTurn(ref: THREE.Group, target: THREE.Vector3, delta: number) {
  const offset = target.clone().sub(ref.position).setY(0);
  if (offset.lengthSq() < 0.001) return;
  const targetAngle = facingAngleForDirection(offset);
  const difference = THREE.MathUtils.euclideanModulo(targetAngle - ref.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
  ref.rotation.y += difference * (1 - Math.exp(-8 * delta));
}

export function facingAngleForDirection(direction: THREE.Vector3) {
  const flatDirection = direction.clone().setY(0);
  if (flatDirection.lengthSq() < 0.0001) return 0;
  // CharacterModel's face is local -Z, matching the Player's locomotion heading.
  return Math.atan2(-flatDirection.x, -flatDirection.z);
}

export function stepNpc(
  id: string,
  ref: THREE.Group,
  destination: THREE.Vector3,
  player: THREE.Group | null,
  delta: number,
  speed: number,
  zone: 'hub' | 'garden' = 'hub',
) {
  const navTarget = getNavigationTarget(id, ref.position, destination, zone);
  const direction = navTarget.clone().sub(ref.position).setY(0);
  if (player) {
    const fromPlayer = ref.position.clone().sub(player.position).setY(0);
    const playerDistance = fromPlayer.length();
    if (playerDistance < 1.2 && playerDistance > 0.001) direction.add(fromPlayer.normalize().multiplyScalar(1.2 - playerDistance));
  }
  if (direction.lengthSq() < 0.002) return false;
  direction.normalize();
  const desired = ref.position.clone().addScaledVector(direction, Math.min(speed * delta, ref.position.distanceTo(navTarget)));
  const movement = resolveNpcMovement(ref.position, desired, zone);
  ref.position.copy(movement.position);
  // Face the displacement that actually survived collision resolution. Turning
  // toward the requested waypoint here causes visible moonwalking at walls.
  if (movement.displacement.lengthSq() > 0.000001) {
    const facingPoint = ref.position.clone().add(movement.displacement);
    smoothTurn(ref, facingPoint, delta);
  }
  return movement.displacement.lengthSq() > 0.000001;
}

/** Pure collision result used by NPC locomotion and focused movement tests. */
export function resolveNpcMovement(
  current: THREE.Vector3,
  desired: THREE.Vector3,
  zone: 'hub' | 'garden' = 'hub',
) {
  const position = resolveMovement(current, desired, 0.34, 0.24, zone);
  return { position, displacement: position.clone().sub(current).setY(0) };
}

function Teacher({
  name, color, accent, hairColor, hairStyle, skinColor, defaultPos, playerRef,
}: {
  name: string;
  color: string;
  accent: string;
  hairColor: string;
  hairStyle: NonNullable<CharacterModelProps['hairStyle']>;
  skinColor: string;
  defaultPos: [number, number, number];
  playerRef: React.RefObject<THREE.Group | null>;
}) {
  const ref = useRef<THREE.Group>(null);
  const schedule = useGameStore((state) => state.schedule);
  const isRainy = useIsRainy();
  const suspicion = useGameStore((state) => state.teacherSuspicion);
  const imagination = useGameStore((state) => state.isImaginationMode);
  const activeDialogue = useGameStore((state) => state.activeDialogue);
  const active = useGameStore((state) => state.activeInteractable === `teacher-${name}`);
  const mirror = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const suspicionAccumulator = useRef(0);
  useEffect(() => registerNpcPosition(`teacher-${name}`, mirror), [name, mirror]);
  const candidate = useMemo(() => ({
    id: `teacher-${name}`,
    position: mirror,
    range: 2.35,
    priority: 48,
    valid: true,
  }), [mirror, name]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  const destination = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const profile = teacherPatrolProfile(name);
  const patrol = useRef<{
    key: string;
    index: number;
    dwellUntil: number;
    nextScanAt: number;
    scanUntil: number;
    scanTarget: THREE.Vector3 | null;
  }>({ key: '', index: 0, dwellUntil: 0, nextScanAt: 0, scanUntil: 0, scanTarget: null });
  const lastPosition = useRef(new THREE.Vector3(...defaultPos));
  const stuckFor = useRef(0);
  /** When this teacher last paid for real pathfinding. Tier B throttles on it. */
  const lastTeacherPathAt = useRef(0);
  const quality = useQualitySettings();
  const [isSupervising, setIsSupervising] = useState(false);
  const supervisingRef = useRef(false);
  const [intervention, setIntervention] = useState<TeacherInterventionState>(
    () => getTeacherIntervention(`hub:${name}`, 0),
  );
  const interventionKey = useRef('observing:0');
  const announcementKey = useRef('');
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const game = useGameStore.getState();
    const liveIntervention = getTeacherIntervention(
      `hub:${name}`,
      state.clock.elapsedTime,
      !game.activeDialogue && !game.journalOpen && !game.zoneTransitioning,
    );
    const nextInterventionKey = `${liveIntervention.phase}:${liveIntervention.sequence}:${liveIntervention.targetName ?? ''}`;
    if (nextInterventionKey !== interventionKey.current) {
      interventionKey.current = nextInterventionKey;
      setIntervention(liveIntervention);
    }
    if (
      liveIntervention.phase === 'calling-player'
      && announcementKey.current !== nextInterventionKey
      && !game.activeDialogue
      && !game.journalOpen
      && !game.zoneTransitioning
    ) {
      announcementKey.current = nextInterventionKey;
      const announcement = liveIntervention.escalated
        ? `${name} asks you to help reset the play space.`
        : `${name} is helping a friend choose calmer play.`;
      game.setAmbientMessage(announcement);
      if (announcementTimer.current) clearTimeout(announcementTimer.current);
      announcementTimer.current = setTimeout(() => {
        const latest = useGameStore.getState();
        if (!latest.activeDialogue && latest.ambientMessage === announcement) {
          latest.setAmbientMessage(null);
        }
      }, 2800);
    }
    // Teachers now participate in the Phase 4A simulation tiers. They were the
    // only cast members exempt, so two of the most expensive NPCs in the hub -
    // both running supervision scans over every child - paid full cost at any
    // distance, which quietly ate the budget the child tiers were saving.
    const teacherDistance = playerRef.current
      ? ref.current.position.distanceTo(playerRef.current.position)
      : 0;
    reportNpc({
      id: `teacher-${name}`,
      distance: teacherDistance,
      visible: teacherDistance <= 30,
      // An intervention aimed at the player, or a teacher you are talking to,
      // must never be downgraded mid-sentence.
      engaged: active || interventionIsActive(liveIntervention),
    });
    const teacherTier = tierFor(`teacher-${name}`);
    const teacherCapabilities = capabilitiesForTier(teacherTier);

    const key = `${schedule}:${isRainy}`;
    const spots = teacherPatrolSpots(name, schedule, isRainy, defaultPos);
    if (patrol.current.key !== key) {
      patrol.current = { key, index: 0, dwellUntil: 0, nextScanAt: state.clock.elapsedTime, scanUntil: 0, scanTarget: null };
      stuckFor.current = 0;
    }
    const interventionTarget = teacherInterventionDestination(liveIntervention, ref.current.position);
    if (!interventionTarget && state.clock.elapsedTime >= patrol.current.nextScanAt) {
      const scan = getTeacherSupervisionTarget(
        `hub:${name}`,
        state.clock.elapsedTime,
        ref.current.position,
        profile,
      );
      patrol.current.scanTarget = scan?.position.clone() ?? null;
      patrol.current.scanUntil = scan
        ? state.clock.elapsedTime + profile.scanHold
        : state.clock.elapsedTime + profile.scanInterval;
      patrol.current.nextScanAt = state.clock.elapsedTime + profile.scanInterval;
    }
    const scanTarget = !interventionTarget && patrol.current.scanTarget
      && state.clock.elapsedTime < patrol.current.scanUntil
      ? patrol.current.scanTarget
      : null;
    if (interventionTarget) destination.copy(interventionTarget);
    else if (scanTarget) destination.copy(scanTarget);
    else destination.set(...spots[patrol.current.index % spots.length]);
    const arrived = ref.current.position.distanceTo(destination) < 0.48;
    if (!interventionTarget && !scanTarget && arrived && patrol.current.dwellUntil === 0) {
      patrol.current.dwellUntil = state.clock.elapsedTime + profile.patrolDwell + (namePhase(name) % 0.8);
    } else if (!interventionTarget && !scanTarget && arrived && state.clock.elapsedTime >= patrol.current.dwellUntil) {
      patrol.current.index = (patrol.current.index + 1) % spots.length;
      patrol.current.dwellUntil = 0;
    }
    const supervising = interventionIsActive(liveIntervention)
      || Boolean(scanTarget)
      || arrived && patrol.current.dwellUntil > state.clock.elapsedTime;
    if (supervising !== supervisingRef.current) {
      if (supervising) {
        if (game.zone === 'hub' && !game.activeDialogue && !game.journalOpen && !game.zoneTransitioning) {
          playGameSound('arrival');
        }
      }
      supervisingRef.current = supervising;
      setIsSupervising(supervising);
    }
    if (active && playerRef.current) {
      smoothTurn(ref.current, playerRef.current.position, delta);
    } else if (!arrived) {
      const teacherNowMs = state.clock.elapsedTime * 1000;
      const teacherInterval = tierIntervalMs(teacherTier, quality.settings.distantNpcIntervalMs);
      const teacherPathDue = teacherInterval === 0
        || teacherNowMs - lastTeacherPathAt.current >= teacherInterval;
      if (teacherCapabilities.pathfinding && teacherPathDue) {
        lastTeacherPathAt.current = teacherNowMs;
        stepNpc(`teacher-${name}`, ref.current, destination, playerRef.current, delta, profile.speed);
      } else {
        // Same coasting rule the children use: keep walking the straight line,
        // just stop paying for pathfinding and separation. Supervision itself is
        // never skipped - a teacher who stopped noticing children at distance
        // would be a gameplay change, not a performance one.
        const [tx, , tz] = advanceLogicalPosition(
          [ref.current.position.x, ref.current.position.y, ref.current.position.z],
          [destination.x, destination.y, destination.z],
          profile.speed,
          delta,
        );
        ref.current.position.x = tx;
        ref.current.position.z = tz;
      }
      const moved = ref.current.position.distanceTo(lastPosition.current);
      stuckFor.current = moved < 0.002 ? stuckFor.current + delta : 0;
      if (stuckFor.current > 2.8) {
        patrol.current.index = (patrol.current.index + 1) % spots.length;
        patrol.current.dwellUntil = 0;
        stuckFor.current = 0;
      }
    } else if (interventionTarget || scanTarget) {
      smoothTurn(ref.current, interventionTarget ?? scanTarget ?? destination, delta);
    }
    lastPosition.current.copy(ref.current.position);
    mirror.copy(ref.current.position);
    updateInteractionCandidate(`teacher-${name}`, {
      position: mirror,
      priority: liveIntervention.phase === 'calling-player' ? 62 : 48,
      urgentPriority: liveIntervention.phase === 'calling-player',
      valid: true,
    });

    if (name === 'Ms. Harper' && playerRef.current) {
      suspicionAccumulator.current += delta;
      if (suspicionAccumulator.current < 0.1) return;
      const suspicionDelta = suspicionAccumulator.current;
      suspicionAccumulator.current = 0;
      const inStorage = playerRef.current.position.x < -8 && playerRef.current.position.z > 8;
      const store = useGameStore.getState();
      const storageAuthorized = objectiveIsActive(store.quests, 'where-binky', 'search-storage')
        || (
          (store.caper.step === 'retrieve' || store.caper.step === 'escape')
          && store.caper.teacherApproved
          && store.caper.patrolObserved
          && store.caper.setupReady
        );
      if (inStorage && !storageAuthorized) {
        store.setTeacherSuspicion((current) => {
          const next = current + suspicionDelta * 20;
          if (next >= 100) {
            store.triggerTeleport();
            store.setActiveDialogue({
              name: 'Ms. Harper',
              text: 'Storage is adults-only. A Helper Pass lets you help at the Lost & Found shelf, not enter this room. Let’s head back together.',
            });
            return 0;
          }
          return Math.min(100, next);
        });
      } else {
        store.setTeacherSuspicion((current) => Math.max(0, current - suspicionDelta * 10));
      }
      if (suspicion > 0) ref.current.lookAt(playerRef.current.position);
    }
  });

  useEffect(() => () => {
    if (announcementTimer.current) clearTimeout(announcementTimer.current);
  }, []);

  return (
    <group ref={ref} position={defaultPos}>
      <group scale={1.28}>
        <CharacterModel
          bodyColor={color}
          accentColor={accent}
          hairColor={hairColor}
          hairStyle={hairStyle}
          skinColor={skinColor}
          mood="curious"
          isTeacher
          isTalking={activeDialogue?.name === name || intervention.phase === 'warning' || intervention.phase === 'calling-player' || Boolean(isSupervising && !interventionIsActive(intervention))}
          imaginationMode={imagination}
          motionSeed={namePhase(name)}
          idleEnergy={0.55}
          idleVariant={interventionIsActive(intervention) ? 'fidget' : name === 'Mr. Davis' ? 'look-around' : 'sway'}
           activityMode={interventionIsActive(intervention) ? 'intervening' : isSupervising ? 'gathering' : 'standing'}
           activitySignal={interventionIsActive(intervention) ? intervention.phase : isSupervising ? 'supervising' : 'patrolling'}
        />
      </group>
      {isSupervising && (
        interventionIsActive(intervention)
          ? <InterventionProp phase={intervention.phase} />
          : <TeacherProp name={name} schedule={schedule} />
      )}
       {isSupervising && !interventionIsActive(intervention) && <TeacherScanCue />}
    </group>
  );
}

export function teacherPatrolSpots(
  name: string,
  schedule: string,
  isRainy: boolean,
  defaultPos: [number, number, number],
): [number, number, number][] {
  if (name === 'Ms. Harper') {
    if (schedule === 'art-time') return [[-9.7, 0, -10], [-9.2, 0, -13.8]];
    if (schedule === 'outdoor-play' && !isRainy) return [[10, 0, -2], [12, 0, 10.8]];
    if (schedule === 'pickup') return [[-6, 0, -1.6], [-6, 0, 2]];
    return [defaultPos, [-4.5, 0, 2.8]];
  }
  if (schedule === 'art-time') return [[-9.4, 0, -9.8], [-9.4, 0, -14.2], [-12, 0, -7]];
  if (schedule === 'juice-club') return [[5.2, 0, -3], [5.2, 0, -0.8], [1.2, 0, 1.5]];
  if (schedule === 'outdoor-play' && !isRainy) return [[10, 0, 10], [14.8, 0, 5.5], [14, 0, -8.5], [10, 0, -12]];
  if (schedule === 'outdoor-play') return [[2, 0, -5.2], [2.2, 0, -5.8], [-2, 0, -5.6]];
  if (schedule === 'pickup') return [[-9.3, 0, 4.5], [-9.3, 0, 0], [-9.3, 0, -4.5]];
  return [[4.8, 0, 3.8], [5.3, 0, -1.2], [7, 0, 0]];
}

function Kid({
  name, color, accent, hairColor, hairStyle, skinColor, defaultPos, playerRef,
}: KidDefinition & { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const schedule = useGameStore((state) => state.schedule);
  const isRainy = useIsRainy();
  const imagination = useGameStore((state) => state.isImaginationMode);
  const activeDialogue = useGameStore((state) => state.activeDialogue);
  const active = useGameStore((state) => state.activeInteractable === `kid-${name}`);
  const mood = useGameStore((state) => state.friends[name]?.mood ?? 'happy');
  const waitingCustomers = useGameStore((state) => state.waitingCustomers);
  const servedCustomer = useGameStore((state) => state.juiceClubServedCustomer);
  const juiceClubPhase = useGameStore((state) => state.juiceClubCustomerPhase);
  const activeJuiceClubCustomer = useGameStore((state) => state.juiceClubActiveCustomer);
  const reportJuiceClubArrival = useGameStore((state) => state.reportJuiceClubArrival);
  const quests = useGameStore((state) => state.quests);
  const journalOpen = useGameStore((state) => state.journalOpen);
  const zoneTransitioning = useGameStore((state) => state.zoneTransitioning);
  const [settled, setSettled] = useState(false);
  const [sessionVisual, setSessionVisual] = useState<SharedActivityParticipant | null>(null);
  const sessionVisualRef = useRef<SharedActivityParticipant | null>(null);
  const settledRef = useRef(false);
  const [childIntervention, setChildIntervention] = useState<ReturnType<typeof getChildIntervention>>(null);
  const childInterventionKey = useRef('');
  const greetingClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    // Without this, a child unmounting mid-ride (a zone change, a quality
    // change that remounts the cast) leaves its claim behind and that trike is
    // never available again.
    releaseRideable(name, 0);
    releaseApproach(name);
  }, [name]);
  // The wave animation already existed in CharacterModel but nothing ever
  // triggered it in response to the player. This is that trigger.
  const ridingRef = useRef(false);
  const [riding, setRiding] = useState(false);
  const socialReactionRef = useRef<{ reaction: 'wave' | 'cheer' | 'listen' | null; until: number }>({
    reaction: null,
    until: 0,
  });
  const [socialReaction, setSocialReaction] = useState<'wave' | 'cheer' | 'listen' | null>(null);
  const phase = useMemo(() => namePhase(name), [name]);
  const mirror = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const activityTarget = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const activityFocus = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const quality = useQualitySettings();
  const activityState = useRef({
    key: '',
    dwellUntil: 0,
    arrived: false,
    cycle: 0,
    stuckFor: 0,
    replanAttempts: 0,
    fallbackSessionId: null as string | null,
    lastPosition: new THREE.Vector3(...defaultPos),
    /** When this child last paid for real pathfinding. Tier B throttles on it. */
    lastPathAt: 0,
  });
  const candidate = useMemo(() => ({
    id: `kid-${name}`,
    position: mirror,
    range: 2.1,
    priority: name === 'Leo' || name === 'Mia' || name === 'Sam' ? 55 : 35,
    questPriority: questPriorityForKid(name, quests),
    valid: true,
  }), [mirror, name, quests]);
  useEffect(() => registerNpcPosition(`kid-${name}`, mirror), [mirror, name]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useEffect(() => () => {
    if (greetingClearTimer.current) clearTimeout(greetingClearTimer.current);
  }, []);

  useFrame((state, delta) => {
    if (!ref.current) return;

    // Report where this child is, then read the tier the coordinator assigned.
    // The report is two cheap numbers; the ranking happens elsewhere, for
    // everyone at once, on an interval.
    const distanceToPlayer = playerRef.current
      ? ref.current.position.distanceTo(playerRef.current.position)
      : 0;
    const engaged = active || servedCustomer === name || activeJuiceClubCustomer === name;
    reportNpc({
      id: `kid-${name}`,
      distance: distanceToPlayer,
      // No frustum test yet: `active` already covers the case that matters
      // (the player is engaging this child), and a wrong visibility guess is
      // worse than a conservative one.
      visible: distanceToPlayer <= 30,
      engaged,
    });
    const tier = tierFor(`kid-${name}`);
    const capabilities = capabilitiesForTier(tier);

    const questRequired = questPriorityForKid(name, quests);
    const currentPlan = getChildActivityPlan(name, schedule, isRainy, activityState.current.cycle, phase);
    const liveChildIntervention = getChildIntervention(name, state.clock.elapsedTime);
    const sharedSession = getSharedActivitySession(
      'hub',
      schedule,
      state.clock.elapsedTime,
      activitySessionIsInterrupted({ activeDialogue, journalOpen, zoneTransitioning, questPriority: questRequired }),
    );
    const participant = sessionParticipant(sharedSession, name);
    const visibleParticipant = sharedSession?.phase === 'active' ? participant : null;
    const movementParticipant = shouldUseSessionSlot(
      sharedSession,
      participant,
      activityState.current.fallbackSessionId,
    ) ? participant : null;
    if (movementParticipant) activityFocus.set(...movementParticipant.focus);
    else activityFocus.set(...currentPlan.focus);
    if (
      visibleParticipant?.activity !== sessionVisualRef.current?.activity
      || visibleParticipant?.reaction !== sessionVisualRef.current?.reaction
      || (!visibleParticipant && sessionVisualRef.current)
    ) {
      sessionVisualRef.current = visibleParticipant;
      setSessionVisual(visibleParticipant);
    }
    const activityKey = `${schedule}:${isRainy}:${servedCustomer ?? ''}:${activeJuiceClubCustomer ?? ''}:${juiceClubPhase}:${questRequired}:${sharedSession?.id ?? ''}:${sharedSession?.phase ?? ''}:${sharedSession?.startsAt ?? ''}:${liveChildIntervention?.phase ?? ''}`;
    if (activityState.current.key !== activityKey) {
      activityState.current.key = activityKey;
      activityState.current.dwellUntil = 0;
      activityState.current.arrived = false;
      activityState.current.cycle = 0;
      activityState.current.stuckFor = 0;
      activityState.current.replanAttempts = 0;
      activityState.current.fallbackSessionId = null;
      activityTarget.copy(
        questRequired
          ? new THREE.Vector3(...defaultPos)
          : movementParticipant
            ? sessionSlotVector(movementParticipant)
            : schedule === 'juice-club'
              ? kidDestination(name, schedule, isRainy, defaultPos, phase, 0, waitingCustomers, servedCustomer, juiceClubPhase, activeJuiceClubCustomer)
              : childActivityPosition(getChildActivityPlan(name, schedule, isRainy, 0, phase)),
      );
    }
    let distanceToActivity = ref.current.position.distanceTo(activityTarget);
    if (schedule === 'juice-club' && !questRequired) {
      const queueTarget = kidDestination(name, schedule, isRainy, defaultPos, phase, activityState.current.cycle, waitingCustomers, servedCustomer, juiceClubPhase, activeJuiceClubCustomer);
      if (queueTarget.distanceToSquared(activityTarget) > 0.01) {
        activityTarget.copy(queueTarget);
        activityState.current.arrived = false;
        activityState.current.dwellUntil = 0;
        distanceToActivity = ref.current.position.distanceTo(activityTarget);
      }
    }
    if (!questRequired && liveChildIntervention?.destination) {
      if (liveChildIntervention.destination.distanceToSquared(activityTarget) > 0.01) {
        activityTarget.copy(liveChildIntervention.destination);
        activityState.current.arrived = false;
        activityState.current.dwellUntil = 0;
      }
      distanceToActivity = ref.current.position.distanceTo(activityTarget);
    }

    // Ride-ons. A child on a tricycle overrides its station target with the
    // ride's own waypoint loop; everything downstream - pathfinding, tier
    // coasting, stuck detection - is unchanged, which is why this is an
    // override rather than a parallel movement path.
    //
    // Claiming only happens outdoors, off-quest, and away from a teacher
    // intervention, so a ride can never interrupt something that matters.
    let mountedRide = false;
    let rideSpeed = 1.15;
    if (!questRequired && !liveChildIntervention) {
      const seconds = state.clock.elapsedTime;
      const existing = riderFor(name);
      if (
        !existing
        && schedule === 'outdoor-play'
        && !isRainy
        && capabilities.pathfinding
        && ref.current.position.x > 8.6
      ) {
        tryClaimRideable(name, [ref.current.position.x, ref.current.position.z], seconds);
      }
      if (riderFor(name)) {
        const rideTarget = advanceRide(
          name,
          seconds,
          ref.current.position.distanceTo(activityTarget) < 0.6,
          1.15,
        );
        if (rideTarget) {
          activityTarget.set(rideTarget.position[0], 0, rideTarget.position[1]);
          distanceToActivity = ref.current.position.distanceTo(activityTarget);
          mountedRide = rideTarget.mounted;
          rideSpeed = rideTarget.speed;
          activityState.current.arrived = false;
          activityState.current.dwellUntil = 0;
        }
      }
    }
    if (ridingRef.current !== mountedRide) {
      ridingRef.current = mountedRide;
      setRiding(mountedRide);
    }
    if (distanceToActivity < 0.48 && !activityState.current.arrived) {
      activityState.current.arrived = true;
      activityState.current.dwellUntil = questRequired
        ? Number.POSITIVE_INFINITY
        : visibleParticipant
          ? sharedSession?.endsAt ?? state.clock.elapsedTime + currentPlan.duration
          : state.clock.elapsedTime + (movementParticipant ? Math.min(currentPlan.duration, 2.5) : currentPlan.duration);
    }
    if (active && playerRef.current) {
      smoothTurn(ref.current, playerRef.current.position, delta);
    } else if (distanceToActivity >= 0.48) {
      activityState.current.arrived = false;
      // Tier B is "reduced frequency", and it has to actually BE that. Running
      // the same pathfinding every frame and merely skipping greetings would
      // make B a rename rather than a saving - which is what an earlier draft
      // of this did, and what the tier benchmark caught.
      const nowMs = state.clock.elapsedTime * 1000;
      const pathInterval = tierIntervalMs(tier, quality.settings.distantNpcIntervalMs);
      const pathfindDue = pathInterval === 0
        || nowMs - activityState.current.lastPathAt >= pathInterval;
      if (capabilities.pathfinding && pathfindDue) {
        activityState.current.lastPathAt = nowMs;
        stepNpc(`kid-${name}`, ref.current, activityTarget, playerRef.current, delta, mountedRide ? rideSpeed : 1.15);
      } else {
        // Coasting: Tier C always, and Tier B between its pathfinding ticks.
        // Still walking, just not paying for pathfinding or collision.
        // Not teleported (an NPC that snaps across the room the instant you
        // look is a bug you can see) and not frozen (one standing in a doorway
        // an hour after story time is another). The straight line across a room
        // nobody is watching is the cheapest thing that stays believable, and
        // arrival below is unchanged - so shared sessions still advance.
        const [nx, , nz] = advanceLogicalPosition(
          [ref.current.position.x, ref.current.position.y, ref.current.position.z],
          [activityTarget.x, activityTarget.y, activityTarget.z],
          mountedRide ? rideSpeed : 1.15,
          delta,
        );
        ref.current.position.x = nx;
        ref.current.position.z = nz;
      }
      const moved = ref.current.position.distanceTo(activityState.current.lastPosition);
      activityState.current.stuckFor = moved < 0.002
        ? activityState.current.stuckFor + delta
        : 0;
      if (activityState.current.stuckFor > 2.8) {
        clearNpcNavigation(`kid-${name}`);
        activityState.current.replanAttempts += 1;
        activityState.current.stuckFor = 0;
        if (movementParticipant) {
          activityTarget.copy(sessionSlotVector(movementParticipant));
        } else if (activityState.current.replanAttempts >= 2) {
          activityState.current.cycle += 1;
          activityState.current.replanAttempts = 0;
          activityTarget.copy(
            schedule === 'juice-club'
              ? kidDestination(name, schedule, isRainy, defaultPos, phase, activityState.current.cycle, waitingCustomers, servedCustomer, juiceClubPhase, activeJuiceClubCustomer)
              : childActivityPosition(getChildActivityPlan(name, schedule, isRainy, activityState.current.cycle, phase)),
          );
        }
      }
    } else if (!visibleParticipant && state.clock.elapsedTime >= activityState.current.dwellUntil) {
      if (movementParticipant && sharedSession?.phase === 'gathering') {
        activityState.current.fallbackSessionId = sharedSession.id;
      }
      activityState.current.cycle += 1;
      activityState.current.arrived = false;
      activityState.current.dwellUntil = 0;
      activityTarget.copy(
        schedule === 'juice-club'
          ? kidDestination(name, schedule, isRainy, defaultPos, phase, activityState.current.cycle, waitingCustomers, servedCustomer, juiceClubPhase, activeJuiceClubCustomer)
          : childActivityPosition(getChildActivityPlan(name, schedule, isRainy, activityState.current.cycle, phase)),
      );
    }
    if (!active && distanceToActivity < 0.48) {
      smoothTurn(ref.current, activityFocus, delta);
    }
    if (movementParticipant && distanceToActivity < 0.48 && !active) {
      if (sharedSession?.phase === 'gathering') {
        reportSessionArrival('hub', schedule, sharedSession.id, name, state.clock.elapsedTime);
      }
    }
    if (
      schedule === 'juice-club'
      && activeJuiceClubCustomer === name
      && distanceToActivity < 0.48
      && (juiceClubPhase === 'entry' || juiceClubPhase === 'queue' || juiceClubPhase === 'service' || juiceClubPhase === 'departure')
    ) {
      reportJuiceClubArrival(name, juiceClubPhase);
    }
    const settled = activityState.current.arrived
      && state.clock.elapsedTime < activityState.current.dwellUntil
      && distanceToActivity < 0.48;
    const behaviorActivity = visibleParticipant?.activity
      ?? (settled ? currentPlan.activity : 'walking');
    const disruptionWindow = (
      Math.floor(state.clock.elapsedTime / 5)
      + Math.floor(phase)
    ) % 4 === 0;
    updateChildBehavior({
      name,
      position: ref.current.position,
      activity: behaviorActivity,
      disruptive: settled
        && !questRequired
        && !liveChildIntervention
        && disruptionWindow
        && (behaviorActivity === 'toy-play' || behaviorActivity === 'blocks' || behaviorActivity === 'following'),
      questPriority: questRequired,
      updatedAt: state.clock.elapsedTime,
    });
    const nextChildInterventionKey = liveChildIntervention
      ? `${liveChildIntervention.phase}:${liveChildIntervention.reaction}:${liveChildIntervention.destination?.toArray().join(',') ?? ''}`
      : '';
    if (nextChildInterventionKey !== childInterventionKey.current) {
      childInterventionKey.current = nextChildInterventionKey;
      setChildIntervention(liveChildIntervention);
    }
    if (settled !== settledRef.current) {
      if (settled) {
        const game = useGameStore.getState();
        if (game.zone === 'hub' && !game.activeDialogue && !game.journalOpen && !game.zoneTransitioning) {
          const activitySound = currentPlan.activity === 'drawing' || currentPlan.activity === 'coloring'
            ? 'drawing'
            : currentPlan.activity === 'singing' || currentPlan.activity === 'conversation'
              ? 'greeting'
              : currentPlan.activity === 'toy-play' || currentPlan.activity === 'blocks'
                ? 'play'
                : 'arrival';
          playGameSound(activitySound);
        }
      }
      settledRef.current = settled;
      setSettled(settled);
    }
    // Social behaviour. The old rule was one greeting with a MODULE-SCOPE
    // cooldown shared by all eleven children, so the first child to say hello
    // silenced the whole daycare for twelve seconds - the room got quieter the
    // more children were near you. Cooldowns are per child now; see npcSocial.
    if (settled && playerRef.current) {
      const game = useGameStore.getState();
      const decision = decideSocialAction({
        name,
        now: state.clock.elapsedTime,
        distance: distanceToPlayer,
        questActive: hasActiveQuest(quests),
        blocked: game.zone !== 'hub'
          || game.activeDialogue !== null
          || game.journalOpen
          || game.zoneTransitioning
          || game.activeInteractable !== null,
        allowed: capabilities.socialReactions,
        schedule,
        friendship: game.friends[name]?.friendship ?? 0,
      });

      if (decision.action !== 'none') {
        commitSocialAction(name, state.clock.elapsedTime, decision);
        socialReactionRef.current = { reaction: decision.reaction ?? null, until: state.clock.elapsedTime + 2.4 };
        if (decision.message) {
          playGameSound('greeting', 'social');
          game.setAmbientMessage(decision.message);
          if (greetingClearTimer.current) clearTimeout(greetingClearTimer.current);
          const spoken = decision.message;
          greetingClearTimer.current = setTimeout(() => {
            const latest = useGameStore.getState();
            if (latest.zone === 'hub' && latest.ambientMessage === spoken) {
              latest.setAmbientMessage(null);
            }
          }, 3200);
        }
      }
    }

    // A child that decided to come over walks to the player instead of its
    // station, then releases the slot so somebody else may approach later.
    if (currentApproacher(state.clock.elapsedTime) === name) {
      if (distanceToPlayer < 1.9 || !playerRef.current) {
        releaseApproach(name);
      }
    }
    {
      const live = state.clock.elapsedTime < socialReactionRef.current.until
        ? socialReactionRef.current.reaction
        : null;
      if (live !== socialReaction) setSocialReaction(live);
    }

    activityState.current.lastPosition.copy(ref.current.position);
    mirror.copy(ref.current.position);
    updateInteractionCandidate(`kid-${name}`, {
      position: mirror,
      valid: true,
      questPriority: questPriorityForKid(name, useGameStore.getState().quests),
    });
  });

  const renderedPlan: ChildActivityPlan = getChildActivityPlan(
    name,
    schedule,
    isRainy,
    activityState.current.cycle,
    phase,
  );
  return (
    <group ref={ref} position={defaultPos}>
      {/* The trike a child is currently riding. Drawn under the character and
          lifted slightly so the rider sits on it rather than in it. */}
      {riding && (
        <group position={[0, 0.16, 0]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <boxGeometry args={[0.36, 0.12, 0.62]} />
            <meshStandardMaterial color={accent} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.14, -0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.15, 0.15, 0.07, 10]} />
            <meshStandardMaterial color="#3b3b45" />
          </mesh>
          <mesh position={[-0.19, 0.1, 0.26]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.11, 0.11, 0.06, 10]} />
            <meshStandardMaterial color="#3b3b45" />
          </mesh>
          <mesh position={[0.19, 0.1, 0.26]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.11, 0.11, 0.06, 10]} />
            <meshStandardMaterial color="#3b3b45" />
          </mesh>
        </group>
      )}
      <CharacterModel
        bodyColor={imagination ? '#ff006e' : color}
        accentColor={accent}
        hairColor={hairColor}
        hairStyle={hairStyle}
        skinColor={skinColor}
        mood={childIntervention?.reaction === 'sad'
          ? 'sad'
          : settled && sessionVisual?.reaction === 'cheer'
            ? 'excited'
            : mood}
        isTalking={activeDialogue?.name === name || Boolean(
          settled && (sessionVisual?.activity === 'conversation'
            || renderedPlan.activity === 'conversation'
            || renderedPlan.activity === 'singing'),
        )}
        imaginationMode={imagination}
        motionSeed={phase}
        idleEnergy={0.8 + (phase % 0.5)}
        idleVariant={(Math.floor(phase) % 4 === 0
          ? 'look-around'
          : Math.floor(phase) % 4 === 1
            ? 'fidget'
            : Math.floor(phase) % 4 === 2
              ? 'bounce'
              : 'sway')}
        accessory={Math.floor(phase) % 2 === 0 ? 'backpack' : 'badge'}
        activityMode={childIntervention
          ? 'intervening'
          : settled && sessionVisual
            ? sessionActivityMode(sessionVisual)
            : settled
              ? renderedPlan.mode
              : 'walking'}
         activitySignal={childIntervention?.phase
           ?? (settled ? sessionVisual?.activity ?? renderedPlan.activity : 'walking')}
        socialReaction={childIntervention?.reaction === 'sad'
          ? undefined
          // A reaction aimed at the player outranks ambient activity flavour:
          // being waved at is about you, and should not be overwritten by the
          // child's colouring animation.
          : childIntervention?.reaction ?? socialReaction ?? (settled
            ? sessionVisual?.reaction ?? childActivityReaction(renderedPlan)
            : undefined)}
      />
      {!childIntervention && settled && sessionVisual && <SessionProp participant={sessionVisual} />}
      {!childIntervention && settled && !sessionVisual && !questPriorityForKid(name, quests) && (
        <ActivityProp activity={renderedPlan.activity} phase={phase} />
      )}
      {!childIntervention && settled && !questPriorityForKid(name, quests) && <SocialGameMarker schedule={schedule} phase={phase} cycle={activityState.current.cycle} />}
      {!childIntervention && settled && !questPriorityForKid(name, quests) && (
        <ActivityCue activity={sessionVisual?.activity ?? renderedPlan.activity} phase={phase} cycle={activityState.current.cycle} />
      )}
    </group>
  );
}

export function kidDestination(
  name: string,
  schedule: string,
  rainy: boolean,
  defaultPos: [number, number, number],
  phase: number,
  cycle: number,
  waitingCustomers: string[],
  servedCustomer: string | null = null,
  customerPhase?: JuiceClubCustomerPhase,
  activeCustomer?: string | null,
) {
  if (schedule === 'juice-club' && activeCustomer === name && customerPhase) {
    const lifecycleTargets: Partial<Record<JuiceClubCustomerPhase, [number, number, number]>> = {
      entry: [-1.35, 0, -1.92],
      queue: [0.7, 0, -1.92],
      ordering: [2.05, 0, -1.92],
      service: [2.45, 0, -1.65],
      drink: [3.05, 0, -1.65],
      reaction: [3.05, 0, -1.65],
      departure: [3.45, 0, -1.65],
    };
    const target = lifecycleTargets[customerPhase];
    if (target) return new THREE.Vector3(...target);
  }
  if (schedule === 'juice-club' && servedCustomer === name) {
    // The served child visibly leaves the counter before rejoining the room.
    return new THREE.Vector3(3.45, 0, -1.65);
  }
  const queueIndex = schedule === 'juice-club' ? waitingCustomers.indexOf(name) : -1;
  // Customers are visibly ordered from the counter outward; everyone else still
  // uses the existing Juice Club gathering destinations.
  if (queueIndex >= 0) return new THREE.Vector3(2.05 - Math.min(queueIndex, 4) * 0.68, 0, -1.92);
  // On every third stop, pairs briefly share a recognizable game/table area.
  // Their individual dwell clocks naturally split the cluster back apart.
  if (cycle % 3 === 0) {
    const castIndex = KID_CAST.findIndex((kid) => kid.name === name);
    const pair = Math.floor(castIndex / 2);
    const groupSpots: Partial<Record<string, [number, number, number][]>> = {
      'morning-play': [[-2.7, 0, 1.4], [0.5, 0, 3.1], [2.8, 0, 0.5], [-0.2, 0, -1.8], [3.1, 0, 2.6], [-5, 0, -1.8]],
      'art-time': [[-14.1, 0, -11.5], [-12.6, 0, -9.5], [-9.7, 0, -10.6], [-9.7, 0, -13.5], [-12.2, 0, -14.6], [-12.1, 0, -9.1]],
      'juice-club': [[0.8, 0, -2.2], [-1.4, 0, -1], [1.1, 0, 1.9], [-2.2, 0, 0.5], [4.8, 0, 4], [-4.8, 0, 1.8]],
      'outdoor-play': rainy
        ? [[3.4, 0, -6.2], [1.5, 0, -5.2], [-1.4, 0, -5.5], [2.5, 0, -4.6], [-3.1, 0, -5.5], [0, 0, -6.7]]
        : [[10.3, 0, -10.7], [13.6, 0, -8.2], [10.6, 0, -1.6], [14.1, 0, 1.1], [13.6, 0, 8.4], [11.5, 0, 12.1]],
      pickup: [[-9.2, 0, -5.2], [-9.2, 0, -1.2], [-9.2, 0, 3.2], [-12.8, 0, -6], [-12.8, 0, -2], [-12.8, 0, 5.8]],
    };
    const spots = groupSpots[schedule];
    if (spots) {
      const spot = spots[pair % spots.length];
      const pairOffset = castIndex % 2 === 0 ? -0.38 : 0.38;
      return new THREE.Vector3(spot[0], spot[1], spot[2] + pairOffset);
    }
  }
  return scheduleDestination(schedule, rainy, defaultPos, phase, cycle);
}

function questPriorityForKid(name: string, quests: ReturnType<typeof useGameStore.getState>['quests']) {
  return (
    (name === 'Leo' && (objectiveIsActive(quests, 'where-binky', 'talk-to-leo') || objectiveIsActive(quests, 'where-binky', 'return-binky')))
    || (name === 'Mia' && objectiveIsActive(quests, 'where-binky', 'ask-mia'))
    || (name === 'Sam' && objectiveIsActive(quests, 'where-binky', 'trade-with-sam'))
  );
}

function hasActiveQuest(quests: ReturnType<typeof useGameStore.getState>['quests']) {
  return Object.values(quests).some((quest) => quest.status === 'active');
}

function kidGreeting(name: string, schedule: string) {
  const greetings: Record<string, string> = {
    'morning-play': `${name} gives you a cheerful wave from the game.`,
    'art-time': `${name} holds up their work with a proud little grin.`,
    'juice-club': `${name} waves from the Juice Club line.`,
    'outdoor-play': `${name} calls, "Want to play?"`,
    pickup: `${name} gives you a quick goodbye wave.`,
  };
  return greetings[schedule] ?? `${name} waves hello.`;
}

export function kidActivityMode(
  schedule: string,
  rainy: boolean,
  phase: number,
): NonNullable<CharacterModelProps['activityMode']> {
  return getChildActivityPlan('Leo', schedule, rainy, 0, phase).mode;
}

function childActivityReaction(
  plan: ChildActivityPlan,
): NonNullable<CharacterModelProps['socialReaction']> {
  if (plan.activity === 'dancing' || plan.activity === 'singing' || plan.activity === 'reacting') return 'cheer';
  if (plan.activity === 'following' || plan.activity === 'pretend-play') return 'wave';
  if (plan.activity === 'conversation' || plan.activity === 'picture-books' || plan.activity === 'circle-time') return 'listen';
  return 'smile';
}

function JuiceClubQueue() {
  const schedule = useGameStore((state) => state.schedule);
  const waitingCustomers = useGameStore((state) => state.waitingCustomers);
  const tray = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (tray.current) tray.current.position.x = Math.sin(state.clock.elapsedTime * 1.4) * 0.15;
  });
  if (schedule !== 'juice-club') return null;
  return (
    <group>
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[2.05 - index * 0.68, 0.035, -1.92]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.38, 0.035, 8, 22]} />
          <meshBasicMaterial color={index < waitingCustomers.length ? '#ffd166' : '#fff0c7'} transparent opacity={index < waitingCustomers.length ? 0.82 : 0.22} />
        </mesh>
      ))}
      <mesh position={[2.05, 0.055, -1.38]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.76, 0.28]} />
        <meshBasicMaterial color={waitingCustomers.length ? '#77c9b7' : '#d9e8dd'} transparent opacity={0.8} />
      </mesh>
      <group ref={tray} position={[3, 1.24, -2.32]}>
        <mesh><boxGeometry args={[0.9, 0.06, 0.38]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
        {Array.from({ length: Math.min(waitingCustomers.length, 3) }, (_, index) => (
          <mesh key={index} position={[-0.26 + index * 0.26, 0.16, 0]}><cylinderGeometry args={[0.1, 0.08, 0.28, 8]} /><meshStandardMaterial color="#f2b85b" transparent opacity={0.85} /></mesh>
        ))}
        {waitingCustomers.length > 0 && <mesh position={[0.32, 0.11, 0]}><boxGeometry args={[0.2, 0.2, 0.2]} /><meshStandardMaterial color="#dfb976" /></mesh>}
      </group>
    </group>
  );
}

function TeacherProp({ name, schedule }: { name: string; schedule: string }) {
  if (schedule === 'art-time') {
    return (
      <group position={[0.42, 0.82, -0.22]} rotation={[0, 0.25, -0.2]}>
        <mesh><boxGeometry args={[0.3, 0.38, 0.035]} /><meshStandardMaterial color="#fff1cf" /></mesh>
        <mesh position={[0, 0.1, -0.025]}><boxGeometry args={[0.18, 0.025, 0.02]} /><meshBasicMaterial color="#e76f8c" /></mesh>
      </group>
    );
  }
  if (schedule === 'outdoor-play') {
    return <mesh position={[0.42, 0.88, -0.25]}><coneGeometry args={[0.12, 0.28, 12]} /><meshStandardMaterial color="#f2b85b" /></mesh>;
  }
  if (schedule === 'juice-club' && name === 'Mr. Davis') {
    return <mesh position={[0.38, 0.78, -0.28]}><cylinderGeometry args={[0.11, 0.09, 0.28, 8]} /><meshStandardMaterial color="#f2b85b" transparent opacity={0.85} /></mesh>;
  }
  return <mesh position={[0.4, 0.84, -0.25]}><boxGeometry args={[0.22, 0.3, 0.06]} /><meshStandardMaterial color="#68a9a7" /></mesh>;
}

function InterventionProp({ phase }: { phase: TeacherInterventionState['phase'] }) {
  const color = phase === 'praise'
    ? '#70b77e'
    : phase === 'consequence'
      ? '#d77b6d'
      : '#e6ae2f';
  return (
    <group position={[0.42, 0.9, -0.28]}>
      <mesh rotation={[0, 0.18, -0.12]}>
        <boxGeometry args={[0.26, 0.36, 0.055]} />
        <meshStandardMaterial color="#fff1cf" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.06, -0.032]}>
        <boxGeometry args={[0.16, 0.035, 0.018]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={[0, -0.03, -0.032]}>
        <boxGeometry args={[0.13, 0.025, 0.018]} />
        <meshBasicMaterial color="#68a9a7" />
      </mesh>
      {phase === 'warning' && (
        <mesh position={[0, 0.42, -0.03]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.16, 0.28, 3]} />
          <meshBasicMaterial color="#e6ae2f" />
        </mesh>
      )}
      {phase === 'redirecting' && (
        <group position={[0.06, 0.37, -0.03]} rotation={[0, 0, -Math.PI / 2]}>
          <mesh><coneGeometry args={[0.1, 0.26, 3]} /><meshBasicMaterial color="#4c82d4" /></mesh>
          <mesh position={[0, -0.16, 0]}><boxGeometry args={[0.09, 0.28, 0.02]} /><meshBasicMaterial color="#4c82d4" /></mesh>
        </group>
      )}
      {phase === 'separating' && (
        <group position={[0, 0.38, -0.03]}>
          {[-0.11, 0.11].map((x) => <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.06, 0.3, 0.02]} /><meshBasicMaterial color="#d77b6d" /></mesh>)}
        </group>
      )}
      {phase === 'calling-player' && (
        <group position={[0.16, 0.4, -0.03]}>
          {[0, 0.12, 0.23].map((x, index) => <mesh key={x} position={[x, index * 0.045, 0]}><sphereGeometry args={[0.055 + index * 0.018, 7, 5]} /><meshBasicMaterial color="#457b9d" /></mesh>)}
        </group>
      )}
      {phase === 'praise' && (
        <mesh position={[0, 0.43, -0.03]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.22, 0.22, 0.02]} />
          <meshBasicMaterial color="#70b77e" />
        </mesh>
      )}
    </group>
  );
}

function SocialGameMarker({ schedule, phase, cycle }: { schedule: string; phase: number; cycle: number }) {
  // A few synchronized markers make a temporary game/table cluster legible
  // without adding per-NPC movement or scene-wide simulation.
  if ((Math.floor(phase) + cycle) % 3 !== 0 || schedule === 'pickup') return null;
  const color = schedule === 'art-time' ? '#e76f8c' : schedule === 'juice-club' ? '#f2d16b' : '#71d4b4';
  return (
    <group position={[-0.46, 0.04, 0.2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.12, 10]} /><meshBasicMaterial color={color} transparent opacity={0.8} /></mesh>
      {schedule === 'outdoor-play' && <mesh position={[0, 0.16, 0]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#e8613c" /></mesh>}
      {schedule === 'morning-play' && <mesh position={[0, 0.1, 0]} rotation={[0.2, 0.3, 0]}><boxGeometry args={[0.18, 0.18, 0.18]} /><meshStandardMaterial color="#4c82d4" /></mesh>}
    </group>
  );
}

function sessionActivityMode(participant: SharedActivityParticipant): NonNullable<CharacterModelProps['activityMode']> {
  if (participant.activity === 'drawing' || participant.activity === 'coloring') return 'coloring';
  if (participant.activity === 'toy-play' || participant.activity === 'blocks') return 'toy-play';
  if (participant.activity === 'conversation') return 'conversation';
  if (participant.activity === 'teacher-help' || participant.activity === 'teacher-praise' || participant.activity === 'teacher-observation') return 'intervening';
  return 'gathering';
}

function SessionProp({ participant }: { participant: SharedActivityParticipant }) {
  const prop = useRef<THREE.Group>(null);
  const liftedBlock = useRef<THREE.Mesh>(null);
  const lastAnimationAt = useRef(0);
  const phase = namePhase(participant.name);
  useFrame((state) => {
    if (!prop.current || !shouldUpdateOptionalAnimation(lastAnimationAt, state.clock.elapsedTime * 1000)) return;
    const elapsed = state.clock.elapsedTime;
    prop.current.rotation.y = Math.sin(elapsed * 0.85 + phase) * 0.08;
    if (liftedBlock.current) {
      const lift = Math.pow(Math.max(0, Math.sin(elapsed * 2.2 + phase)), 3);
      liftedBlock.current.position.y = 0.22 + lift * 0.28;
      liftedBlock.current.rotation.y = lift * 0.7;
    }
  });
  const color = participant.activity === 'drawing' || participant.activity === 'coloring'
    ? '#e76f8c'
    : participant.activity === 'teacher-help' || participant.activity === 'teacher-praise' || participant.activity === 'teacher-observation'
      ? '#68a9a7'
      : '#71d4b4';
  return (
    <group ref={prop} position={[0.4, 0.78, -0.3]}>
      {participant.activity === 'drawing' || participant.activity === 'coloring' ? (
        <group rotation={[0, 0.2, -0.18]}>
          <mesh><boxGeometry args={[0.42, 0.34, 0.035]} /><meshStandardMaterial color="#fff1cf" /></mesh>
          <mesh position={[0.03, 0, -0.025]} rotation={[0, 0, -0.45]}><boxGeometry args={[0.25, 0.025, 0.018]} /><meshBasicMaterial color="#e76f8c" /></mesh>
          <mesh position={[-0.08, -0.08, -0.026]} rotation={[0, 0, 0.3]}><boxGeometry args={[0.16, 0.022, 0.018]} /><meshBasicMaterial color="#4c82d4" /></mesh>
        </group>
      ) : participant.activity === 'toy-play' || participant.activity === 'blocks' ? (
        <group position={[0, -0.54, 0]}>
          {[
            [-0.13, 0, '#e8613c'],
            [0.13, 0, '#4c82d4'],
            [0, 0.22, '#ffd166'],
          ].map(([x, y, blockColor], index) => (
            <mesh
              key={index}
              ref={index === 2 ? liftedBlock : undefined}
              position={[x as number, y as number, 0]}
            >
              <boxGeometry args={[0.22, 0.22, 0.22]} />
              <meshStandardMaterial color={blockColor as string} roughness={0.82} />
            </mesh>
          ))}
        </group>
      ) : (
        <mesh><boxGeometry args={[0.2, 0.27, 0.06]} /><meshStandardMaterial color={color} /></mesh>
      )}
    </group>
  );
}

function AmbientSocialMoments() {
  const messageIndex = useRef(0);
  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const messages: Record<string, string[]> = {
      'morning-play': ['Finn invites everyone to the block circle.', 'Mia waves from a small story-time group.'],
      'art-time': ['Ruby compares paint colors with the art table group.', 'Mr. Davis reminds the artists to share the brushes.'],
      'juice-club': ['The Juice Club line shuffles forward together.', 'Noah cheers when a fresh tray reaches the counter.'],
      'outdoor-play': ['Zoe calls out a friendly playground challenge.', 'Leo and Sam gather near the next activity spot.'],
      pickup: ['The pickup group checks cubbies and waves goodbye.', 'Ms. Harper thanks everyone for helping tidy the room.'],
    };
    const showMoment = () => {
      const state = useGameStore.getState();
      if (
        state.zone !== 'hub'
        || state.activeDialogue
        || state.journalOpen
        || state.zoneTransitioning
        || state.activeInteractable
        || hasActiveQuest(state.quests)
      ) return;
      const scheduleMessages = messages[state.schedule] ?? messages['morning-play'];
      const message = scheduleMessages[messageIndex.current % scheduleMessages.length];
      messageIndex.current += 1;
      playGameSound('greeting', 'social');
      state.setAmbientMessage(message);
      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => useGameStore.getState().setAmbientMessage(null), 3800);
    };
    const first = setTimeout(showMoment, 8500);
    const interval = setInterval(showMoment, 17000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      if (clearTimer) clearTimeout(clearTimer);
      useGameStore.getState().setAmbientMessage(null);
    };
  }, []);
  return null;
}

function ActivityProp({
  activity,
  phase,
}: {
  activity: ChildActivityPlan['activity'];
  phase: number;
}) {
  const prop = useRef<THREE.Group>(null);
  const scribbleCrayon = useRef<THREE.Mesh>(null);
  const turningPage = useRef<THREE.Mesh>(null);
  const sippingCup = useRef<THREE.Group>(null);
  const liftedToy = useRef<THREE.Mesh>(null);
  const lastAnimationAt = useRef(0);
  useFrame((state) => {
    if (!prop.current || !shouldUpdateOptionalAnimation(lastAnimationAt, state.clock.elapsedTime * 1000)) return;
    const elapsed = state.clock.elapsedTime;
    const bob = Math.sin(elapsed * 2.2 + phase);
    if (activity === 'singing') prop.current.position.y = 1.08 + bob * 0.055;
    else if (activity === 'pretend-play') prop.current.position.y = 0.75 + bob * 0.04;
    else if (activity === 'conversation' || activity === 'following') prop.current.position.y = 1.2 + bob * 0.025;
    else if (activity !== 'circle-time' && activity !== 'dancing' && activity !== 'reacting') prop.current.position.y = 0.75;
    prop.current.rotation.y = Math.sin(elapsed * 0.8 + phase) * 0.08;
    if (scribbleCrayon.current) {
      scribbleCrayon.current.position.x = 0.08 + Math.sin(elapsed * 7.2 + phase) * 0.1;
      scribbleCrayon.current.position.z = -0.04 + Math.cos(elapsed * 5.8 + phase) * 0.035;
    }
    if (turningPage.current) {
      const pageTurn = Math.pow(Math.max(0, Math.sin(elapsed * 1.45 + phase)), 2);
      turningPage.current.rotation.z = -0.12 - pageTurn * 0.7;
      turningPage.current.position.y = pageTurn * 0.08;
    }
    if (sippingCup.current) {
      const sip = Math.pow(Math.max(0, Math.sin(elapsed * 1.35 + phase)), 5);
      sippingCup.current.position.y = sip * 0.45;
      sippingCup.current.position.x = -sip * 0.22;
      sippingCup.current.rotation.z = -sip * 0.22;
    }
    if (liftedToy.current) {
      const lift = Math.pow(Math.max(0, Math.sin(elapsed * 2 + phase)), 3);
      liftedToy.current.position.y = -0.5 + lift * 0.55;
      liftedToy.current.rotation.y = lift * 0.9;
    }
  });

  if (activity === 'drawing' || activity === 'coloring') {
    return (
      <group ref={prop} position={[0.28, 0.75, -0.4]} rotation={[0.12, 0, -0.2]}>
        <mesh position={[-0.24, -0.04, 0]}><boxGeometry args={[0.52, 0.38, 0.035]} /><meshStandardMaterial color="#fff1cf" roughness={0.92} /></mesh>
        <mesh position={[-0.22, -0.03, -0.024]} rotation={[0, 0, 0.45]}><boxGeometry args={[0.3, 0.026, 0.018]} /><meshBasicMaterial color="#4c82d4" /></mesh>
        <mesh position={[-0.29, -0.11, -0.026]} rotation={[0, 0, -0.3]}><boxGeometry args={[0.23, 0.024, 0.018]} /><meshBasicMaterial color="#ffd166" /></mesh>
        <mesh ref={scribbleCrayon} position={[0.08, 0.08, -0.04]} rotation={[0, 0, -0.35]}><cylinderGeometry args={[0.025, 0.025, 0.48, 6]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
        <mesh position={[-0.01, -0.13, -0.04]} rotation={[0, 0, 0.35]}><coneGeometry args={[0.055, 0.14, 6]} /><meshStandardMaterial color="#e8613c" /></mesh>
      </group>
    );
  }
  if (activity === 'picture-books') {
    return (
      <group ref={prop} position={[0, 0.75, -0.42]} rotation={[0.18, 0, 0]}>
        <mesh position={[-0.22, 0, 0]} rotation={[0, 0, 0.12]}><boxGeometry args={[0.42, 0.045, 0.48]} /><meshStandardMaterial color="#4c82d4" /></mesh>
        <mesh ref={turningPage} position={[0.22, 0, 0]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.42, 0.045, 0.48]} /><meshStandardMaterial color="#f2b85b" /></mesh>
        <mesh position={[0, 0.035, 0]}><boxGeometry args={[0.035, 0.035, 0.48]} /><meshStandardMaterial color="#fff1cf" /></mesh>
      </group>
    );
  }
  if (activity === 'snacking') {
    return (
      <group ref={prop} position={[0.34, 0.75, -0.3]}>
        <group ref={sippingCup}>
          <mesh><cylinderGeometry args={[0.11, 0.09, 0.28, 8]} /><meshStandardMaterial color="#f2b85b" transparent opacity={0.88} /></mesh>
          <mesh position={[0.02, 0.19, 0]} rotation={[0, 0, -0.18]}><cylinderGeometry args={[0.012, 0.012, 0.25, 5]} /><meshBasicMaterial color="#d76f78" /></mesh>
        </group>
        <mesh position={[0.24, -0.08, 0]}><boxGeometry args={[0.18, 0.08, 0.14]} /><meshStandardMaterial color="#dfb976" /></mesh>
      </group>
    );
  }
  if (activity === 'toy-play' || activity === 'parallel-play') {
    return (
      <group ref={prop} position={[0.42, 0.75, -0.32]}>
        <mesh><sphereGeometry args={[0.2, 10, 8]} /><meshStandardMaterial color="#e8613c" roughness={0.8} /></mesh>
        <mesh ref={liftedToy} position={[-0.2, -0.5, 0.12]}><boxGeometry args={[0.18, 0.18, 0.18]} /><meshStandardMaterial color="#71d4b4" /></mesh>
      </group>
    );
  }
  if (activity === 'pretend-play') {
    return (
      <group ref={prop} position={[0.38, 0.75, -0.28]}>
        <mesh><coneGeometry args={[0.15, 0.34, 8]} /><meshStandardMaterial color="#55b89b" /></mesh>
        <mesh position={[0, 0.23, 0]}><sphereGeometry args={[0.12, 8, 6]} /><meshStandardMaterial color="#fff0b8" /></mesh>
      </group>
    );
  }
  if (activity === 'singing') {
    return (
      <group ref={prop} position={[0.42, 1.08, -0.3]}>
        <mesh><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#e76f8c" /></mesh>
        <mesh position={[0.05, 0.16, 0]}><cylinderGeometry args={[0.018, 0.018, 0.28, 5]} /><meshStandardMaterial color="#e76f8c" /></mesh>
        <mesh position={[0.18, 0.25, 0]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color="#4c82d4" /></mesh>
      </group>
    );
  }
  if (activity === 'dancing' || activity === 'reacting') {
    return (
      <group ref={prop} position={[0, 0.12, -0.5]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.32, 0.035, 8, 20]} /><meshBasicMaterial color="#ffd166" transparent opacity={0.82} /></mesh>
      </group>
    );
  }
  if (activity === 'circle-time') {
    return (
      <group ref={prop} position={[0, 0.04, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.38, 18]} /><meshStandardMaterial color="#8fd0c5" transparent opacity={0.72} /></mesh>
      </group>
    );
  }
  if (activity === 'conversation' || activity === 'following') {
    return (
      <group ref={prop} position={[0.4, 1.2, -0.28]}>
        {[0, 0.13, 0.25].map((x, index) => (
          <mesh key={x} position={[x, index % 2 === 0 ? 0 : 0.06, 0]}>
            <sphereGeometry args={[0.05 + index * 0.01, 7, 5]} />
            <meshStandardMaterial color="#fff1cf" />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group ref={prop} position={[0.4, 0.75, -0.3]}>
      <mesh position={[0, -0.08, 0]}><boxGeometry args={[0.22, 0.22, 0.22]} /><meshStandardMaterial color="#4c82d4" /></mesh>
      <mesh position={[0, 0.15, 0]} rotation={[0, 0.4, 0]}><boxGeometry args={[0.18, 0.18, 0.18]} /><meshStandardMaterial color="#e6ae2f" /></mesh>
    </group>
  );
}

function ActivityCue({
  activity,
  phase,
  cycle,
}: {
  activity: SharedActivityParticipant['activity'] | ChildActivityPlan['activity'];
  phase: number;
  cycle: number;
}) {
  const alwaysVisible = activity === 'conversation' || activity === 'singing' || activity === 'dancing';
  if (!alwaysVisible && (Math.floor(phase * 10) + cycle) % 3 !== 0) return null;
  const color = activity === 'coloring' || activity === 'drawing'
    ? '#e76f8c'
    : activity === 'blocks' || activity === 'toy-play'
      ? '#4c82d4'
      : activity === 'snacking'
        ? '#f2b85b'
        : '#71d4b4';
  return (
    <group position={[0.34, 1.58, -0.18]} scale={0.82}>
      <mesh>
        <sphereGeometry args={[0.17, 10, 8]} />
        <meshStandardMaterial color="#fff8df" roughness={0.84} />
      </mesh>
      <mesh position={[-0.16, -0.16, 0]} scale={0.56}>
        <sphereGeometry args={[0.11, 8, 6]} />
        <meshStandardMaterial color="#fff8df" roughness={0.84} />
      </mesh>
      {activity === 'conversation' || activity === 'singing' ? (
        <>
          <mesh position={[-0.055, 0.02, -0.16]}><sphereGeometry args={[0.035, 7, 5]} /><meshBasicMaterial color={color} /></mesh>
          <mesh position={[0.055, 0.02, -0.16]}><sphereGeometry args={[0.035, 7, 5]} /><meshBasicMaterial color={color} /></mesh>
        </>
      ) : activity === 'picture-books' ? (
        <mesh position={[0, 0.01, -0.16]}><boxGeometry args={[0.18, 0.12, 0.025]} /><meshBasicMaterial color={color} /></mesh>
      ) : (
        <mesh position={[0, 0.01, -0.16]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.13, 0.13, 0.025]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

function TeacherScanCue() {
  return (
    <group position={[0, 1.72, -0.16]} scale={0.86}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.035, 7, 18, Math.PI]} />
        <meshBasicMaterial color="#ffd166" />
      </mesh>
      {[-0.16, 0, 0.16].map((x, index) => (
        <mesh key={x} position={[x, -0.12 - Math.abs(index - 1) * 0.04, 0]}>
          <sphereGeometry args={[0.035, 7, 5]} />
          <meshBasicMaterial color="#68a9a7" />
        </mesh>
      ))}
    </group>
  );
}