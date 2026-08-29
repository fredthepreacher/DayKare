import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CharacterModel, type CharacterModelProps } from './CharacterModel';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { getNavigationTarget, registerNpcPosition } from './navigation';
import { useGameStore } from './store';
import { resolveMovement } from './world';

type KidDefinition = {
  name: string;
  color: string;
  accent: string;
  hairColor: string;
  hairStyle: NonNullable<CharacterModelProps['hairStyle']>;
  skinColor: string;
  defaultPos: [number, number, number];
};

const KID_CAST: KidDefinition[] = [
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
];

function namePhase(name: string) {
  return [...name].reduce((total, character) => total + character.charCodeAt(0), 0) * 0.37;
}

let nextGreetingAt = 0;
let greetingClearTimer: ReturnType<typeof setTimeout> | null = null;

export function NPCs({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
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
  const targetAngle = Math.atan2(offset.x, offset.z);
  const difference = THREE.MathUtils.euclideanModulo(targetAngle - ref.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
  ref.rotation.y += difference * (1 - Math.exp(-8 * delta));
}

function stepNpc(
  id: string,
  ref: THREE.Group,
  destination: THREE.Vector3,
  player: THREE.Group | null,
  delta: number,
  speed: number,
) {
  const navTarget = getNavigationTarget(id, ref.position, destination);
  const direction = navTarget.clone().sub(ref.position).setY(0);
  if (player) {
    const fromPlayer = ref.position.clone().sub(player.position).setY(0);
    const playerDistance = fromPlayer.length();
    if (playerDistance < 1.2 && playerDistance > 0.001) direction.add(fromPlayer.normalize().multiplyScalar(1.2 - playerDistance));
  }
  if (direction.lengthSq() < 0.002) return;
  direction.normalize();
  const desired = ref.position.clone().addScaledVector(direction, Math.min(speed * delta, ref.position.distanceTo(navTarget)));
  const resolved = resolveMovement(ref.position, desired, 0.34, 0.24);
  ref.position.copy(resolved);
  smoothTurn(ref, navTarget, delta);
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
  const isRainy = useGameStore((state) => state.isRainy);
  const suspicion = useGameStore((state) => state.teacherSuspicion);
  const trusted = useGameStore((state) => state.progression.trustedHelperPass);
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
  const patrol = useRef({ key: '', index: 0, dwellUntil: 0 });
  const [isSupervising, setIsSupervising] = useState(false);
  const supervisingRef = useRef(false);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const key = `${schedule}:${isRainy}`;
    const spots = teacherPatrolSpots(name, schedule, isRainy, defaultPos);
    if (patrol.current.key !== key) {
      patrol.current = { key, index: 0, dwellUntil: 0 };
    }
    destination.set(...spots[patrol.current.index % spots.length]);
    const arrived = ref.current.position.distanceTo(destination) < 0.48;
    if (arrived && patrol.current.dwellUntil === 0) {
      patrol.current.dwellUntil = state.clock.elapsedTime + 4.5 + (namePhase(name) % 2.5);
    } else if (arrived && state.clock.elapsedTime >= patrol.current.dwellUntil) {
      patrol.current.index = (patrol.current.index + 1) % spots.length;
      patrol.current.dwellUntil = 0;
    }
    const supervising = arrived && patrol.current.dwellUntil > state.clock.elapsedTime;
    if (supervising !== supervisingRef.current) {
      supervisingRef.current = supervising;
      setIsSupervising(supervising);
    }
    if (active && playerRef.current) {
      smoothTurn(ref.current, playerRef.current.position, delta);
    } else if (!arrived) {
      stepNpc(`teacher-${name}`, ref.current, destination, playerRef.current, delta, name === 'Mr. Davis' ? 1.25 : 1.35);
    }
    mirror.copy(ref.current.position);
    updateInteractionCandidate(`teacher-${name}`, { position: mirror, valid: true });

    if (name === 'Ms. Harper' && playerRef.current) {
      suspicionAccumulator.current += delta;
      if (suspicionAccumulator.current < 0.1) return;
      const suspicionDelta = suspicionAccumulator.current;
      suspicionAccumulator.current = 0;
      const inStorage = playerRef.current.position.x < -8 && playerRef.current.position.z > 8;
      const store = useGameStore.getState();
      if (inStorage && !trusted) {
        store.setTeacherSuspicion((current) => {
          const next = current + suspicionDelta * 20;
          if (next >= 100) {
            store.triggerTeleport();
            store.setActiveDialogue({ name: 'Ms. Harper', text: 'Storage is off limits until you earn a Trusted Helper Pass.' });
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

  return (
    <group ref={ref} position={defaultPos}>
      <group scale={1.28}>
        <CharacterModel bodyColor={color} accentColor={accent} hairColor={hairColor} hairStyle={hairStyle} skinColor={skinColor} mood="curious" isTeacher isTalking={activeDialogue?.name === name} imaginationMode={imagination} motionSeed={namePhase(name)} idleEnergy={0.55} activityMode={isSupervising ? 'gathering' : 'standing'} />
      </group>
      {isSupervising && (
        <TeacherProp name={name} schedule={schedule} />
      )}
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
  const isRainy = useGameStore((state) => state.isRainy);
  const imagination = useGameStore((state) => state.isImaginationMode);
  const activeDialogue = useGameStore((state) => state.activeDialogue);
  const active = useGameStore((state) => state.activeInteractable === `kid-${name}`);
  const mood = useGameStore((state) => state.friends[name]?.mood ?? 'happy');
  const waitingCustomers = useGameStore((state) => state.waitingCustomers);
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const phase = useMemo(() => namePhase(name), [name]);
  const mirror = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const activityTarget = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const activityState = useRef({
    key: '',
    dwellUntil: 0,
    arrived: false,
    cycle: 0,
    stuckFor: 0,
    lastPosition: new THREE.Vector3(...defaultPos),
  });
  const candidate = useMemo(() => ({
    id: `kid-${name}`,
    position: mirror,
    range: 2.1,
    priority: name === 'Leo' || name === 'Mia' || name === 'Sam' ? 55 : 35,
    valid: true,
  }), [mirror, name]);
  useEffect(() => registerNpcPosition(`kid-${name}`, mirror), [mirror, name]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const activityKey = `${schedule}:${isRainy}`;
    if (activityState.current.key !== activityKey) {
      activityState.current.key = activityKey;
      activityState.current.dwellUntil = 0;
      activityState.current.arrived = false;
      activityState.current.cycle = 0;
      activityState.current.stuckFor = 0;
      activityTarget.copy(kidDestination(name, schedule, isRainy, defaultPos, phase, 0, waitingCustomers));
    }
    let distanceToActivity = ref.current.position.distanceTo(activityTarget);
    if (schedule === 'juice-club') {
      const queueTarget = kidDestination(name, schedule, isRainy, defaultPos, phase, activityState.current.cycle, waitingCustomers);
      if (queueTarget.distanceToSquared(activityTarget) > 0.01) {
        activityTarget.copy(queueTarget);
        activityState.current.arrived = false;
        activityState.current.dwellUntil = 0;
        distanceToActivity = ref.current.position.distanceTo(activityTarget);
      }
    }
    if (distanceToActivity < 0.48 && !activityState.current.arrived) {
      activityState.current.arrived = true;
      activityState.current.dwellUntil = state.clock.elapsedTime + 3.5 + (phase % 3);
    }
    if (active && playerRef.current) {
      smoothTurn(ref.current, playerRef.current.position, delta);
    } else if (distanceToActivity >= 0.48) {
      activityState.current.arrived = false;
      stepNpc(`kid-${name}`, ref.current, activityTarget, playerRef.current, delta, 1.15);
      const moved = ref.current.position.distanceTo(activityState.current.lastPosition);
      activityState.current.stuckFor = moved < 0.002
        ? activityState.current.stuckFor + delta
        : 0;
      if (activityState.current.stuckFor > 2.8) {
        activityState.current.cycle += 1;
        activityState.current.stuckFor = 0;
        activityTarget.copy(kidDestination(name, schedule, isRainy, defaultPos, phase, activityState.current.cycle, waitingCustomers));
      }
    } else if (state.clock.elapsedTime >= activityState.current.dwellUntil) {
      activityState.current.cycle += 1;
      activityState.current.arrived = false;
      activityState.current.dwellUntil = 0;
      activityTarget.copy(kidDestination(name, schedule, isRainy, defaultPos, phase, activityState.current.cycle, waitingCustomers));
    }
    const settled = activityState.current.arrived
      && state.clock.elapsedTime < activityState.current.dwellUntil
      && distanceToActivity < 0.48;
    if (settled !== settledRef.current) {
      settledRef.current = settled;
      setSettled(settled);
    }
    if (
      settled
      && playerRef.current
      && state.clock.elapsedTime >= nextGreetingAt
      && ref.current.position.distanceTo(playerRef.current.position) < 2.15
    ) {
      const game = useGameStore.getState();
      if (game.zone === 'hub' && !game.activeDialogue && !game.journalOpen && !game.zoneTransitioning && !game.activeInteractable) {
        game.setAmbientMessage(kidGreeting(name, schedule));
        if (greetingClearTimer) clearTimeout(greetingClearTimer);
        greetingClearTimer = setTimeout(() => useGameStore.getState().setAmbientMessage(null), 3200);
        nextGreetingAt = state.clock.elapsedTime + 12 + (phase % 5);
      }
    }
    activityState.current.lastPosition.copy(ref.current.position);
    mirror.copy(ref.current.position);
    updateInteractionCandidate(`kid-${name}`, { position: mirror, valid: true });
  });

  return (
    <group ref={ref} position={defaultPos}>
      <CharacterModel bodyColor={imagination ? '#ff006e' : color} accentColor={accent} hairColor={hairColor} hairStyle={hairStyle} skinColor={skinColor} mood={mood} isTalking={activeDialogue?.name === name} imaginationMode={imagination} motionSeed={phase} idleEnergy={0.8 + (phase % 0.5)} accessory={Math.floor(phase) % 2 === 0 ? 'backpack' : 'badge'} activityMode={settled ? kidActivityMode(schedule, isRainy, phase) : 'standing'} />
      {settled && <ActivityProp schedule={schedule} rainy={isRainy} phase={phase} />}
      {settled && <SocialGameMarker schedule={schedule} phase={phase} cycle={activityState.current.cycle} />}
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
) {
  const queueIndex = schedule === 'juice-club' ? waitingCustomers.indexOf(name) : -1;
  // Customers are visibly ordered from the counter outward; everyone else still
  // uses the existing Juice Club gathering destinations.
  if (queueIndex >= 0) return new THREE.Vector3(2.05 - Math.min(queueIndex, 4) * 0.68, 0, -1.92);
  // On every third stop, pairs briefly share a recognizable game/table area.
  // Their individual dwell clocks naturally split the cluster back apart.
  if (cycle % 3 === 0) {
    const pair = Math.floor(KID_CAST.findIndex((kid) => kid.name === name) / 2);
    const groupSpots: Partial<Record<string, [number, number, number][]>> = {
      'morning-play': [[-2.7, 0, 1.4], [0.5, 0, 3.1], [2.8, 0, 0.5], [-0.2, 0, -1.8], [3.1, 0, 2.6]],
      'art-time': [[-14.1, 0, -11.5], [-12.6, 0, -9.5], [-9.7, 0, -10.6], [-9.7, 0, -13.5], [-12.2, 0, -14.6]],
      'outdoor-play': rainy
        ? [[3.4, 0, -6.2], [1.5, 0, -5.2], [-1.4, 0, -5.5], [2.5, 0, -4.6], [-3.1, 0, -5.5]]
        : [[10.3, 0, -10.7], [13.6, 0, -8.2], [10.6, 0, -1.6], [14.1, 0, 1.1], [13.6, 0, 8.4]],
    };
    const spots = groupSpots[schedule];
    if (spots) return new THREE.Vector3(...spots[pair % spots.length]);
  }
  return scheduleDestination(schedule, rainy, defaultPos, phase, cycle);
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
  if (schedule === 'art-time') return Math.floor(phase) % 3 === 0 ? 'sitting' : 'playing';
  if (schedule === 'juice-club') return 'gathering';
  if (schedule === 'outdoor-play' && rainy) return Math.floor(phase) % 2 === 0 ? 'sitting' : 'playing';
  if (schedule === 'outdoor-play') return 'playing';
  if (schedule === 'pickup') return 'gathering';
  return Math.floor(phase) % 2 === 0 ? 'playing' : 'gathering';
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
      ) return;
      const scheduleMessages = messages[state.schedule] ?? messages['morning-play'];
      const message = scheduleMessages[messageIndex.current % scheduleMessages.length];
      messageIndex.current += 1;
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
    };
  }, []);
  return null;
}

function ActivityProp({ schedule, rainy, phase }: { schedule: string; rainy: boolean; phase: number }) {
  const prop = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!prop.current) return;
    prop.current.position.y = 0.75 + Math.sin(state.clock.elapsedTime * 2.2 + phase) * 0.035;
    prop.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.8 + phase) * 0.18;
  });

  if (schedule === 'art-time') {
    return (
      <group ref={prop} position={[0.42, 0.75, -0.32]} rotation={[0, 0, -0.35]}>
        <mesh><cylinderGeometry args={[0.025, 0.025, 0.58, 6]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
        <mesh position={[0, -0.31, 0]}><coneGeometry args={[0.07, 0.16, 6]} /><meshStandardMaterial color="#e8613c" /></mesh>
      </group>
    );
  }
  if (schedule === 'outdoor-play' && rainy) {
    return (
      <group ref={prop} position={[0, 0.75, -0.42]} rotation={[0.18, 0, 0]}>
        <mesh position={[-0.18, 0, 0]}><boxGeometry args={[0.34, 0.04, 0.42]} /><meshStandardMaterial color="#4c82d4" /></mesh>
        <mesh position={[0.18, 0, 0]}><boxGeometry args={[0.34, 0.04, 0.42]} /><meshStandardMaterial color="#f2b85b" /></mesh>
      </group>
    );
  }
  if (schedule === 'juice-club') {
    return (
      <group ref={prop} position={[0.34, 0.75, -0.3]}>
        <mesh><cylinderGeometry args={[0.11, 0.09, 0.28, 8]} /><meshStandardMaterial color="#f2b85b" transparent opacity={0.88} /></mesh>
        <mesh position={[0.02, 0.19, 0]} rotation={[0, 0, -0.18]}><cylinderGeometry args={[0.012, 0.012, 0.25, 5]} /><meshBasicMaterial color="#d76f78" /></mesh>
      </group>
    );
  }
  if (schedule === 'outdoor-play') {
    return (
      <mesh ref={prop} position={[0.42, 0.75, -0.32]}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color="#e8613c" roughness={0.8} />
      </mesh>
    );
  }
  if (schedule === 'pickup') {
    return (
      <group ref={prop} position={[0.38, 0.75, -0.28]}>
        <mesh><boxGeometry args={[0.3, 0.32, 0.18]} /><meshStandardMaterial color="#55b89b" /></mesh>
        <mesh position={[0, 0.2, 0]}><torusGeometry args={[0.11, 0.025, 6, 10]} /><meshStandardMaterial color="#fff0b8" /></mesh>
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