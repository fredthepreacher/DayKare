import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { ANIMATION_CLIPS, HEIST_STEPS } from './finalMaster';
import { useFinalMasterStore } from './finalMasterStore';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { getTrackedPlayerPosition } from './world';

const STEP_POSITIONS: [number, number, number][] = [[10, 0, 10.7], [-5.5, 0, -5], [-12, 0, -9], [4.2, 0, 1], [-13, 0, 11.5], [13.2, 0, 11.5]];
const HEIST_EVENT_POSITIONS: Record<string, [number, number, number]> = {
  'miss-leslie-intro': [10, 0, 10.7], 'scope-window': [-5.5, 0, -5], 'scope-hall': [-10, 0, 0],
  'scope-gate': [12, 0, -10.5], 'mia-door': [-12, 0, -9], 'noah-distraction': [4.2, 0, 1],
  'grabber-collected': [-13, 0, 11.5], 'finale-regroup': [13.2, 0, 11.5],
};

function useCandidate(id: string, position: [number, number, number], valid: boolean, priority = 80, range = 2.65, forcePriority = false) {
  const vector = useMemo(() => new THREE.Vector3(...position), [position]);
  const candidate = useMemo(() => ({ id, position: vector, range, priority, valid, questPriority: valid && forcePriority, forcePriority }), [forcePriority, id, vector, priority, range, valid]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate(id, { position: vector, valid, questPriority: valid }));
}

function MissLeslie() {
  const active = useFinalMasterStore((state) => state.heistStatus === 'active');
  useCandidate('final-miss-leslie', [10, 0, 10.7], true, 96, 3.6);
  return <group position={[10, 0, 10.7]} rotation={[0, -0.7, 0]} scale={1.12}>
    <CharacterModel bodyColor="#f2c94c" accentColor="#fff2a8" bottomColor="#3973b8" hairColor="#4a2d25" hairStyle="pigtails" skinColor="#9a5d3c" eyeColor="#3b241f" isTeacher glasses cane isTalking={active} activityMode={active ? 'conversation' : 'standing'} idleVariant="look-around" motionSeed={12} />
    <Text position={[0, 2.25, 0]} fontSize={0.25} color="#4a2d25" anchorX="center">MISS LESLIE</Text>
  </group>;
}

function HeistBoard() {
  const status = useFinalMasterStore((state) => state.heistStatus);
  const step = useFinalMasterStore((state) => state.heistStep);
  const completed = useFinalMasterStore((state) => state.heistCompletedEvents);
  const tutorialComplete = useFinalMasterStore((state) => state.tutorialComplete);
  const heistsCompleted = useFinalMasterStore((state) => state.heistsCompleted);
  const successfulFinales = useFinalMasterStore((state) => state.successfulFinales);
  const totalHeistRbEarned = useFinalMasterStore((state) => state.totalHeistRbEarned);
  const activeStep = HEIST_STEPS[Math.min(step, HEIST_STEPS.length - 1)];
  const event = activeStep?.events.find((candidate) => !completed.includes(candidate)) ?? activeStep?.events[0];
  const worldTarget = event !== 'miss-leslie-intro';
  const position = event ? HEIST_EVENT_POSITIONS[event] : STEP_POSITIONS[Math.min(step, STEP_POSITIONS.length - 1)];
  useCandidate(`final-heist-${event ?? 'none'}`, position, tutorialComplete && status === 'active' && Boolean(event) && worldTarget, 100, 4.5, true);
  return <>
    <group position={[13.25, 0, 11.6]}>
      <mesh position={[0, 1, 0]} castShadow><boxGeometry args={[2.1, 1.65, 0.16]} /><meshStandardMaterial color="#6e4935" /></mesh>
      <mesh position={[0, 1.02, -0.1]}><boxGeometry args={[1.78, 1.28, 0.04]} /><meshStandardMaterial color="#e8a84d" /></mesh>
      <Text position={[0, 1.35, -0.14]} rotation={[0, Math.PI, 0]} fontSize={0.2} color="#4b3023" anchorX="center">HEIST BOARD</Text>
      <Text position={[0, 0.93, -0.14]} rotation={[0, Math.PI, 0]} maxWidth={1.45} fontSize={0.115} color="#4b3023" anchorX="center">Mia + Noah · teamwork only</Text>
      <Text position={[0, 0.64, -0.14]} rotation={[0, Math.PI, 0]} maxWidth={1.65} fontSize={0.095} color="#4b3023" anchorX="center">{status === 'active' ? `${activeStep.title} · ${completed.length}/${activeStep.events.length}` : 'Current Heist · ready at Miss Leslie'}</Text>
      <Text position={[0, 0.39, -0.14]} rotation={[0, Math.PI, 0]} maxWidth={1.65} fontSize={0.078} color="#4b3023" anchorX="center">{heistsCompleted} heists · {successfulFinales} finales · {totalHeistRbEarned} RB earned</Text>
    </group>
    {status === 'active' && worldTarget && <group position={position}><mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.8, 1.08, 28]} /><meshBasicMaterial color="#ffd84d" transparent opacity={0.82} /></mesh><Text position={[0, 1.15, 0]} fontSize={0.22} color="#5b351f" anchorX="center">{HEIST_STEPS[Math.min(step, HEIST_STEPS.length - 1)].title}</Text></group>}
  </>;
}

