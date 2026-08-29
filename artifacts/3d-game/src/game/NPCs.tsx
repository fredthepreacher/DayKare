import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
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

export function NPCs({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
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
) {
  if (schedule === 'outdoor-play' && !isRainy) return new THREE.Vector3(12 + Math.cos(phase) * 2.2, 0, Math.sin(phase) * 8);
  if (schedule === 'outdoor-play') return new THREE.Vector3(4.8 + Math.cos(phase) * 1.2, 0, -5.2 + Math.sin(phase));
  if (schedule === 'art-time') return new THREE.Vector3(-12 + Math.cos(phase) * 1.7, 0, -12 + Math.sin(phase) * 1.7);
  if (schedule === 'juice-club') return new THREE.Vector3(Math.cos(phase) * 4.5, 0, Math.sin(phase) * 4);
  if (schedule === 'pickup') return new THREE.Vector3(-6 + Math.cos(phase), 0, Math.sin(phase) * 4.8);
  return new THREE.Vector3(...defaultPos);
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
  ref.lookAt(navTarget.x, ref.position.y, navTarget.z);
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
  const mirror = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const suspicionAccumulator = useRef(0);
  useEffect(() => registerNpcPosition(`teacher-${name}`, mirror), [name, mirror]);
  const destination = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    destination.set(...defaultPos);
    if (name === 'Ms. Harper' && schedule === 'outdoor-play' && !isRainy) destination.set(10, 0, -2);
    if (name === 'Ms. Harper' && schedule === 'art-time') destination.set(-10, 0, -11);
    stepNpc(`teacher-${name}`, ref.current, destination, playerRef.current, delta, 1.4);
    mirror.copy(ref.current.position);

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
        <CharacterModel bodyColor={color} accentColor={accent} hairColor={hairColor} hairStyle={hairStyle} skinColor={skinColor} mood="curious" isTeacher isTalking={activeDialogue?.name === name} imaginationMode={imagination} motionSeed={namePhase(name)} idleEnergy={0.55} />
      </group>
    </group>
  );
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
  const phase = useMemo(() => namePhase(name), [name]);
  const mirror = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
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
    const destination = scheduleDestination(schedule, isRainy, defaultPos, phase);
    destination.x += Math.sin(state.clock.elapsedTime * 0.45 + phase) * 0.55;
    destination.z += Math.cos(state.clock.elapsedTime * 0.37 + phase) * 0.55;
    const paused = Math.sin(state.clock.elapsedTime * 0.48 + phase) > 0.82;
    if (active && playerRef.current) {
      ref.current.lookAt(playerRef.current.position.x, ref.current.position.y, playerRef.current.position.z);
    } else if (!paused) {
      stepNpc(`kid-${name}`, ref.current, destination, playerRef.current, delta, 1.15);
    }
    mirror.copy(ref.current.position);
    updateInteractionCandidate(`kid-${name}`, { position: mirror, valid: true });
  });

  return (
    <group ref={ref} position={defaultPos}>
      <CharacterModel bodyColor={imagination ? '#ff006e' : color} accentColor={accent} hairColor={hairColor} hairStyle={hairStyle} skinColor={skinColor} mood={mood} isTalking={activeDialogue?.name === name} imaginationMode={imagination} motionSeed={phase} idleEnergy={0.8 + (phase % 0.5)} />
    </group>
  );
}