import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { HUB_ROUTES, isRouteUnlocked, type RouteDefinition } from './progression';
import { useGameStore } from './store';

export function HubProgression({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      {HUB_ROUTES.map((route) => <FutureAccessPoint key={route.id} route={route} playerRef={playerRef} />)}
      <RainbowTidyUp playerRef={playerRef} />
    </group>
  );
}

function FocusRing({ active, color, radius = 1 }: { active: boolean; color: string; radius?: number }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ring.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.08;
    ring.current.scale.setScalar(active ? pulse : 0.01);
    ring.current.visible = active;
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.48 + Math.sin(state.clock.elapsedTime * 5) * 0.12;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} scale={0.01} visible={active}>
      <torusGeometry args={[radius, 0.035, 8, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} />
    </mesh>
  );
}

function FutureAccessPoint({ route }: { route: RouteDefinition; playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const progression = useGameStore((state) => state.progression);
  const active = useGameStore((state) => state.activeInteractable === `route-${route.id}`);
  const unlocked = isRouteUnlocked(route, progression);
  const id = `route-${route.id}`;
  const position = useMemo(() => new THREE.Vector3(...route.position), [route.position]);
  const candidate = useMemo(() => ({ id, position, range: 2.4, priority: 8, valid: true }), [id, position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame((_, delta) => {
    updateInteractionCandidate(id, { position, valid: true });
    if (!ref.current) return;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, active ? 1.04 : 1, 1 - Math.exp(-8 * delta));
    ref.current.scale.setScalar(scale);
  });
  return (
    <group ref={ref} position={route.position}>
      <mesh position={[-0.72, 1.25, 0]} castShadow><boxGeometry args={[0.22, 2.5, 0.35]} /><meshStandardMaterial color={route.color} roughness={0.72} /></mesh>
      <mesh position={[0.72, 1.25, 0]} castShadow><boxGeometry args={[0.22, 2.5, 0.35]} /><meshStandardMaterial color={route.color} roughness={0.72} /></mesh>
      <mesh position={[0, 2.42, 0]} castShadow><boxGeometry args={[1.65, 0.22, 0.35]} /><meshStandardMaterial color={route.color} roughness={0.72} /></mesh>
      <mesh position={[0, 1.78, -0.2]} castShadow><boxGeometry args={[1.24, 0.54, 0.08]} /><meshStandardMaterial color={unlocked ? '#fff0b8' : '#ddd5ca'} roughness={0.68} /></mesh>
      <mesh position={[0, 1.78, -0.25]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[0.15, 0.15, 0.04]} /><meshStandardMaterial color={unlocked ? route.color : '#9c938d'} emissive={unlocked ? route.color : '#000000'} emissiveIntensity={unlocked ? 0.2 : 0} /></mesh>
      <FocusRing active={active} color={unlocked ? '#ffd166' : '#c5b8ad'} radius={1.25} />
    </group>
  );
}

function RainbowTidyUp({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const active = useGameStore((state) => state.activeInteractable === 'activity-rainbow-tidy-up');
  const quest = useGameStore((state) => state.quests['rainbow-tidy-up']);
  const placed = useGameStore((state) => state.tidyPlacedItems);
  const id = 'activity-rainbow-tidy-up';
  const position = useMemo(() => new THREE.Vector3(0, 0, -4), []);
  const canPlace = quest?.status === 'active' && quest.currentObjectiveId?.startsWith('place-') === true;
  const candidate = useMemo(() => ({ id, position, range: 2, priority: 70, valid: canPlace }), [id, position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame((_, delta) => {
    updateInteractionCandidate(id, { position, valid: canPlace });
    if (!ref.current) return;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, active ? 1.06 : 1, 1 - Math.exp(-8 * delta));
    ref.current.scale.setScalar(scale);
  });
  const colors: Record<string, string> = { 'blue-block': '#4c82d4', 'red-block': '#e8613c', 'yellow-block': '#e6ae2f' };
  return (
    <group ref={ref} position={[0, 0, -4]}>
      <mesh position={[0, 0.28, 0]} castShadow><cylinderGeometry args={[0.54, 0.62, 0.52, 12]} /><meshStandardMaterial color="#ef9f4d" roughness={0.78} /></mesh>
      <mesh position={[0, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[0.37, 0.055, 8, 18]} /><meshStandardMaterial color="#5b352c" roughness={0.78} /></mesh>
      {placed.slice(-3).map((item, index) => (
        <mesh key={`${item}-${index}`} position={[-0.3 + index * 0.3, 0.64, 0]} rotation={[0, index * 0.2, index * 0.1]} castShadow>
          <boxGeometry args={[0.24, 0.24, 0.24]} />
          <meshStandardMaterial color={colors[item] ?? '#ffd166'} roughness={0.68} />
        </mesh>
      ))}
      <FocusRing active={active} color="#ffd166" radius={0.95} />
    </group>
  );
}