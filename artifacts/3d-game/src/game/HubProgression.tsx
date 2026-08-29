import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';
import { HUB_ROUTES, isRouteUnlocked, type RouteDefinition } from './progression';

export function HubProgression({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      {HUB_ROUTES.map((route) => (
        <FutureAccessPoint key={route.id} route={route} playerRef={playerRef} />
      ))}
      <RainbowTidyUp playerRef={playerRef} />
    </group>
  );
}

function FocusRing({
  active,
  color,
  radius = 1,
}: {
  active: boolean;
  color: string;
  radius?: number;
}) {
  const ring = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ring.current) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 5) * 0.08;
    ring.current.scale.setScalar(active ? pulse : 0.01);
    ring.current.visible = active;
    const material = ring.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.48 + Math.sin(state.clock.elapsedTime * 5) * 0.12;
  });

  return (
    <mesh
      ref={ring}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.035, 0]}
      scale={0.01}
      visible={active}
    >
      <torusGeometry args={[radius, 0.035, 8, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.55} />
    </mesh>
  );
}

function FutureAccessPoint({
  route,
  playerRef,
}: {
  route: RouteDefinition;
  playerRef: React.RefObject<THREE.Group | null>;
}) {
  const ref = useRef<THREE.Group>(null);
  const setActiveInteractable = useGameStore((s) => s.setActiveInteractable);
  const activeInteractable = useGameStore((s) => s.activeInteractable);
  const progression = useGameStore((s) => s.progression);
  const [canInteract, setCanInteract] = useState(false);
  const unlocked = isRouteUnlocked(route, progression);
  const interactId = `route-${route.id}`;

  useFrame((state, delta) => {
    if (!ref.current || !playerRef.current) return;
    const distance = ref.current.position.distanceTo(playerRef.current.position);
    const inRange = distance < 2.25;

    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable(interactId);
      else if (activeInteractable === interactId) setActiveInteractable(null);
    }

    const targetScale = inRange ? 1.04 : 1;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, targetScale, 1 - Math.exp(-8 * delta));
    ref.current.scale.setScalar(scale);
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2.4 + route.label.length) * 0.025;
  });

  return (
    <group ref={ref} position={route.position}>
      <mesh position={[-0.72, 1.25, 0]} castShadow>
        <boxGeometry args={[0.22, 2.5, 0.35]} />
        <meshStandardMaterial color={route.color} roughness={0.72} />
      </mesh>
      <mesh position={[0.72, 1.25, 0]} castShadow>
        <boxGeometry args={[0.22, 2.5, 0.35]} />
        <meshStandardMaterial color={route.color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 2.42, 0]} castShadow>
        <boxGeometry args={[1.65, 0.22, 0.35]} />
        <meshStandardMaterial color={route.color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.78, -0.2]} castShadow>
        <boxGeometry args={[1.24, 0.54, 0.08]} />
        <meshStandardMaterial color={unlocked ? '#fff0b8' : '#ddd5ca'} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.78, -0.25]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.15, 0.15, 0.04]} />
        <meshStandardMaterial color={unlocked ? route.color : '#9c938d'} emissive={unlocked ? route.color : '#000000'} emissiveIntensity={unlocked ? 0.2 : 0} />
      </mesh>
      <FocusRing active={activeInteractable === interactId} color={unlocked ? '#ffd166' : '#c5b8ad'} radius={1.25} />
    </group>
  );
}

function RainbowTidyUp({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const setActiveInteractable = useGameStore((s) => s.setActiveInteractable);
  const activeInteractable = useGameStore((s) => s.activeInteractable);
  const [canInteract, setCanInteract] = useState(false);
  const interactId = 'activity-rainbow-tidy-up';
  const cubes = useMemo(
    () => [
      { position: [-0.42, 0.48, 0.12] as [number, number, number], color: '#4c82d4', rotation: 0.1 },
      { position: [0.02, 0.58, -0.02] as [number, number, number], color: '#e8613c', rotation: -0.14 },
      { position: [0.4, 0.46, 0.1] as [number, number, number], color: '#e6ae2f', rotation: 0.2 },
    ],
    [],
  );

  useFrame((state, delta) => {
    if (!ref.current || !playerRef.current) return;
    const distance = ref.current.position.distanceTo(playerRef.current.position);
    const inRange = distance < 1.9;

    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable(interactId);
      else if (activeInteractable === interactId) setActiveInteractable(null);
    }

    const targetScale = inRange ? 1.06 : 1;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, targetScale, 1 - Math.exp(-8 * delta));
    ref.current.scale.setScalar(scale);
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 2.8) * 0.025;
  });

  return (
    <group ref={ref} position={[0, 0, -4]}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <cylinderGeometry args={[0.54, 0.62, 0.52, 12]} />
        <meshStandardMaterial color="#ef9f4d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.56, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.37, 0.055, 8, 18]} />
        <meshStandardMaterial color="#5b352c" roughness={0.78} />
      </mesh>
      {cubes.map((cube) => (
        <mesh key={cube.color} position={cube.position} rotation={[0, cube.rotation, cube.rotation]} castShadow>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshStandardMaterial color={cube.color} roughness={0.68} />
        </mesh>
      ))}
      <FocusRing active={activeInteractable === interactId} color="#ffd166" radius={0.95} />
    </group>
  );
}