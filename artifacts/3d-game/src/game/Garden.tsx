import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CollisionDebug, collisionDebugEnabled } from './CollisionDebug';
import { useWeather } from './WeatherSystem';
import { useQualitySettings } from './useQualitySettings';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { useGameStore } from './store';
import { getWorldSolidTransform, isWalkable, WORLD_SOLIDS } from './world';
import { CharacterModel, type CharacterModelProps } from './CharacterModel';
import { SuppliedArtwork } from './Artwork';
import { clearNpcNavigation, registerNpcPosition } from './navigation';
import { facingAngleForDirection, stepNpc, teacherPatrolProfile } from './NPCs';
import {
  activitySessionIsInterrupted,
  getSharedActivitySession,
  reportSessionArrival,
  sessionParticipant,
  sessionSlotVector,
  type SharedActivityParticipant,
} from './activitySessions';
import { getTeacherSupervisionTarget, updateChildBehavior } from './teacherInterventions';
import { absoluteGameMinute, cropProgress } from './gardenEconomy';

const FLOWERS = [
  [-15, -15, '#e8613c'], [-12.5, -14.2, '#ffd166'], [-9.8, -15, '#8a63c7'],
  [-6.5, -13.6, '#4c82d4'], [5.5, -14.4, '#e8613c'], [8, -15.2, '#ffd166'],
  [11, -13.8, '#d76f78'], [14.6, -14.8, '#55b89b'], [-15.2, 8, '#ffd166'],
  [-14.3, 11, '#4c82d4'], [14.8, 5.5, '#e8613c'], [15.1, 9, '#8a63c7'],
] as const;

const TREES = [
  [-14.5, -1], [-7, 11.8], [6.4, 11.5], [14.2, -8.5], [2, -13.8],
] as const;

type GardenActivity = 'water' | 'inspect' | 'pond-watch' | 'gazebo-talk' | 'play' | 'supervise' | 'social-walk' | 'sing' | 'pretend' | 'snack' | 'circle';

interface GardenNpcDefinition {
  name: string;
  role: 'kid' | 'teacher';
  bodyColor: string;
  accentColor: string;
  hairColor: string;
  skinColor: string;
  hairStyle: NonNullable<CharacterModelProps['hairStyle']>;
  route: { position: [number, number, number]; activity: GardenActivity }[];
}

export const GARDEN_CAST: GardenNpcDefinition[] = [
  {
    name: 'Lily',
    role: 'kid',
    bodyColor: '#db568a',
    accentColor: '#8fd0c5',
    hairColor: '#202334',
    skinColor: '#e4aa7f',
    hairStyle: 'ponytail',
    route: [
      { position: [-13.65, 0, 2.8], activity: 'water' },
      { position: [-8.05, 0, 2.8], activity: 'inspect' },
      { position: [-1.4, 0, 6.2], activity: 'gazebo-talk' },
      { position: [-4.2, 0, -3.1], activity: 'social-walk' },
      { position: [-3, 0, 8], activity: 'sing' },
      { position: [-5.6, 0, -3.1], activity: 'pretend' },
    ],
  },
  {
    name: 'Finn',
    role: 'kid',
    bodyColor: '#4c82d4',
    accentColor: '#f3ca52',
    hairColor: '#bd7448',
    skinColor: '#f1bf98',
    hairStyle: 'sprout',
    route: [
      { position: [6.45, 0, -0.2], activity: 'pond-watch' },
      { position: [1.4, 0, 6.2], activity: 'gazebo-talk' },
      { position: [4.6, 0, -3.1], activity: 'play' },
      { position: [0, 0, -7.2], activity: 'social-walk' },
      { position: [3, 0, 8], activity: 'snack' },
      { position: [-1.3, 0, 5.2], activity: 'circle' },
    ],
  },
  {
    name: 'Zoe',
    role: 'kid',
    bodyColor: '#e9aa45',
    accentColor: '#e76f8c',
    hairColor: '#8d5d2f',
    skinColor: '#f2c4a0',
    hairStyle: 'bob',
    route: [
      { position: [13.65, 0, 9.8], activity: 'water' },
      { position: [8.05, 0, 9.8], activity: 'inspect' },
      { position: [5.4, 0, 5.9], activity: 'play' },
      { position: [4.8, 0, -3.1], activity: 'social-walk' },
      { position: [1.3, 0, 5.2], activity: 'circle' },
      { position: [7.2, 0, -3.1], activity: 'pretend' },
    ],
  },
  {
    name: 'Ms. Harper',
    role: 'teacher',
    bodyColor: '#457b9d',
    accentColor: '#e4bd6a',
    hairColor: '#46352f',
    skinColor: '#c98562',
    hairStyle: 'bob',
    route: [
      { position: [-7.2, 0, 5.3], activity: 'supervise' },
      { position: [5.9, 0, 2.9], activity: 'pond-watch' },
      { position: [0, 0, 10.1], activity: 'supervise' },
      { position: [0, 0, -3.1], activity: 'social-walk' },
      { position: [-10.2, 0, 7], activity: 'supervise' },
      { position: [10.2, 0, 6.8], activity: 'supervise' },
    ],
  },
];

const RECESS_GUESTS: GardenNpcDefinition[] = ([
  ['Leo','#e8613c','#4c82d4','curls'], ['Mia','#8a63c7','#ffd166','bob'], ['Sam','#55b89b','#e8613c','sprout'],
  ['Eli','#4c82d4','#55b89b','bob'], ['Noah','#ffd166','#4c82d4','curls'], ['Ruby','#e76f8c','#8a63c7','ponytail'],
  ['Max','#e88962','#355272','sprout'], ['Mae','#8a63c7','#ffd166','ponytail'], ['Mr. Davis','#355272','#68a9a7','curls'],
] as const).map(([name, bodyColor, accentColor, hairStyle], index) => ({
  name, role: name === 'Mr. Davis' ? 'teacher' : 'kid', bodyColor, accentColor, hairColor: '#5a3d32', skinColor: '#e5aa82', hairStyle,
  route: [
    { position: [-10 + (index % 5) * 5, 0, -5 + Math.floor(index / 5) * 7], activity: name === 'Mr. Davis' ? 'supervise' : 'play' },
    { position: [-8 + (index % 4) * 5, 0, 7 - Math.floor(index / 4) * 5], activity: name === 'Mr. Davis' ? 'supervise' : 'social-walk' },
  ],
}));

