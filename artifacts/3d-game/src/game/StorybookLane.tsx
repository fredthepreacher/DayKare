import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { getTrackedPlayerPosition } from './world';
import { useStorybookLaneStore } from './storybookLaneStore';

const HOUSES = [
  { id: 'my-home', label: 'MY HOME', position: [-13, 0, -12] as const, color: '#ffb35c' },
  { id: 'bluebell', label: 'BLUEBELL', position: [13, 0, -12] as const, color: '#75c9f1' },
  { id: 'sunny', label: 'SUNNY', position: [-16, 0, 1] as const, color: '#f5d76e' },
  { id: 'mint', label: 'MINT', position: [16, 0, 1] as const, color: '#8fd4a8' },
  { id: 'berry', label: 'BERRY', position: [-13, 0, 14] as const, color: '#e98ab2' },
  { id: 'cloud', label: 'CLOUD', position: [13, 0, 14] as const, color: '#b9a4eb' },
] as const;

function useStorybookCandidate(id: string, position: readonly [number, number, number], range = 2.5, priority = 20) {
  const vector = useMemo(() => new THREE.Vector3(...position), [position]);
  const candidate = useMemo(() => ({ id, position: vector.clone(), valid: true, range, priority }), [id, vector, range, priority]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate(id, { position: vector, valid: true, range, priority }));
}

function House({ house, upgraded = false }: { house: typeof HOUSES[number]; upgraded?: boolean }) {
  const [x, , z] = house.position;
  const door = [x, 0, z + 2.65] as const;
  useStorybookCandidate(`storybook-home-${house.id}`, door, 2.4, house.id === 'my-home' ? 32 : 18);
  return (
    <group position={house.position}>
      <mesh position={[0, 1.6, -2.45]} castShadow receiveShadow><boxGeometry args={[6.2, 3.2, 0.3]} /><meshStandardMaterial color={house.color} roughness={0.86} /></mesh>
      <mesh position={[-2.95, 1.6, 0]} castShadow receiveShadow><boxGeometry args={[0.3, 3.2, 5.2]} /><meshStandardMaterial color={house.color} roughness={0.86} /></mesh>
      <mesh position={[2.95, 1.6, 0]} castShadow receiveShadow><boxGeometry args={[0.3, 3.2, 5.2]} /><meshStandardMaterial color={house.color} roughness={0.86} /></mesh>
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[6.2, 0.12, 5.2]} /><meshStandardMaterial color="#ead3ad" roughness={0.94} /></mesh>
      <mesh position={[0, 3.65, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[4.6, 2.3, 4]} />
        <meshStandardMaterial color={upgraded ? '#7c4dff' : '#9a5639'} roughness={0.82} />
      </mesh>
      <Text position={[0, 2.7, 2.76]} fontSize={0.38} color="#fffaf0" anchorX="center" anchorY="middle">
        {house.label}{upgraded ? ' ★' : ''}
      </Text>
      <mesh position={[-1.4, 0.35, 1.8]} castShadow>
        <boxGeometry args={[1.6, 0.7, 0.7]} />
        <meshStandardMaterial color="#fff0c9" />
      </mesh>
      <mesh position={[1.5, 0.38, 1.75]} castShadow>
        <boxGeometry args={[1.1, 0.76, 0.8]} />
        <meshStandardMaterial color="#b17b5a" />
      </mesh>
      <mesh position={[0, 0.04, 2.72]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2.2, 1.1]} /><meshStandardMaterial color="#fff5d9" /></mesh>
    </group>
  );
}