function HeistRoom() {
  return <group>
    <mesh position={[12, .02, 11.7]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6.4, 6.1]} /><meshStandardMaterial color="#75508f" /></mesh>
    <mesh position={[12, 1.15, 14.9]}><boxGeometry args={[6.2, 2.3, .14]} /><meshStandardMaterial color="#edd8a7" /></mesh>
    <mesh position={[11.7, .48, 13.2]} castShadow><boxGeometry args={[2.3, .95, 1.05]} /><meshStandardMaterial color="#b87b50" /></mesh>
    <Text position={[12, 2.05, 14.8]} fontSize={.32} color="#59386c" anchorX="center">MISS LESLIE'S HEIST ROOM</Text>
    <Text position={[12, 1.58, 14.8]} fontSize={.14} color="#735081" anchorX="center">MAPS · NOTES · TEAMWORK</Text>
  </group>;
}

function TutorialMovementValidator() {
  const previous = useRef<[number, number, number] | null>(null);
  useFrame(() => {
    const current = getTrackedPlayerPosition();
    if (previous.current) {
      const distance = Math.hypot(current[0] - previous.current[0], current[2] - previous.current[2]);
      if (distance > 0 && distance < 2) useFinalMasterStore.getState().recordTutorialMovement(distance);
    }
    previous.current = current;
  });
  return null;
}

function Companion({ name, color, offset }: { name: string; color: string; offset: [number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const command = useFinalMasterStore((state) => state.companionCommand);
  useFrame((_, delta) => {
    if (!ref.current || command === 'wait') return;
    const [x, , z] = getTrackedPlayerPosition();
    const target = new THREE.Vector3(x + offset[0], 0, z + offset[1]);
    ref.current.position.lerp(target, 1 - Math.exp(-2.6 * delta));
  });
  return <group ref={ref} position={[0, 0, 2]}><CharacterModel bodyColor={color} accentColor="#f4d66d" hairColor="#3f2927" hairStyle={name === 'Mia' ? 'ponytail' : 'curls'} activityMode={command === 'wait' ? 'standing' : command === 'finale' ? 'reacting' : 'following'} motionSeed={name === 'Mia' ? 4 : 7} /><Text position={[0, 2.05, 0]} fontSize={0.2} color="#503223" anchorX="center">{name}</Text></group>;
}

function AnimationVignette() {
  const active = useFinalMasterStore((state) => state.activeAnimation);
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current || !active) return;
    const [x, , z] = getTrackedPlayerPosition();
    ref.current.position.set(x + 2.2, 0, z - 2.1);
  });
  if (!active) return null;
  const activity = active.includes('art') ? 'coloring' : active.includes('snack') ? 'snacking' : active.includes('recess') ? 'playing' : active.includes('storybook') ? 'conversation' : active.includes('harvest') ? 'gathering' : active.includes('fishing') ? 'reacting' : 'conversation';
  const label = ANIMATION_CLIPS.find(([id]) => id === active)?.[1] ?? 'DayKare moment';
  return <group ref={ref}><CharacterModel bodyColor="#ef7d55" accentColor="#ffd166" hairColor="#563b2f" hairStyle="sprout" activityMode={activity} activitySignal={active} socialReaction={active.includes('show') ? 'cheer' : undefined} motionSeed={15} /><Text position={[0, 2.1, 0]} fontSize={0.18} color="#5b351f" anchorX="center">{label}</Text></group>;
}