export function Garden() {
  return (
    <group>
      <GardenEnvironment />
      <GardenDetails />
      <GardenLandmarks />
      <GardenCast />
      <GardenActivityHost bed={0} position={[-10.8, 0, 5.35]} />
      <GardenActivityHost bed={1} position={[-10.8, 0, 10.4]} />
      <GummyDropBed bed={0} position={[10.8, 0, 9.8]} />
      <GummyDropBed bed={1} position={[10.8, 0, 5.7]} />
      <FishingSpot />
      <FishingShop />
      <SeedInspectionStation />
      <GardenReturnGate />
    </group>
  );
}

export function gardenNpcDestination(name: string, cycle: number) {
  const definition = GARDEN_CAST.find((candidate) => candidate.name === name);
  if (!definition) return null;
  const stop = definition.route[Math.abs(cycle) % definition.route.length];
  return {
    ...stop,
    position: new THREE.Vector3(...stop.position),
  };
}

function GardenCast() {
  const recess = useGameStore((state) => state.schedule === 'recess');
  const cast = recess ? [...GARDEN_CAST, ...RECESS_GUESTS] : GARDEN_CAST;
  return (
    <group>
      {cast.map((definition) => (
        <GardenNpc key={definition.name} definition={definition} />
      ))}
    </group>
  );
}

