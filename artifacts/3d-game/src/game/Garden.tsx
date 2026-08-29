import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { useGameStore } from './store';
import { getWorldSolidTransform, isWalkable, WORLD_SOLIDS } from './world';
import { CharacterModel, type CharacterModelProps } from './CharacterModel';
import { SuppliedArtwork } from './Artwork';
import { clearNpcNavigation, registerNpcPosition } from './navigation';
import { facingAngleForDirection, stepNpc } from './NPCs';
import {
  activitySessionIsInterrupted,
  getSharedActivitySession,
  reportSessionArrival,
  sessionParticipant,
  sessionSlotVector,
  type SharedActivityParticipant,
} from './activitySessions';

const FLOWERS = [
  [-15, -15, '#e8613c'], [-12.5, -14.2, '#ffd166'], [-9.8, -15, '#8a63c7'],
  [-6.5, -13.6, '#4c82d4'], [5.5, -14.4, '#e8613c'], [8, -15.2, '#ffd166'],
  [11, -13.8, '#d76f78'], [14.6, -14.8, '#55b89b'], [-15.2, 8, '#ffd166'],
  [-14.3, 11, '#4c82d4'], [14.8, 5.5, '#e8613c'], [15.1, 9, '#8a63c7'],
] as const;

const TREES = [
  [-14.5, -1], [-7, 11.8], [6.4, 11.5], [14.2, -8.5], [2, -13.8],
] as const;

type GardenActivity = 'water' | 'inspect' | 'pond-watch' | 'gazebo-talk' | 'play' | 'supervise' | 'social-walk';

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
    ],
  },
];

export function Garden() {
  return (
    <group>
      <GardenEnvironment />
      <GardenDetails />
      <GardenCast />
      <GardenActivityHost />
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
  return (
    <group>
      {GARDEN_CAST.map((definition) => (
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
    lastPosition: new THREE.Vector3(...firstStop.position),
  });
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
    if (visibleParticipant?.activity !== sharedParticipantRef.current?.activity || visibleParticipant?.role !== sharedParticipantRef.current?.role || (!visibleParticipant && sharedParticipantRef.current)) {
      sharedParticipantRef.current = visibleParticipant;
      setSharedParticipant(visibleParticipant);
    }
    if (participant) destination.copy(sessionSlotVector(participant));
    else destination.set(...stop.position);
    const distance = ref.current.position.distanceTo(destination);
    const arrived = distance < 0.5;
    if (arrived && routeState.current.dwellUntil === 0) {
      routeState.current.dwellUntil = session
        ? session.endsAt ?? Number.POSITIVE_INFINITY
        : state.clock.elapsedTime + 5.5 + (definition.name.length % 3);
    } else if (!participant && arrived && state.clock.elapsedTime >= routeState.current.dwellUntil) {
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
        definition.role === 'teacher' ? 1.18 : 1.08,
        'garden',
      );
      const moved = ref.current.position.distanceTo(routeState.current.lastPosition);
      routeState.current.stuckFor = moved < 0.002 ? routeState.current.stuckFor + delta : 0;
      if (routeState.current.stuckFor > 2.6) {
        clearNpcNavigation(`garden-npc-${definition.name}`);
        if (!participant) routeState.current.index = (routeState.current.index + 1) % route.length;
        routeState.current.dwellUntil = 0;
        routeState.current.stuckFor = 0;
      }
    } else {
      turnToward(ref.current, participant ? new THREE.Vector3(...participant.focus) : gardenActivityFocus(stop.activity, destination), delta);
      if (participant && session?.phase === 'gathering') {
        reportSessionArrival('garden', 'garden-routine', session.id, definition.name, state.clock.elapsedTime);
      }
    }

    const nextActivity = participant && session?.phase === 'active' && arrived
      ? gardenSessionActivity(participant)
      : arrived && routeState.current.dwellUntil > state.clock.elapsedTime ? stop.activity : null;
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
          isTalking={activeDialogue?.name === definition.name || Boolean(settledActivity && sharedParticipant?.activity === 'conversation')}
          imaginationMode={imagination}
          activityMode={gardenActivityMode(settledActivity)}
          motionSeed={definition.name.length * 0.71}
          idleEnergy={0.65}
        />
      </group>
       {settledActivity && sharedParticipant && <GardenSessionProp participant={sharedParticipant} />}
       {settledActivity && !sharedParticipant && <GardenActivityProp activity={settledActivity} role={definition.role} />}
    </group>
  );
}

function gardenSessionActivity(participant: SharedActivityParticipant): GardenActivity {
  if (participant.activity === 'teacher-help' || participant.activity === 'teacher-observation' || participant.activity === 'teacher-praise') return 'supervise';
  return participant.activity === 'toy-play' ? 'play' : 'gazebo-talk';
}

function GardenSessionProp({ participant }: { participant: SharedActivityParticipant }) {
  if (participant.activity === 'teacher-help' || participant.activity === 'teacher-observation') {
    return <mesh position={[0.4, 0.9, -0.3]}><boxGeometry args={[0.24, 0.34, 0.06]} /><meshStandardMaterial color="#68a9a7" /></mesh>;
  }
  return <mesh position={[0.42, 0.82, -0.28]}><boxGeometry args={[0.26, 0.2, 0.05]} /><meshStandardMaterial color="#fff1cf" /></mesh>;
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
  return position.clone().add(new THREE.Vector3(1, 0, -0.5));
}

function gardenActivityMode(activity: GardenActivity | null): NonNullable<CharacterModelProps['activityMode']> {
  if (activity === 'play') return 'playing';
  if (activity === 'pond-watch' || activity === 'gazebo-talk') return 'gathering';
  return activity ? 'standing' : 'standing';
}

function GardenActivityProp({ activity, role }: { activity: GardenActivity; role: GardenNpcDefinition['role'] }) {
  if (activity === 'water') {
    return (
      <group position={[0.42, 0.72, -0.28]} rotation={[0, 0, -0.18]}>
        <mesh><cylinderGeometry args={[0.11, 0.13, 0.28, 8]} /><meshStandardMaterial color="#4c82d4" /></mesh>
        <mesh position={[0.16, 0.03, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.04, 0.06, 0.28, 7]} /><meshStandardMaterial color="#4c82d4" /></mesh>
      </group>
    );
  }
  if (activity === 'inspect') {
    return <mesh position={[0.38, 0.86, -0.32]}><torusGeometry args={[0.11, 0.025, 8, 18]} /><meshStandardMaterial color="#e6ae2f" /></mesh>;
  }
  if (activity === 'pond-watch') {
    return <mesh position={[0.36, 0.88, -0.32]}><boxGeometry args={[0.3, 0.18, 0.12]} /><meshStandardMaterial color="#355272" /></mesh>;
  }
  if (activity === 'play') {
    return <mesh position={[0.5, 0.2, -0.4]}><sphereGeometry args={[0.18, 10, 8]} /><meshStandardMaterial color="#e8613c" /></mesh>;
  }
  if (role === 'teacher' && activity === 'supervise') {
    return <mesh position={[0.4, 0.9, -0.3]}><boxGeometry args={[0.24, 0.34, 0.06]} /><meshStandardMaterial color="#68a9a7" /></mesh>;
  }
  return null;
}

function GardenEnvironment() {
  const imagination = useGameStore((state) => state.isImaginationMode);
  const grass = imagination ? '#173d38' : '#91b976';
  const path = imagination ? '#7254b3' : '#e7cf9f';
  const wall = imagination ? '#315f58' : '#779b67';

  return (
    <group>
      <ambientLight intensity={imagination ? 0.48 : 0.78} color={imagination ? '#8edcff' : '#fff7df'} />
      <directionalLight position={[12, 22, 8]} intensity={imagination ? 1.35 : 1.05} color={imagination ? '#ff8dcc' : '#fff1c7'} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[36, 36]} />
        <meshStandardMaterial color={grass} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.025, 2]} receiveShadow>
        <boxGeometry args={[2.8, 0.05, 31]} />
        <meshStandardMaterial color={path} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.028, -3]} receiveShadow>
        <boxGeometry args={[25, 0.052, 2.2]} />
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
    </group>
  );
}