export function FinalMasterWorld() {
  const zone = useFinalMasterStore((state) => state.heistStatus);
  return <group><TutorialMovementValidator /><HeistRoom /><MissLeslie /><HeistBoard /><AnimationVignette />{zone === 'active' && <><Companion name="Mia" color="#54b9bd" offset={[-1.2, 1.1]} /><Companion name="Noah" color="#7654bd" offset={[1.2, 1.35]} /></>}</group>;
}

export function StarterHomeInterior() {
  useCandidate('final-home-exit', [0, 0, 4.15], true, 100, 2.7, true);
  return <group>
    <ambientLight intensity={0.95} /><directionalLight position={[4, 8, 5]} intensity={1.1} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[12, 10]} /><meshStandardMaterial color="#f0d7aa" /></mesh>
    <mesh position={[0, 2, -5]}><boxGeometry args={[12, 4, 0.25]} /><meshStandardMaterial color="#f7b267" /></mesh>
    <mesh position={[-6, 2, 0]}><boxGeometry args={[0.25, 4, 10]} /><meshStandardMaterial color="#f9c784" /></mesh>
    <mesh position={[6, 2, 0]}><boxGeometry args={[0.25, 4, 10]} /><meshStandardMaterial color="#f9c784" /></mesh>
    <mesh position={[-2.8, 0.55, -2.8]} castShadow><boxGeometry args={[2.4, 1.1, 1.5]} /><meshStandardMaterial color="#8ecae6" /></mesh>
    <mesh position={[2.8, 0.75, -2.6]} castShadow><boxGeometry args={[2.4, 1.5, 0.7]} /><meshStandardMaterial color="#b07d62" /></mesh>
    <mesh position={[0, 0.5, 1]} castShadow><cylinderGeometry args={[1.1, 1.1, 1, 20]} /><meshStandardMaterial color="#90be6d" /></mesh>
    <mesh position={[0, .025, .5]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.4, 3]} /><meshStandardMaterial color="#d89bd0" /></mesh>
    <mesh position={[3.4, .55, 1.8]} castShadow><boxGeometry args={[2.5, 1.1, .8]} /><meshStandardMaterial color="#6fb2bd" /></mesh>
    <mesh position={[3.4, .95, 2.13]} castShadow><boxGeometry args={[2.5, .75, .22]} /><meshStandardMaterial color="#5894a2" /></mesh>
    <mesh position={[-4.5, .85, -.8]} castShadow><boxGeometry args={[1.25, 1.7, .65]} /><meshStandardMaterial color="#b77b55" /></mesh>
    <mesh position={[4.6, 1.15, -3.7]}><cylinderGeometry args={[.1, .14, 2.3, 12]} /><meshStandardMaterial color="#e3a73c" /></mesh>
    <mesh position={[4.6, 2.22, -3.7]}><coneGeometry args={[.62, .7, 16]} /><meshStandardMaterial color="#fff0a8" emissive="#ffd567" emissiveIntensity={.2} /></mesh>
    <mesh position={[-1.7, 2.1, -4.82]}><boxGeometry args={[1.5, 1.1, .08]} /><meshStandardMaterial color="#f0a0b8" /></mesh>
    <mesh position={[1.4, 2.1, -4.82]}><boxGeometry args={[1.5, 1.1, .08]} /><meshStandardMaterial color="#8dc9df" /></mesh>
    <mesh position={[0, 1.4, 4.75]}><boxGeometry args={[1.7, 2.8, .3]} /><meshStandardMaterial color="#8a5a44" /></mesh>
    <Text position={[0, 1.6, 4.56]} rotation={[0, Math.PI, 0]} fontSize={.18} color="#fff3c7" anchorX="center">EXIT TO STONY BROOK</Text>
    <Text position={[0, 2.8, -4.8]} fontSize={0.52} color="#6b3f24" anchorX="center">YOUR STARTER HOME</Text>
  </group>;
}