function GardenNpc({ definition }: { definition: GardenNpcDefinition }) {
  const ref = useRef<THREE.Group>(null);
  const firstStop = definition.route[0];
  const mirror = useMemo(() => new THREE.Vector3(...firstStop.position), [firstStop.position]);
  const destination = useMemo(() => new THREE.Vector3(...firstStop.position), [firstStop.position]);
  const active = useGameStore((state) => state.activeInteractable === `garden-npc-${definition.name}`);
  const activeDialogue = useGameStore((state) => state.activeDialogue);
  const imagination = useGameStore((state) => state.isImaginationMode);
  const journalOpen = useGameStore((state) => state.journalOpen);
  const zoneTransitioning = useGameStore((state) => state.zoneTransitioning);
  const routeState = useRef({
    index: 0,
    dwellUntil: 0,
    stuckFor: 0,
    nextScanAt: 0,
    scanUntil: 0,
    scanTarget: null as THREE.Vector3 | null,
    fallbackSessionId: null as string | null,
    lastPosition: new THREE.Vector3(...firstStop.position),
  });
  const teacherProfile = teacherPatrolProfile(definition.name);
  const [settledActivity, setSettledActivity] = useState<GardenActivity | null>(null);
  const [sharedParticipant, setSharedParticipant] = useState<SharedActivityParticipant | null>(null);
  const sharedParticipantRef = useRef<SharedActivityParticipant | null>(null);
  const settledRef = useRef<GardenActivity | null>(null);
  const candidate = useMemo(() => ({
    id: `garden-npc-${definition.name}`,
    position: mirror,
    range: 2.15,
    priority: definition.role === 'teacher' ? 32 : 24,
    valid: true,
  }), [definition.name, definition.role, mirror]);

  useEffect(() => registerNpcPosition(`garden-npc-${definition.name}`, mirror), [definition.name, mirror]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const route = definition.route;
    const stop = route[routeState.current.index % route.length];
    const session = getSharedActivitySession(
      'garden',
      'garden-routine',
      state.clock.elapsedTime,
      activitySessionIsInterrupted({
        activeDialogue,
        journalOpen,
        zoneTransitioning,
        questPriority: false,
      }),
    );
    const participant = sessionParticipant(session, definition.name);
    const visibleParticipant = session?.phase === 'active' ? participant : null;
    if (visibleParticipant) routeState.current.fallbackSessionId = null;
    const gatheringParticipant = participant
      && session?.phase === 'gathering'
      && routeState.current.fallbackSessionId !== session.id
      ? participant
      : null;
    const movementParticipant = visibleParticipant ?? gatheringParticipant;
    if (visibleParticipant?.activity !== sharedParticipantRef.current?.activity || visibleParticipant?.role !== sharedParticipantRef.current?.role || (!visibleParticipant && sharedParticipantRef.current)) {
      sharedParticipantRef.current = visibleParticipant;
      setSharedParticipant(visibleParticipant);
    }
    if (
      definition.role === 'teacher'
      && !movementParticipant
      && state.clock.elapsedTime >= routeState.current.nextScanAt
    ) {
      const scan = getTeacherSupervisionTarget(
        'garden:Ms. Harper',
        state.clock.elapsedTime,
        ref.current.position,
        teacherProfile,
        'garden',
      );
      routeState.current.scanTarget = scan?.position.clone() ?? null;
      routeState.current.scanUntil = scan
        ? state.clock.elapsedTime + teacherProfile.scanHold
        : state.clock.elapsedTime + teacherProfile.scanInterval;
      routeState.current.nextScanAt = state.clock.elapsedTime + teacherProfile.scanInterval;
    }
    const scanTarget = definition.role === 'teacher'
      && !movementParticipant
      && routeState.current.scanTarget
      && state.clock.elapsedTime < routeState.current.scanUntil
      ? routeState.current.scanTarget
      : null;
    if (movementParticipant) destination.copy(sessionSlotVector(movementParticipant));
    else if (scanTarget) destination.copy(scanTarget);
    else destination.set(...stop.position);
    const distance = ref.current.position.distanceTo(destination);
    const arrived = distance < 0.5;
    if (arrived && routeState.current.dwellUntil === 0) {
      routeState.current.dwellUntil = visibleParticipant
        ? session?.endsAt ?? state.clock.elapsedTime + 3
        : state.clock.elapsedTime + (movementParticipant
          ? 2.5
          : definition.role === 'teacher'
            ? teacherProfile.patrolDwell
            : 4.8 + (definition.name.length % 3) * 0.35);
    } else if (!visibleParticipant && !scanTarget && arrived && state.clock.elapsedTime >= routeState.current.dwellUntil) {
      if (gatheringParticipant && session) routeState.current.fallbackSessionId = session.id;
      routeState.current.index = (routeState.current.index + 1) % route.length;
      routeState.current.dwellUntil = 0;
    }

    if (active) {
      const player = new THREE.Vector3(...useGameStore.getState().playerPosition);
      turnToward(ref.current, player, delta);
    } else if (!arrived) {
      stepNpc(
        `garden-npc-${definition.name}`,
        ref.current,
        destination,
        null,
        delta,
        definition.role === 'teacher' ? teacherProfile.speed : 1.08,
        'garden',
      );
      const moved = ref.current.position.distanceTo(routeState.current.lastPosition);
      routeState.current.stuckFor = moved < 0.002 ? routeState.current.stuckFor + delta : 0;
      if (routeState.current.stuckFor > 2.6) {
        clearNpcNavigation(`garden-npc-${definition.name}`);
        if (!movementParticipant) routeState.current.index = (routeState.current.index + 1) % route.length;
        routeState.current.dwellUntil = 0;
        routeState.current.stuckFor = 0;
      }
    } else {
      turnToward(ref.current, movementParticipant ? new THREE.Vector3(...movementParticipant.focus) : gardenActivityFocus(stop.activity, destination), delta);
      if (gatheringParticipant && session?.phase === 'gathering') {
        reportSessionArrival('garden', 'garden-routine', session.id, definition.name, state.clock.elapsedTime);
      }
    }

    const nextActivity = visibleParticipant && arrived
      ? gardenSessionActivity(visibleParticipant)
      : arrived && scanTarget
        ? 'supervise'
        : arrived && routeState.current.dwellUntil > state.clock.elapsedTime ? stop.activity : null;
    if (definition.role === 'kid') {
      const disruptionWindow = (Math.floor(state.clock.elapsedTime / 6) + definition.name.length) % 5 === 0;
      updateChildBehavior({
        name: definition.name,
        position: ref.current.position,
        activity: nextActivity ?? 'walking',
        disruptive: Boolean(
          nextActivity
          && disruptionWindow
          && (nextActivity === 'play' || nextActivity === 'social-walk'),
        ),
        questPriority: false,
        updatedAt: state.clock.elapsedTime,
      });
    }
    if (nextActivity !== settledRef.current) {
      settledRef.current = nextActivity;
      setSettledActivity(nextActivity);
    }
    routeState.current.lastPosition.copy(ref.current.position);
    mirror.copy(ref.current.position);
    updateInteractionCandidate(`garden-npc-${definition.name}`, { position: mirror, valid: true });
  });

  return (
    <group ref={ref} position={firstStop.position}>
      <group scale={definition.role === 'teacher' ? 1.25 : 1}>
        <CharacterModel
          bodyColor={definition.bodyColor}
          accentColor={definition.accentColor}
          hairColor={definition.hairColor}
          hairStyle={definition.hairStyle}
          skinColor={definition.skinColor}
          mood="happy"
          isTeacher={definition.role === 'teacher'}
          isTalking={activeDialogue?.name === definition.name || Boolean(
            settledActivity
            && (sharedParticipant?.activity === 'conversation' || settledActivity === 'sing' || settledActivity === 'supervise'),
          )}
          imaginationMode={imagination}
          activityMode={gardenActivityMode(settledActivity)}
           activitySignal={sharedParticipant?.activity ?? settledActivity ?? 'walking'}
          motionSeed={definition.name.length * 0.71}
          idleEnergy={0.65}
        />
      </group>
       {settledActivity && sharedParticipant && <GardenSessionProp participant={sharedParticipant} />}
       {settledActivity && !sharedParticipant && <GardenActivityProp activity={settledActivity} role={definition.role} />}
       {definition.role === 'teacher' && settledActivity === 'supervise' && <GardenTeacherCue />}
        {definition.role === 'kid' && settledActivity && <GardenActionCue activity={settledActivity} seed={definition.name.length} />}
    </group>
  );
}

function gardenSessionActivity(participant: SharedActivityParticipant): GardenActivity {
  if (participant.activity === 'teacher-help' || participant.activity === 'teacher-observation' || participant.activity === 'teacher-praise') return 'supervise';
  return participant.activity === 'toy-play' ? 'play' : 'gazebo-talk';
}

function GardenSessionProp({ participant }: { participant: SharedActivityParticipant }) {
  if (participant.activity === 'teacher-help' || participant.activity === 'teacher-observation') {
    return <mesh position={[0.35, 0.55, -0.3]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.34, 0.46, 0.07]} /><meshStandardMaterial color="#68a9a7" /></mesh>;
  }
  return <mesh position={[0.35, 0.55, -0.3]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.42, 0.3, 0.06]} /><meshStandardMaterial color="#fff1cf" /></mesh>;
}

function GardenTeacherCue() {
  return (
    <group position={[0.46, 1.5, -0.28]}>
      <mesh><torusGeometry args={[0.16, 0.035, 8, 16]} /><meshBasicMaterial color="#ffd166" /></mesh>
      <mesh position={[0.15, -0.15, 0]} rotation={[0, 0, -0.7]}><cylinderGeometry args={[0.025, 0.025, 0.28, 6]} /><meshBasicMaterial color="#ffd166" /></mesh>
    </group>
  );
}

