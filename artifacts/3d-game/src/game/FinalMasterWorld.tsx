import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { ANIMATION_CLIPS, HEIST_STEPS } from './finalMaster';
import { useFinalMasterStore } from './finalMasterStore';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { getTrackedPlayerPosition } from './world';

export const MISS_LESLIE_POSITION: [number, number, number] = [9.1, 0, 9.55];
export const HEIST_BOARD_APPROACH: [number, number, number] = [11.45, 0, 10.55];
const STEP_POSITIONS: [number, number, number][] = [MISS_LESLIE_POSITION, [-5.5, 0, -5], [-12, 0, -9], [4.2, 0, 1], [-13, 0, 11.5], HEIST_BOARD_APPROACH];
const HEIST_EVENT_POSITIONS: Record<string, [number, number, number]> = {
  'miss-leslie-intro': MISS_LESLIE_POSITION, 'scope-window': [-5.5, 0, -5], 'scope-hall': [-10, 0, 0],
  'scope-gate': [12, 0, -10.5], 'mia-door': [-12, 0, -9], 'noah-distraction': [4.2, 0, 1],
  'grabber-collected': [-9.45, 0, 5], 'finale-regroup': HEIST_BOARD_APPROACH,
};

function useCandidate(id: string, position: [number, number, number], valid: boolean, priority = 80, range = 2.65, forcePriority = false) {
  const vector = useMemo(() => new THREE.Vector3(...position), [position]);
  const candidate = useMemo(() => ({ id, position: vector, range, priority, valid, questPriority: valid && forcePriority, forcePriority }), [forcePriority, id, vector, priority, range, valid]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate(id, { position: vector, valid, questPriority: valid }));
}

function MissLeslie() {
  const active = useFinalMasterStore((state) => state.heistStatus === 'active');
  const waypoint = useFinalMasterStore((state) => state.leoHeistWaypointActive);
  useCandidate('final-miss-leslie', MISS_LESLIE_POSITION, true, 96, 3.2);
  return <group position={MISS_LESLIE_POSITION} rotation={[0, -0.35, 0]} scale={1.08}>
    <CharacterModel bodyColor="#f2c94c" accentColor="#fff2a8" bottomColor="#3973b8" hairColor="#4a2d25" hairStyle="pigtails" skinColor="#9a5d3c" eyeColor="#3b241f" isTeacher glasses cane isTalking={active} activityMode={active ? 'conversation' : 'standing'} idleVariant="look-around" motionSeed={12} />
    <Text position={[0, 2.25, 0]} fontSize={0.25} color="#4a2d25" anchorX="center">MISS LESLIE</Text>
    {waypoint && <><mesh position={[0, .04, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.78, 1.03, 28]} /><meshBasicMaterial color="#ffd84d" transparent opacity={.88} /></mesh><Text position={[0, 2.65, 0]} fontSize={.17} color="#6b3f24" anchorX="center">LEO'S HEIST TIP</Text></>}
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
  useCandidate('final-heist-board', HEIST_BOARD_APPROACH, true, 94, 3.1);
  useCandidate(`final-heist-${event ?? 'none'}`, position, tutorialComplete && status === 'active' && Boolean(event) && worldTarget, 100, 4.5, true);
  return <>
    <group position={[11.45, 0, 11.72]}>
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
    <mesh position={[10.65, .02, 10.15]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.25, 3.55]} /><meshStandardMaterial color="#75508f" /></mesh>
    <mesh position={[10.65, 1.2, 11.88]}><boxGeometry args={[4.25, 2.4, .18]} /><meshStandardMaterial color="#edd8a7" /></mesh>
    <mesh position={[12.7, .9, 10.55]}><boxGeometry args={[.16, 1.8, 2.5]} /><meshStandardMaterial color="#d9c398" /></mesh>
    <mesh position={[10.2, .48, 10.65]} castShadow><boxGeometry args={[1.65, .95, .82]} /><meshStandardMaterial color="#b87b50" /></mesh>
    <mesh position={[10.2, 1, 10.65]} castShadow><boxGeometry args={[1.8, .12, .95]} /><meshStandardMaterial color="#d99a60" /></mesh>
    {[-.52, 0, .52].map((x, index) => <mesh key={x} position={[10.2 + x, 1.11, 10.65 + (index % 2 ? .12 : -.1)]} rotation={[0, index * .24, 0]}><boxGeometry args={[.32, .035, .42]} /><meshStandardMaterial color={['#71bdd1', '#f1cb62', '#ef7d82'][index]} /></mesh>)}
    <mesh position={[9.05, .45, 11.15]} castShadow><boxGeometry args={[.7, .9, .65]} /><meshStandardMaterial color="#5ca3a2" /></mesh>
    {[0, 1, 2].map((index) => <mesh key={index} position={[8.96 + index * .1, .95 + index * .2, 11.1]} rotation={[0, 0, index * .16]}><boxGeometry args={[.42, .12, .38]} /><meshStandardMaterial color={['#f2c94c', '#ef7d67', '#73b6d2'][index]} /></mesh>)}
    <mesh position={[11.55, .27, 9.2]} castShadow><boxGeometry args={[.62, .54, .62]} /><meshStandardMaterial color="#e8ad57" /></mesh>
    <mesh position={[10.65, .025, 8.58]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3.45, .22]} /><meshStandardMaterial color="#f1d370" /></mesh>
    <Text position={[10.65, 2.48, 11.77]} rotation={[0, Math.PI, 0]} fontSize={.28} color="#59386c" anchorX="center">MISS LESLIE'S HEIST HUB</Text>
    <Text position={[10.65, 2.08, 11.77]} rotation={[0, Math.PI, 0]} fontSize={.13} color="#735081" anchorX="center">MAPS · NOTES · HARMLESS GADGETS</Text>
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
