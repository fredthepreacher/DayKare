import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { useGameStore } from './store';
import { getWorldSolidTransform, WORLD_SOLIDS } from './world';

const FLOWERS = [
  [-15, -15, '#e8613c'], [-12.5, -14.2, '#ffd166'], [-9.8, -15, '#8a63c7'],
  [-6.5, -13.6, '#4c82d4'], [5.5, -14.4, '#e8613c'], [8, -15.2, '#ffd166'],
  [11, -13.8, '#d76f78'], [14.6, -14.8, '#55b89b'], [-15.2, 8, '#ffd166'],
  [-14.3, 11, '#4c82d4'], [14.8, 5.5, '#e8613c'], [15.1, 9, '#8a63c7'],
] as const;

const TREES = [
  [-14.5, -1], [-7, 11.8], [6.4, 11.5], [14.2, -8.5], [2, -13.8],
] as const;

export function Garden() {
  return (
    <group>
      <GardenEnvironment />
      <GardenDetails />
      <GardenReturnGate />
    </group>
  );
}

function GardenEnvironment() {
  const imagination = useGameStore((state) => state.isImaginationMode);
  const grass = imagination ? '#173d38' : '#8dbb72';
  const path = imagination ? '#7254b3' : '#e6c98f';
  const wall = imagination ? '#315f58' : '#6c9b5a';

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
        <group key={z} position={[0, 0.38, z]}>
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

  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
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