function GardenActionCue({ activity, seed }: { activity: GardenActivity; seed: number }) {
  if ((seed + activity.length) % 3 !== 0 && activity !== 'gazebo-talk' && activity !== 'sing') return null;
  const color = activity === 'water' || activity === 'pond-watch'
    ? '#62b8c7'
    : activity === 'snack'
      ? '#f2b85b'
      : '#71d4b4';
  return (
    <group position={[0.34, 1.58, -0.18]} scale={0.78}>
      <mesh><sphereGeometry args={[0.17, 10, 8]} /><meshStandardMaterial color="#fff8df" roughness={0.86} /></mesh>
      <mesh position={[-0.16, -0.16, 0]} scale={0.56}><sphereGeometry args={[0.11, 8, 6]} /><meshStandardMaterial color="#fff8df" /></mesh>
      <mesh position={[0, 0.01, -0.16]} rotation={[0, 0, activity === 'water' ? -0.5 : 0.2]}>
        <boxGeometry args={[0.14, 0.1, 0.025]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function turnToward(ref: THREE.Group, target: THREE.Vector3, delta: number) {
  const direction = target.clone().sub(ref.position).setY(0);
  if (direction.lengthSq() < 0.001) return;
  const targetAngle = facingAngleForDirection(direction);
  const difference = THREE.MathUtils.euclideanModulo(targetAngle - ref.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
  ref.rotation.y += difference * (1 - Math.exp(-7 * delta));
}

function gardenActivityFocus(activity: GardenActivity, position: THREE.Vector3) {
  if (activity === 'pond-watch') return new THREE.Vector3(10, 0, -0.2);
  if (activity === 'gazebo-talk') return new THREE.Vector3(0, 0, 6.2);
  if (activity === 'water' || activity === 'inspect') {
    return new THREE.Vector3(position.x < 0 ? -10.8 : 10.8, 0, position.z);
  }
  if (activity === 'supervise') return new THREE.Vector3(0, 0, 5.5);
  if (activity === 'social-walk') return new THREE.Vector3(0, 0, -3.1);
  if (activity === 'circle') return new THREE.Vector3(0, 0, 5.2);
  if (activity === 'play') return new THREE.Vector3(5, 0, 1.4);
  if (activity === 'pretend') return new THREE.Vector3(0.8, 0, -3.1);
  if (activity === 'sing' || activity === 'snack') return new THREE.Vector3(0, 0, 8);
  return position.clone().add(new THREE.Vector3(1, 0, -0.5));
}

function gardenActivityMode(activity: GardenActivity | null): NonNullable<CharacterModelProps['activityMode']> {
  if (activity === 'play') return 'playing';
  if (activity === 'pond-watch') return 'reacting';
  if (activity === 'gazebo-talk') return 'conversation';
  if (activity === 'water' || activity === 'inspect' || activity === 'pretend') return 'pretend-play';
  if (activity === 'sing') return 'singing';
  if (activity === 'snack') return 'snacking';
  if (activity === 'circle') return 'circle-time';
  if (activity === 'social-walk') return 'following';
  if (activity === 'supervise') return 'gathering';
  return 'walking';
}

function GardenActivityProp({ activity, role }: { activity: GardenActivity; role: GardenNpcDefinition['role'] }) {
  if (activity === 'water') {
    return (
      <group position={[0.36, 0.45, -0.25]} rotation={[-0.4, 0, -0.18]}>
        <mesh><cylinderGeometry args={[0.11, 0.13, 0.28, 8]} /><meshStandardMaterial color="#4c82d4" /></mesh>
        <mesh position={[0.16, 0.03, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.06, 0.28, 7]} /><meshStandardMaterial color="#4c82d4" /></mesh>
      </group>
    );
  }
  if (activity === 'inspect') {
    return <mesh position={[0.3, 0.5, -0.35]}><torusGeometry args={[0.11, 0.025, 8, 18]} /><meshStandardMaterial color="#e6ae2f" /></mesh>;
  }
  if (activity === 'pond-watch') {
    return <mesh position={[0, 1.4, -0.45]}><boxGeometry args={[0.3, 0.18, 0.12]} /><meshStandardMaterial color="#355272" /></mesh>;
  }
  if (activity === 'play') {
    return <mesh position={[0, 0.18, -0.4]}><sphereGeometry args={[0.18, 10, 8]} /><meshStandardMaterial color="#e8613c" /></mesh>;
  }
  if (activity === 'sing') {
    return (
      <group position={[0.2, 1.05, -0.3]} rotation={[0.4, 0, -0.4]}>
        <mesh><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#e76f8c" /></mesh>
        <mesh position={[0, -0.12, 0]}><cylinderGeometry args={[0.018, 0.018, 0.28, 5]} /><meshStandardMaterial color="#e76f8c" /></mesh>
      </group>
    );
  }
  if (activity === 'snack') {
    return (
      <group position={[0.2, 0, -0.3]}>
        <mesh position={[-0.1, 0.13, 0]}><cylinderGeometry args={[0.1, 0.08, 0.26, 8]} /><meshStandardMaterial color="#f2b85b" /></mesh>
        <mesh position={[0.2, 0.04, 0]}><boxGeometry args={[0.18, 0.08, 0.14]} /><meshStandardMaterial color="#dfb976" /></mesh>
      </group>
    );
  }
  if (activity === 'pretend') {
    return (
      <group position={[0, 1.9, -0.05]} rotation={[-0.1, 0, 0]}>
        <mesh><coneGeometry args={[0.14, 0.32, 8]} /><meshStandardMaterial color="#55b89b" /></mesh>
        <mesh position={[0, 0.16, 0]}><sphereGeometry args={[0.11, 8, 6]} /><meshStandardMaterial color="#fff0b8" /></mesh>
      </group>
    );
  }
  if (activity === 'circle') {
    return <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.38, 18]} /><meshStandardMaterial color="#8fd0c5" transparent opacity={0.72} /></mesh>;
  }
  if (role === 'teacher' && activity === 'supervise') {
    return <mesh position={[0.35, 0.55, -0.3]} rotation={[-0.4, 0, 0]}><boxGeometry args={[0.24, 0.34, 0.06]} /><meshStandardMaterial color="#68a9a7" /></mesh>;
  }
  return null;
}

function GardenEnvironment() {
  const imagination = useGameStore((state) => state.isImaginationMode);
  const quality = useGameStore((state) => state.quality);
  const qualitySettings = useQualitySettings();
  const { sky: gardenSky } = useWeather();
  const debugCollision = useMemo(() => collisionDebugEnabled(), []);
  const grass = imagination ? '#173d38' : '#91b976';
  const path = imagination ? '#7254b3' : '#e7cf9f';
  const wall = imagination ? '#315f58' : '#779b67';

  return (
    <group>
      {/* The garden rig now follows the same clock and weather as the hub, and
          reads the quality SETTINGS rather than comparing the raw preset string
          to 'high' - which quietly turned garden shadows off on Ultra. */}
      <ambientLight
        intensity={imagination ? 0.48 : gardenSky.ambientIntensity * 1.1}
        color={imagination ? '#8edcff' : gardenSky.ambientColor}
      />
      <directionalLight
        position={imagination ? [12, 22, 8] : gardenSky.sunPosition}
        intensity={imagination ? 1.35 : gardenSky.sunIntensity * 1.08}
        color={imagination ? '#ff8dcc' : gardenSky.sunColor}
        castShadow={qualitySettings.settings.shadows}
        shadow-mapSize-width={qualitySettings.settings.shadowMapSize}
        shadow-mapSize-height={qualitySettings.settings.shadowMapSize}
      />
      {debugCollision && <CollisionDebug zone="garden" />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[36, 36]} />
        <meshStandardMaterial color={grass} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.025, 2]} receiveShadow>
        <boxGeometry args={[2.8, 0.05, 31]} />
        <meshStandardMaterial color={path} roughness={0.92} />
      </mesh>
      <mesh position={[-3.5, 0.028, -3]} receiveShadow>
        <boxGeometry args={[18, 0.052, 2.2]} />
        <meshStandardMaterial color={path} roughness={0.92} />
      </mesh>
      {/* The narrow lookout spur visibly ends before the pond's collision edge. */}
      <mesh position={[5.85, 0.03, -1.6]} rotation={[0, -1.2, 0]} receiveShadow>
        <boxGeometry args={[3.05, 0.055, 1.05]} />
        <meshStandardMaterial color={path} roughness={0.92} />
      </mesh>
      <mesh position={[6.42, 0.034, -0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.62, 18]} />
        <meshStandardMaterial color={path} roughness={0.92} />
      </mesh>
      {WORLD_SOLIDS.filter((solid) => solid.zone === 'garden' && solid.kind === 'boundary').map((solid) => {
        const transform = getWorldSolidTransform(solid.id, 1.15);
        return (
          <mesh key={solid.id} position={transform.position} castShadow receiveShadow>
            <boxGeometry args={transform.size} />
            <meshStandardMaterial color={wall} roughness={0.9} />
          </mesh>
        );
      })}
      {['garden-greenhouse-west', 'garden-greenhouse-east', 'garden-greenhouse-north'].map((id) => {
        const transform = getWorldSolidTransform(id, 2.8);
        return (
          <mesh key={id} position={transform.position} castShadow>
            <boxGeometry args={transform.size} />
            <meshStandardMaterial color="#5d947d" transparent opacity={0.72} roughness={0.35} />
          </mesh>
        );
      })}
      <GardenBed id="garden-bed-west" color="#9b6745" />
      <GardenBed id="garden-bed-east" color="#82583f" />
      <Pond />
      <Gazebo />
      <GardenSessionStages />
    </group>
  );
}

