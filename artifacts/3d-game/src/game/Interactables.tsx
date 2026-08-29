import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { objectiveIsActive } from './quests';
import { useGameStore } from './store';
import { SuppliedArtwork } from './Artwork';
import { shouldUpdateOptionalAnimation } from './performanceTelemetry';

export function Interactables({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      <JuiceStand playerRef={playerRef} />
      <Binky playerRef={playerRef} />
      <Tricycle playerRef={playerRef} />
      <ToyBlock playerRef={playerRef} position={[-3, 0.25, -2]} id="blue-block" color="#3a86ff" />
      <ToyBlock playerRef={playerRef} position={[2, 0.25, 4]} id="red-block" color="#ff006e" />
      <ToyBlock playerRef={playerRef} position={[5.2, 0.25, -5.6]} id="yellow-block" color="#ffbe0b" />
    </group>
  );
}

function useCandidate(
  id: string,
  position: THREE.Vector3,
  valid: boolean,
  range: number,
  priority: number,
  questPriority = false,
) {
  const candidate = useMemo(() => ({ id, position: position.clone(), valid, range, priority, questPriority }), [id, questPriority]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate(id, { position, valid, range, priority, questPriority }));
}

function FocusHalo({ active, radius, color }: { active: boolean; radius: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const lastAnimationAt = useRef(0);
  useFrame((state) => {
    if (!ref.current) return;
    if (!shouldUpdateOptionalAnimation(lastAnimationAt, state.clock.elapsedTime * 1000)) return;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 5.5) * 0.08;
    ref.current.visible = active;
    ref.current.scale.setScalar(active ? pulse : 0.01);
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(state.clock.elapsedTime * 5.5) * 0.1;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} visible={active}>
      <torusGeometry args={[radius, 0.035, 8, 28]} />
      <meshBasicMaterial color={color} transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

function JuiceStand({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const active = useGameStore((state) => state.activeInteractable === 'juice-stand');
  const position = useMemo(() => new THREE.Vector3(3, 0, -3), []);
  useCandidate('juice-stand', position, true, 2.5, 15);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, active ? 1.035 : 1, 1 - Math.exp(-9 * delta));
    ref.current.scale.setScalar(scale);
  });
  return (
    <>
      <group ref={ref} position={[3, 0, -3]}>
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[2, 1.2, 1]} />
          <meshStandardMaterial color="#ffd166" />
        </mesh>
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[1.95, 1.42, 0.12]} />
          <meshStandardMaterial color="#8338ec" />
        </mesh>
        <mesh position={[-0.5, 1.35, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
          <meshStandardMaterial color="#ff5400" transparent opacity={0.8} />
        </mesh>
        <mesh position={[0.5, 1.25, 0]} castShadow>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial color="#c2b280" />
        </mesh>
        <FocusHalo active={active} radius={1.25} color="#ffd166" />
      </group>
      <SuppliedArtwork fileName="11_juice_club_branding.png" surfaceAnchor={{ solidId: 'juice-signboard', face: 'south', height: 1.5, along: 3 }} size={[1.7, 1.22]} backingColor="#8338ec" semanticRole="branding" support="none" />
    </>
  );
}

function Binky({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const quests = useGameStore((state) => state.quests);
  const inventory = useGameStore((state) => state.inventory);
  const dropped = useGameStore((state) => state.droppedItems.find((item) => item.item === 'binky'));
  const active = useGameStore((state) => state.activeInteractable === 'binky');
  const canSearch = objectiveIsActive(quests, 'where-binky', 'search-storage');
  const needsRecovery = objectiveIsActive(quests, 'where-binky', 'return-binky') && !inventory.includes('binky');
  const visible = (canSearch || needsRecovery) && !inventory.includes('binky');
  const position = useMemo(() => new THREE.Vector3(), []);
  const source = dropped?.position ?? [-14, 0.2, 14];
  position.set(source[0], source[1], source[2]);
  useCandidate('binky', position, visible, 1.7, 100, visible);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * (active ? 1.6 : 0.35);
  });
  if (!visible) return null;
  return (
    <group ref={ref} position={position}>
      <group position={[0, 0.06, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#ffc8dd" />
        </mesh>
        <mesh position={[0.2, 0.1, 0]} castShadow>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#ffc8dd" />
        </mesh>
        <mesh position={[-0.2, 0.1, 0]} castShadow>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color="#ffc8dd" />
        </mesh>
      </group>
      <FocusHalo active={active} radius={0.46} color="#ff8fbd" />
    </group>
  );
}

function Tricycle({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const active = useGameStore((state) => state.activeInteractable === 'tricycle');
  const colorIndex = useGameStore((state) => state.tricycleColorIndex);
  const isRiding = useGameStore((state) => state.isRiding);
  const position = useMemo(() => new THREE.Vector3(12, 0, 2), []);
  useCandidate('tricycle', position, !isRiding, 2.1, 25);
  const colors = ['#d62828', '#3a86ff', '#ff006e', '#06d6a0'];
  useFrame((_, delta) => {
    if (!ref.current) return;
    const scale = THREE.MathUtils.lerp(ref.current.scale.x, active ? 1.06 : 1, 1 - Math.exp(-9 * delta));
    ref.current.scale.setScalar(scale);
  });
  if (isRiding) return null;
  return (
    <group ref={ref} position={[12, 0.4, 2]} rotation={[0, Math.PI / 4, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.2, 0.2, 0.4]} />
        <meshStandardMaterial color={colors[colorIndex]} />
      </mesh>
      <mesh position={[0.5, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <mesh position={[-0.5, -0.2, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <mesh position={[-0.5, -0.2, -0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <mesh position={[0.5, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.6]} />
        <meshStandardMaterial color="#c0c0c0" />
      </mesh>
      <mesh position={[0.5, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.8]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <FocusHalo active={active} radius={0.92} color={colors[colorIndex]} />
    </group>
  );
}

function ToyBlock({
  position: authoredPosition,
  id,
  color,
}: {
  playerRef: React.RefObject<THREE.Group | null>;
  position: [number, number, number];
  id: string;
  color: string;
}) {
  const visual = useRef<THREE.Group>(null);
  const inventory = useGameStore((state) => state.inventory);
  const quests = useGameStore((state) => state.quests);
  const dropped = useGameStore((state) => state.droppedItems.find((item) => item.item === id));
  const active = useGameStore((state) => state.activeInteractable === id);
  const itemName = id.replace('-block', '');
  const collecting = objectiveIsActive(quests, 'rainbow-tidy-up', `collect-${itemName}-block`);
  const recovering = objectiveIsActive(quests, 'rainbow-tidy-up', `place-${itemName}-block`) && !inventory.includes(id);
  const visible = (collecting || recovering) && !inventory.includes(id);
  const position = useMemo(() => new THREE.Vector3(), []);
  const source = dropped?.position ?? authoredPosition;
  position.set(source[0], source[1], source[2]);
  useCandidate(id, position, visible, 1.7, 80, visible);
  useFrame((state, delta) => {
    if (!visual.current) return;
    visual.current.rotation.y += delta * (active ? 1.4 : 0.12);
    visual.current.position.y = 0.04 + Math.sin(state.clock.elapsedTime * 3 + id.length) * (active ? 0.04 : 0.01);
  });
  if (!visible) return null;
  return (
    <group position={position}>
      <group ref={visual}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.18 : 0} />
        </mesh>
      </group>
      <FocusHalo active={active} radius={0.5} color={color} />
    </group>
  );
}