function IceCreamStand() {
  useStorybookCandidate('storybook-ice-cream', [0, 0, -8], 3, 50);
  return (
    <group position={[0, 0, -8]}>
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[4.2, 2, 2.2]} />
        <meshStandardMaterial color="#fff2cf" />
      </mesh>
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[4.8, 0.25, 2.8]} />
        <meshStandardMaterial color="#ff76ad" />
      </mesh>
      <mesh position={[0, 1.2, 1.13]}>
        <planeGeometry args={[3.25, 0.85]} />
        <meshStandardMaterial color="#5b326f" />
      </mesh>
      <Text position={[0, 1.2, 1.2]} fontSize={0.4} color="white" anchorX="center" anchorY="middle">SCOOP STOP · 25 RB</Text>
      {[-0.75, 0, 0.75].map((x, index) => (
        <group key={x} position={[x, 2.75, 0]}>
          <mesh><coneGeometry args={[0.22, 0.7, 12]} /><meshStandardMaterial color="#c78b56" /></mesh>
          <mesh position={[0, 0.42, 0]}><sphereGeometry args={[0.27, 12, 10]} /><meshStandardMaterial color={['#ff8db2', '#78cfff', '#c49af2'][index]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function VehicleSpot() {
  const owned = useStorybookLaneStore((state) => state.ownedItems);
  if (!owned.includes('tricycle') && !owned.includes('mini-ride-on')) return null;
  return (
    <group position={[-8, 0, -4]}>
      {owned.includes('tricycle') && (
        <group position={[-1.2, 0.35, 0]}>
          <mesh><boxGeometry args={[1.4, 0.25, 0.52]} /><meshStandardMaterial color="#e94255" /></mesh>
          {[-0.55, 0.55].map((z) => <mesh key={z} position={[z, -0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.27, 0.27, 0.12, 12]} /><meshStandardMaterial color="#292929" /></mesh>)}
        </group>
      )}
      {owned.includes('mini-ride-on') && (
        <group position={[1.4, 0.48, 0]}>
          <mesh castShadow><boxGeometry args={[2.1, 0.65, 1.15]} /><meshStandardMaterial color="#7c4dff" metalness={0.18} /></mesh>
          <mesh position={[0, 0.55, -0.25]}><boxGeometry args={[1.15, 0.52, 0.75]} /><meshStandardMaterial color="#f9d84a" /></mesh>
        </group>
      )}
    </group>
  );
}

function DogFollower() {
  const ownsDog = useStorybookLaneStore((state) => state.ownedItems.includes('dog'));
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (!ref.current || !ownsDog) return;
    const [x, , z] = getTrackedPlayerPosition();
    const target = new THREE.Vector3(x - 1.1, 0, z + 1.2);
    ref.current.position.lerp(target, 1 - Math.exp(-2.8 * delta));
    const offset = target.clone().sub(ref.current.position);
    if (offset.lengthSq() > 0.02) ref.current.rotation.y = Math.atan2(-offset.x, -offset.z);
  });
  if (!ownsDog) return null;
  return (
    <group ref={ref} position={[-11, 0, -8]}>
      <mesh position={[0, 0.42, 0]} castShadow><boxGeometry args={[0.65, 0.55, 0.9]} /><meshStandardMaterial color="#bd7a43" /></mesh>
      <mesh position={[0, 0.75, -0.42]} castShadow><sphereGeometry args={[0.38, 12, 10]} /><meshStandardMaterial color="#d79554" /></mesh>
      <mesh position={[-0.27, 0.94, -0.42]} rotation={[0, 0, 0.5]}><coneGeometry args={[0.13, 0.4, 8]} /><meshStandardMaterial color="#8a5735" /></mesh>
      <mesh position={[0.27, 0.94, -0.42]} rotation={[0, 0, -0.5]}><coneGeometry args={[0.13, 0.4, 8]} /><meshStandardMaterial color="#8a5735" /></mesh>
      <mesh position={[0, 0.8, -0.78]}><sphereGeometry args={[0.08, 8, 8]} /><meshStandardMaterial color="#24201d" /></mesh>
    </group>
  );
}

export function StorybookLane() {
  const cribTier = useStorybookLaneStore((state) => state.cribTier);
  useStorybookCandidate('storybook-exit', [0, 0, 22], 2.8, 45);
  return (
    <group>
      <ambientLight intensity={0.6} />
      <directionalLight position={[12, 18, 8]} intensity={1.05} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color="#9acb74" roughness={1} />
      </mesh>
      <mesh position={[0, 0.025, 3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[8, 12, 48]} />
        <meshStandardMaterial color="#77736d" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.045, 3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7.2, 40]} />
        <meshStandardMaterial color="#7fc765" />
      </mesh>
      <mesh position={[0, 0.28, 3]} castShadow><cylinderGeometry args={[1.5, 1.8, 0.56, 24]} /><meshStandardMaterial color="#e9d7b2" /></mesh>
      <Text position={[0, 1.1, 3]} fontSize={0.62} color="#5c3a21" rotation={[-Math.PI / 9, 0, 0]} anchorX="center">STORYBOOK LANE</Text>
      <IceCreamStand />
      {HOUSES.map((house) => <House key={house.id} house={house} upgraded={house.id === 'my-home' && cribTier > 0} />)}
      <VehicleSpot />
      <DogFollower />
      <group position={[0, 0, 22]}>
        <mesh position={[-2.5, 1.25, 0]} castShadow><boxGeometry args={[0.34, 2.5, 0.34]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <mesh position={[2.5, 1.25, 0]} castShadow><boxGeometry args={[0.34, 2.5, 0.34]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <mesh position={[0, 2.55, 0]} castShadow><boxGeometry args={[5.35, 0.38, 0.34]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <Text position={[0, 2.5, -0.22]} rotation={[0, Math.PI, 0]} fontSize={0.42} color="#fff7df" anchorX="center">BACK TO DAYKARE</Text>
      </group>
      <group position={[4, 0, 7]}>
        <CharacterModel bodyColor="#6fc6d9" accentColor="#ffdf6f" hairColor="#593d2d" hairStyle="curls" activityMode="conversation" motionSeed={8} />
      </group>
      <group position={[-4, 0, 7]}>
        <CharacterModel bodyColor="#f28bb5" accentColor="#9ee0a1" hairColor="#3f2b26" hairStyle="sprout" activityMode="playing" motionSeed={9} />
      </group>
    </group>
  );
}