function GardenBed({ id, color }: { id: string; color: string }) {
  const transform = getWorldSolidTransform(id, 0.42);
  return (
    <group position={transform.position}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={transform.size} />
        <meshStandardMaterial color={color} roughness={0.92} />
      </mesh>
      {[-0.65, 0, 0.65].map((z, index) => (
        <group key={z} position={[0, 0.22, z]}>
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.04, 0.055, 0.32, 7]} />
            <meshStandardMaterial color="#4f8d55" />
          </mesh>
          <mesh position={[0, 0.34, 0]}>
            <sphereGeometry args={[0.16 + index * 0.015, 9, 7]} />
            <meshStandardMaterial color={['#e8613c', '#ffd166', '#8a63c7'][index]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Pond() {
  const transform = getWorldSolidTransform('garden-pond', 0.08, 0.035);
  return (
    <group>
      <mesh position={transform.position} receiveShadow>
        <cylinderGeometry args={[2.85, 2.55, 0.08, 28]} />
        <meshStandardMaterial color="#62b8c7" roughness={0.3} metalness={0.05} />
      </mesh>
      {[-1.5, 0, 1.35].map((x, index) => (
        <mesh key={x} position={[10 + x, 0.1, -0.3 + index * 0.7]} rotation={[-Math.PI / 2, 0, index * 0.8]}>
          <circleGeometry args={[0.34, 12]} />
          <meshStandardMaterial color="#4f9d67" roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function Gazebo() {
  return (
    <group position={[0, 0, 6.1]}>
      {[-2.7, 2.7].flatMap((x) => [-2.7, 2.7].map((z) => (
        <mesh key={`${x}:${z}`} position={[x, 1.25, z]} castShadow>
          <cylinderGeometry args={[0.11, 0.14, 2.5, 8]} />
          <meshStandardMaterial color="#fff0c7" roughness={0.76} />
        </mesh>
      )))}
      <mesh position={[0, 2.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[4.2, 1.25, 4]} />
        <meshStandardMaterial color="#e88962" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.28, 0]} receiveShadow>
        <cylinderGeometry args={[3.2, 3.2, 0.18, 24]} />
        <meshStandardMaterial color="#e5cf9e" roughness={0.9} />
      </mesh>
    </group>
  );
}

function GardenSessionStages() {
  return (
    <group>
      {/* Fixed, low-profile stations let the rotating garden routine read as
          watering, pond watching, and circle time instead of hub activities. */}
      <group position={[-13.7, 0, 2.8]}>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.72, 16]} /><meshStandardMaterial color="#d9b77b" roughness={0.9} /></mesh>
        <mesh position={[-0.32, 0.2, 0.16]}><cylinderGeometry args={[0.16, 0.2, 0.32, 8]} /><meshStandardMaterial color="#4c82d4" /></mesh>
        <mesh position={[0.18, 0.1, -0.2]}><sphereGeometry args={[0.16, 8, 6]} /><meshStandardMaterial color="#55b89b" /></mesh>
      </group>
      <group position={[6.55, 0, -0.2]}>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.68, 16]} /><meshStandardMaterial color="#e7cf9f" roughness={0.92} /></mesh>
        <mesh position={[0.28, 0.12, 0]}><boxGeometry args={[0.34, 0.18, 0.22]} /><meshStandardMaterial color="#355272" /></mesh>
      </group>
      <mesh position={[0, 0.035, 9.25]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.35, 20]} /><meshStandardMaterial color="#8fd0c5" transparent opacity={0.7} /></mesh>
    </group>
  );
}

function GardenDetails() {
  return (
    <group>
      {TREES.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh position={[0, 1.25, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.32, 2.5, 9]} />
            <meshStandardMaterial color="#7a5236" roughness={0.9} />
          </mesh>
          <mesh position={[0, 2.8, 0]} scale={[1, 0.86, 1]} castShadow>
            <sphereGeometry args={[1.25, 12, 9]} />
            <meshStandardMaterial color="#4f9661" roughness={0.94} />
          </mesh>
        </group>
      ))}
      {FLOWERS.map(([x, z, color], index) => (
        <group key={`${x}:${z}`} position={[x, 0, z]} rotation={[0, index * 0.6, 0]}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.6, 6]} />
            <meshStandardMaterial color="#4f8d55" />
          </mesh>
          <mesh position={[0, 0.66, 0]} castShadow>
            <sphereGeometry args={[0.18, 8, 6]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, -15.7]}>
        <mesh position={[0, 0.95, 0]} castShadow>
          <boxGeometry args={[4.3, 1.8, 0.22]} />
          <meshStandardMaterial color="#fff0c7" roughness={0.82} />
        </mesh>
        <mesh position={[0, 0.98, -0.13]}>
          <boxGeometry args={[3.7, 1.22, 0.04]} />
          <meshStandardMaterial color="#4d9a73" roughness={0.76} />
        </mesh>
      </group>
      <SuppliedArtwork fileName="12_garden_signage.png" surfaceAnchor={{ solidId: 'garden-sign', face: 'south', height: 0.98 }} size={[3.55, 1.3]} support="none" />
      <GardenLearningMarkers />
    </group>
  );
}

function GardenLearningMarkers() {
  const markers = [
    [-10.8, 4.2, '#e8613c'],
    [10.8, 7.9, '#ffd166'],
    [5.25, -1.7, '#62b8c7'],
  ] as const;
  return (
    <group>
      {markers.map(([x, z, color], index) => (
        <group key={`${x}:${z}`} position={[x, 0, z]} rotation={[0, index === 2 ? -0.9 : x < 0 ? 0.18 : -0.18, 0]}>
          <mesh position={[0, 0.48, 0]}>
            <cylinderGeometry args={[0.04, 0.055, 0.96, 7]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.92} />
          </mesh>
          <mesh position={[0, 0.91, 0]}>
            <boxGeometry args={[0.72, 0.42, 0.08]} />
            <meshStandardMaterial color="#fff0c7" roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.92, -0.045]}>
            {index === 2
              ? <circleGeometry args={[0.12, 12]} />
              : <boxGeometry args={[0.2, 0.2, 0.025]} />}
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      ))}
      {[-5.4, -2.7, 0, 2.7, 5.4].map((z, index) => (
        <group key={z} position={[index % 2 ? 0.16 : -0.16, 0.055, z]} rotation={[0, index % 2 ? 0.22 : -0.22, 0]}>
          <mesh scale={[0.65, 0.2, 1]}><sphereGeometry args={[0.18, 9, 6]} /><meshBasicMaterial color={index % 2 ? '#f4a261' : '#4c82d4'} /></mesh>
        </group>
      ))}
    </group>
  );
}