function GardenActivityHost() {
  const ref = useRef<THREE.Group>(null);
  const step = useGameStore((state) => state.gardenActivityStep);
  const active = useGameStore((state) => state.activeInteractable === 'garden-activity-host');
  const position = useMemo(() => new THREE.Vector3(-10.8, 0, 5.35), []);
  const candidate = useMemo(() => ({
    id: 'garden-activity-host',
    position,
    range: 2.4,
    priority: 72,
    valid: true,
  }), [position]);

  useEffect(() => {
    return registerInteractionCandidate(candidate);
  }, [candidate]);
  useFrame((state, delta) => {
    updateInteractionCandidate('garden-activity-host', { position, valid: true });
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
      <group ref={ref} position={[-10.8, 0, 5.35]}>
        <CharacterModel
          bodyColor="#4f8d55"
          accentColor="#ffd166"
          hairColor="#6b4932"
          hairStyle="sprout"
          skinColor="#d99a72"
          mood="happy"
          accessory="badge"
          activityMode="gathering"
          motionSeed={4.2}
        />
      </group>
      <group position={[-10.8, 0, 4.55]}>
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
  const position = useMemo(() => new THREE.Vector3(0, 0, 16), []);
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
    <group ref={ref} position={[0, 0, 16]}>
      <mesh position={[-1.05, 1.25, 0]} castShadow><boxGeometry args={[0.25, 2.5, 0.35]} /><meshStandardMaterial color="#e88962" /></mesh>
      <mesh position={[1.05, 1.25, 0]} castShadow><boxGeometry args={[0.25, 2.5, 0.35]} /><meshStandardMaterial color="#e88962" /></mesh>
      <mesh position={[0, 2.42, 0]} castShadow><boxGeometry args={[2.35, 0.25, 0.35]} /><meshStandardMaterial color="#e88962" /></mesh>
      <mesh position={[0, 1.72, -0.2]} castShadow><boxGeometry args={[1.55, 0.5, 0.08]} /><meshStandardMaterial color="#fff0c7" /></mesh>
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.045, 8, 28]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={active ? 0.78 : 0.28} />
      </mesh>
    </group>
  );
}