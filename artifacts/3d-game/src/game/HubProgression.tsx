import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { HUB_ROUTES, isRouteUnlocked, type RouteDefinition } from './progression';
import { useGameStore } from './store';
import { playGameSound } from './audio';
import { getWorldSolidTransform, WORLD_INTERACTION_TARGETS } from './world';

export const RAINBOW_TIDY_PLACEMENT_RANGE = 3.25;

export function HubProgression({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      {HUB_ROUTES.map((route) => <FutureAccessPoint key={route.id} route={route} playerRef={playerRef} />)}
      <RainbowTidyUp playerRef={playerRef} />
      <StickerParadeBoard />
    </group>
  );
}

function StickerParadeBoard() {
  const ref = useRef<THREE.Group>(null);
  const progression = useGameStore((state) => state.progression);
  const caper = useGameStore((state) => state.caper);
  const active = useGameStore((state) => state.activeInteractable === 'caper-board');
  const position = useMemo(() => new THREE.Vector3(11.2, 0, 11.4), []);
  const available = progression.trustedHelperPass;
  const candidate = useMemo(() => ({
    id: 'caper-board',
    position,
    range: 2.2,
    priority: 34,
    questPriority: available,
    valid: available,
  }), [available, position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame((state, delta) => {
    updateInteractionCandidate('caper-board', { position, valid: available, questPriority: available });
    if (!ref.current) return;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, active ? 1.06 : 1, 1 - Math.exp(-8 * delta));
    ref.current.scale.setScalar(scale);
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.03;
  });
  if (!available) return null;
  const boardColor = caper.step === 'complete' ? '#65b891' : '#e8a84d';
  return (
    <group ref={ref} position={position}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[1.5, 1.35, 0.12]} />
        <meshStandardMaterial color="#7b4f38" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.78, -0.08]} castShadow>
        <boxGeometry args={[1.18, 0.92, 0.035]} />
        <meshStandardMaterial color={boardColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[0.14, 0.48, 0.14]} />
        <meshStandardMaterial color="#7b4f38" />
      </mesh>
      <mesh position={[0, 0.04, 0]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.5]} />
        <meshStandardMaterial color="#d37b3d" />
      </mesh>
      <FocusRing active={active} color={boardColor} radius={1} />
    </group>
  );
}

export const ROUTE_FOCUS_RING_Y = 0.035;

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
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, ROUTE_FOCUS_RING_Y, 0]} scale={0.01} visible={active}>
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
  const gate = useMemo(() => getWorldSolidTransform(`route-${route.id}`, 2.5, 1.25), [route.id]);
  const position = useMemo(() => getRouteGateInteractionPosition(route.id), [route.id]);
  const candidate = useMemo(() => ({ id, position, range: 2.4, priority: 8, valid: true }), [id, position]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame((_, delta) => {
    updateInteractionCandidate(id, { position, valid: true });
    if (!ref.current) return;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, active ? 1.04 : 1, 1 - Math.exp(-8 * delta));
    ref.current.scale.setScalar(scale);
  });
  return (
    <group ref={ref} position={position}>
      <mesh position={[-gate.size[0] / 2 + 0.14, gate.position[1], 0]} castShadow><boxGeometry args={[0.28, gate.size[1], gate.size[2]]} /><meshStandardMaterial color={route.color} roughness={0.72} /></mesh>
      <mesh position={[gate.size[0] / 2 - 0.14, gate.position[1], 0]} castShadow><boxGeometry args={[0.28, gate.size[1], gate.size[2]]} /><meshStandardMaterial color={route.color} roughness={0.72} /></mesh>
      <mesh position={[0, gate.position[1] + gate.size[1] / 2 - 0.12, 0]} castShadow><boxGeometry args={[gate.size[0], 0.24, gate.size[2]]} /><meshStandardMaterial color={route.color} roughness={0.72} /></mesh>
      <mesh position={[0, gate.position[1] - 0.08, 0]} castShadow>
        <boxGeometry args={[gate.size[0] - 0.36, gate.size[1] - 0.42, gate.size[2] - 0.08]} />
        <meshStandardMaterial color={unlocked ? '#7fa26f' : '#a79d93'} roughness={0.88} />
      </mesh>
      <mesh position={[0, gate.position[1] + 0.53, -gate.size[2] / 2 - 0.045]} castShadow><boxGeometry args={[gate.size[0] - 0.5, 0.54, 0.08]} /><meshStandardMaterial color={unlocked ? '#fff0b8' : '#ddd5ca'} roughness={0.68} /></mesh>
      <mesh position={[0, gate.position[1] + 0.53, -gate.size[2] / 2 - 0.09]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[0.15, 0.15, 0.04]} /><meshStandardMaterial color={unlocked ? route.color : '#9c938d'} emissive={unlocked ? route.color : '#000000'} emissiveIntensity={unlocked ? 0.2 : 0} /></mesh>
      <FocusRing active={active} color={unlocked ? '#ffd166' : '#c5b8ad'} radius={gate.size[0] / 2 + 0.15} />
    </group>
  );
}

export function getRouteGateInteractionPosition(routeId: string) {
  const transform = getWorldSolidTransform(`route-${routeId}`, 2.5, 1.25);
  return new THREE.Vector3(transform.position[0], 0, transform.position[2]);
}

function RainbowTidyUp({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const active = useGameStore((state) => state.activeInteractable === 'activity-rainbow-tidy-up');
  const quest = useGameStore((state) => state.quests['rainbow-tidy-up']);
  const inventory = useGameStore((state) => state.inventory);
  const placed = useGameStore((state) => state.tidyPlacedItems);
  const placedSignature = placed.join('|');
  const previousPlacedSignature = useRef(placedSignature);
  const id = 'activity-rainbow-tidy-up';
  const stationTarget = WORLD_INTERACTION_TARGETS.find((target) => target.id === 'rainbow-tidy-up');
  const position = useMemo(() => new THREE.Vector3(...(stationTarget?.position ?? [0, 0, -4])), [stationTarget]);
  const approach = useMemo(() => new THREE.Vector3(...(stationTarget?.approach ?? [0, 0, -2.8])), [stationTarget]);
  const requiredItem = quest?.currentObjectiveId?.startsWith('place-')
    ? quest.currentObjectiveId.replace('place-', '')
    : null;
  const canPlace = quest?.status === 'active' && requiredItem !== null && inventory.includes(requiredItem);
  const candidate = useMemo(() => ({
    id,
    position,
    approach,
    range: RAINBOW_TIDY_PLACEMENT_RANGE,
    priority: 70,
    questPriority: canPlace,
    forcePriority: canPlace,
    valid: canPlace,
  }), [id, position, approach, canPlace]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useEffect(() => {
    if (previousPlacedSignature.current !== placedSignature) {
      playGameSound('tidy-place', 'interaction');
      previousPlacedSignature.current = placedSignature;
    }
  }, [placedSignature]);
  useFrame((_, delta) => {
    updateInteractionCandidate(id, {
      position,
      approach,
      range: RAINBOW_TIDY_PLACEMENT_RANGE,
      questPriority: canPlace,
      forcePriority: canPlace,
      valid: canPlace,
    });
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