export const GARDEN_LANDMARKS = [
  {
    id: 'pond',
    position: [6.42, 0, -0.2] as [number, number, number],
    color: '#62b8c7',
  },
  {
    id: 'gazebo',
    position: [0, 0, 2.45] as [number, number, number],
    color: '#e88962',
  },
  {
    id: 'greenhouse',
    position: [-7.9, 0, -8.5] as [number, number, number],
    color: '#5d947d',
  },
] as const;

function GardenLandmarks() {
  return (
    <group>
      {GARDEN_LANDMARKS.map((landmark) => (
        <GardenLandmark key={landmark.id} {...landmark} />
      ))}
    </group>
  );
}

function GardenLandmark({
  id,
  position,
  color,
}: {
  id: (typeof GARDEN_LANDMARKS)[number]['id'];
  position: [number, number, number];
  color: string;
}) {
  const interactionId = `garden-landmark-${id}`;
  const active = useGameStore((state) => state.activeInteractable === interactionId);
  const candidatePosition = useMemo(() => new THREE.Vector3(...position), [position]);
  const candidate = useMemo(() => ({
    id: interactionId,
    position: candidatePosition,
    range: 1.85,
    priority: 18,
    valid: true,
  }), [candidatePosition, interactionId]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);

  return (
    <group position={position}>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.48, 0.035, 8, 20]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.88 : 0.24} />
      </mesh>
      <mesh position={[0, 0.17, 0.38]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[0.5, 0.28, 0.05]} />
        <meshStandardMaterial color="#fff0c7" roughness={0.84} />
      </mesh>
      <mesh position={[0, 0.18, 0.35]}>
        <circleGeometry args={[0.07, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function GardenActivityHost({ bed, position: authoredPosition }: { bed: 0 | 1; position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const step = useGameStore((state) => bed === 0 ? state.gardenActivityStep : state.expansion.secondPlantingStep);
  const interactionId = `garden-activity-host-${bed}`;
  const active = useGameStore((state) => state.activeInteractable === interactionId);
  const position = useMemo(() => new THREE.Vector3(...authoredPosition), [authoredPosition]);
  const candidate = useMemo(() => ({
    id: interactionId,
    position,
    range: 2.4,
    priority: 72,
    valid: true,
  }), [interactionId, position]);

  useEffect(() => {
    return registerInteractionCandidate(candidate);
  }, [candidate]);
  useFrame((state, delta) => {
    updateInteractionCandidate(interactionId, { position, valid: true });
    if (!ref.current) return;
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 1.7) * 0.018;
    ref.current.rotation.y = THREE.MathUtils.lerp(
      ref.current.rotation.y,
      active ? -0.15 : 0.2,
      1 - Math.exp(-7 * delta),
    );
  });

  return (
    <group>
      <group ref={ref} position={authoredPosition}>
        {bed === 0 ? <CharacterModel
          bodyColor="#4f8d55"
          accentColor="#ffd166"
          hairColor="#6b4932"
          hairStyle="sprout"
          skinColor="#d99a72"
          mood="happy"
          accessory="badge"
          activityMode="gathering"
          motionSeed={4.2}
        /> : <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[1.3, 0.72, 0.72]} /><meshStandardMaterial color="#7a9b67" roughness={0.86} /></mesh>}
      </group>
      <group position={[authoredPosition[0], authoredPosition[1], authoredPosition[2] - 0.8]}>
        {[0, 1, 2].map((index) => (
          <group key={index} position={[-0.55 + index * 0.55, 0, 0]}>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.035, 0.045, 0.24, 7]} />
              <meshStandardMaterial color="#4f8d55" />
            </mesh>
            <mesh position={[0, 0.32, 0]} scale={index < step ? 1 : 0.35}>
              <sphereGeometry args={[0.13, 8, 6]} />
              <meshStandardMaterial color={['#e8613c', '#ffd166', '#8a63c7'][index]} />
            </mesh>
          </group>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <torusGeometry args={[1.05, 0.04, 8, 28]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={active ? 0.8 : 0.24} />
        </mesh>
      </group>
    </group>
  );
}

function GardenReturnGate() {
  const ref = useRef<THREE.Group>(null);
  const active = useGameStore((state) => state.activeInteractable === 'garden-return');
  const threshold = useMemo(() => getWorldSolidTransform('garden-return-threshold', 2.5, 1.25), []);
  const position = useMemo(() => new THREE.Vector3(threshold.position[0], 0, threshold.position[2]), [threshold]);
  const candidate = useMemo(() => ({
    id: 'garden-return',
    position,
    range: 2.8,
    priority: 90,
    valid: true,
  }), [position]);

  useEffect(() => {
    return registerInteractionCandidate(candidate);
  }, [candidate]);
  useFrame((state, delta) => {
    updateInteractionCandidate('garden-return', { position, valid: true });
    if (!ref.current) return;
    const targetScale = active ? 1.05 : 1;
    ref.current.scale.setScalar(THREE.MathUtils.lerp(ref.current.scale.x, targetScale, 1 - Math.exp(-8 * delta)));
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2.1) * 0.025;
  });

  return (
    <group ref={ref} position={[threshold.position[0], 0, threshold.position[2]]}>
      <mesh position={[-threshold.size[0] / 2 + 0.14, threshold.position[1], 0]} castShadow><boxGeometry args={[0.28, threshold.size[1], threshold.size[2]]} /><meshStandardMaterial color="#e88962" /></mesh>
      <mesh position={[threshold.size[0] / 2 - 0.14, threshold.position[1], 0]} castShadow><boxGeometry args={[0.28, threshold.size[1], threshold.size[2]]} /><meshStandardMaterial color="#e88962" /></mesh>
      <mesh position={[0, threshold.size[1] - 0.12, 0]} castShadow><boxGeometry args={[threshold.size[0], 0.25, threshold.size[2]]} /><meshStandardMaterial color="#e88962" /></mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[threshold.size[0] - 0.34, 1.85, threshold.size[2] - 0.08]} />
        <meshStandardMaterial color="#7a9b67" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.72, -threshold.size[2] / 2 - 0.05]} castShadow><boxGeometry args={[1.72, 0.5, 0.08]} /><meshStandardMaterial color="#fff0c7" /></mesh>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.045, 8, 28]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={active ? 0.78 : 0.28} />
      </mesh>
    </group>
  );
}

function GummyDropBed({ bed, position: authoredPosition }: { bed: 0 | 1; position: [number, number, number] }) {
  const crop = useGameStore((state) => bed === 0 ? state.gummyCrop : state.gummyCrop2);
  const day = useGameStore((state) => state.dayNumber);
  const minute = useGameStore((state) => state.clock.minute);
  const interactionId = `gummy-drop-bed-${bed}`;
  const active = useGameStore((state) => state.activeInteractable === interactionId);
  const position = useMemo(() => new THREE.Vector3(...authoredPosition), [authoredPosition]);
  const candidate = useMemo(() => ({ id: interactionId, position, range: 2.8, priority: 76, valid: true }), [interactionId, position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  const progress = cropProgress(crop, absoluteGameMinute(day, minute));
  return <group position={authoredPosition}>
    <mesh position={[0, 0.28, 0]}><boxGeometry args={[2.8, 0.5, 2.1]} /><meshStandardMaterial color="#74492f" roughness={0.96} /></mesh>
    {crop.plantedAt !== null && [-0.75, 0, 0.75].map((x, index) => <group key={x} position={[x, 0.55, 0]} scale={0.25 + progress * 0.9}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[0.035, 0.05, 0.7, 7]} /><meshStandardMaterial color="#4f8d55" /></mesh>
      <mesh position={[0, 0.82, 0]}><sphereGeometry args={[0.24, 10, 8]} /><meshStandardMaterial color={['#ff6b8a','#ffd166','#8a63c7'][index]} emissive={progress >= 1 ? '#5a3810' : '#000000'} emissiveIntensity={progress >= 1 ? 0.2 : 0} /></mesh>
    </group>)}
    <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[1.7, 0.05, 8, 28]} /><meshBasicMaterial color="#ffd166" transparent opacity={active ? 0.9 : 0.25} /></mesh>
  </group>;
}

function FishingSpot() {
  const active = useGameStore((state) => state.activeInteractable === 'garden-fishing-spot');
  const rod = useGameStore((state) => state.expansion.equippedRod);
  const catchSerial = useGameStore((state) => state.expansion.fishingCatchSerial);
  const previousCatch = useRef(catchSerial);
  const elapsed = useRef(0);
  const rodGroup = useRef<THREE.Group>(null);
  const catchGroup = useRef<THREE.Group>(null);
  const splash = useRef<THREE.Mesh>(null);
  const [catching, setCatching] = useState(false);
  const position = useMemo(() => new THREE.Vector3(6.35, 0, -0.2), []);
  const candidate = useMemo(() => ({ id: 'garden-fishing-spot', position, range: 3.1, priority: 82, valid: true }), [position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useEffect(() => {
    if (catchSerial <= previousCatch.current) return;
    previousCatch.current = catchSerial;
    elapsed.current = 0;
    setCatching(true);
  }, [catchSerial]);
  useFrame((_, delta) => {
    if (!catching) return;
    elapsed.current += delta;
    const t = Math.min(1, elapsed.current / 2.8);
    if (rodGroup.current) rodGroup.current.rotation.z = -0.34 - Math.sin(Math.min(1, t * 2.2) * Math.PI) * 0.22;
    if (catchGroup.current) {
      catchGroup.current.position.y = .12 + Math.min(1, t * 1.7) * 1.65;
      catchGroup.current.position.x = .9 - Math.min(1, t * 1.7) * .55;
      catchGroup.current.rotation.z = t * Math.PI * 2;
    }
    if (splash.current) splash.current.scale.setScalar(1 + Math.min(1, t * 4) * 1.8);
    if (t >= 1) { setCatching(false); if (rodGroup.current) rodGroup.current.rotation.z = -.34; }
  });
  return (
    <group position={[6.35, 0, -0.2]}>
      <group ref={rodGroup} rotation={[0, 0, -0.34]}><mesh position={[0, 0.62, 0]} castShadow><cylinderGeometry args={[0.035, 0.05, 1.35, 8]} /><meshStandardMaterial color={rod} roughness={0.66} /></mesh></group>
      <mesh position={[0.22, 0.7, 0]}><torusGeometry args={[0.13, 0.025, 8, 18]} /><meshStandardMaterial color="#d7dce2" metalness={0.45} /></mesh>
      {catching && <><mesh ref={splash} position={[.9, .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.12, .2, 18]} /><meshBasicMaterial color="#baf3ff" transparent opacity={.82} /></mesh><group ref={catchGroup} position={[.9, .12, 0]}><mesh scale={[1.5, .62, .35]}><sphereGeometry args={[.18, 12, 8]} /><meshStandardMaterial color="#e53935" emissive="#781714" emissiveIntensity={.25} /></mesh><mesh position={[-.28, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[.16, .24, 3]} /><meshStandardMaterial color="#ef5350" /></mesh></group></>}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}><torusGeometry args={[0.78, 0.045, 8, 28]} /><meshBasicMaterial color="#61d9ef" transparent opacity={active ? 0.92 : 0.28} /></mesh>
    </group>
  );
}

function FishingShop() {
  const active = useGameStore((state) => state.activeInteractable === 'garden-fishing-shop');
  const position = useMemo(() => new THREE.Vector3(8.15, 0, -2.2), []);
  const candidate = useMemo(() => ({ id: 'garden-fishing-shop', position, range: 2.4, priority: 80, valid: true }), [position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  return <group position={[8.15, 0, -2.2]}>
    <mesh position={[0, .55, 0]} castShadow><boxGeometry args={[1.7, 1.05, .8]} /><meshStandardMaterial color="#4c82d4" roughness={.8} /></mesh>
    <mesh position={[0, 1.25, 0]} castShadow><boxGeometry args={[2.05, .38, 1.05]} /><meshStandardMaterial color="#ffd166" /></mesh>
    <mesh position={[0, 1.22, -.55]}><boxGeometry args={[1.7, .55, .08]} /><meshStandardMaterial color="#fff0c7" /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .035, 0]}><torusGeometry args={[1.15, .045, 8, 28]} /><meshBasicMaterial color="#61d9ef" transparent opacity={active ? .92 : .25} /></mesh>
  </group>;
}

function SeedInspectionStation() {
  const active = useGameStore((state) => state.activeInteractable === 'seed-inspection');
  const position = useMemo(() => new THREE.Vector3(-8.2, 0, -8.2), []);
  const candidate = useMemo(() => ({ id: 'seed-inspection', position, range: 2.2, priority: 68, valid: true }), [position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  return (
    <group position={[-8.2, 0, -8.2]}>
      <mesh position={[0, 0.48, 0]} castShadow><boxGeometry args={[1.7, 0.85, 0.85]} /><meshStandardMaterial color="#e7bd71" roughness={0.85} /></mesh>
      <mesh position={[0, 1.02, 0]} rotation={[-0.18, 0, 0]}><boxGeometry args={[1.55, 0.52, 0.08]} /><meshStandardMaterial color="#fff0c7" /></mesh>
      <mesh position={[0, 1.03, -0.05]}><circleGeometry args={[0.13, 12]} /><meshBasicMaterial color="#4f8d55" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}><torusGeometry args={[1.05, 0.04, 8, 28]} /><meshBasicMaterial color="#ffd166" transparent opacity={active ? 0.9 : 0.25} /></mesh>
    </group>
  );
}
