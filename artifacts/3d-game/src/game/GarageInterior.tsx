import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { GARAGE_BAYS, GARAGE_EXIT_POINT, WORLD_SOLIDS } from './world';
import { useStorybookLaneStore } from './storybookLaneStore';
import { garageBays } from './ownership';

/**
 * The garage.
 *
 * Walls and fixtures come from the same solids that stop the player, so the
 * two cannot drift. What is parked here is read from the lane store's owned
 * items — there is no separate garage inventory to fall out of sync with what
 * the player actually bought.
 */

const GARAGE_SOLIDS = WORLD_SOLIDS.filter((solid) => solid.zone === 'garage');

const FIXTURE_COLORS: Record<string, string> = {
  'garage-workbench': '#9a7d5c',
  'garage-shelf': '#7d6047',
  'garage-toolbox': '#c8483f',
  'garage-door': '#c9cdd2',
};

function AuthoredGarageGeometry() {
  return <group>
    {GARAGE_SOLIDS.map((solid) => {
      const isWall = solid.kind === 'wall';
      const height = isWall ? 3 : (solid.maxY ?? 1);
      return <mesh
        key={solid.id}
        position={[(solid.minX + solid.maxX) / 2, height / 2, (solid.minZ + solid.maxZ) / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[solid.maxX - solid.minX, height, solid.maxZ - solid.minZ]} />
        <meshStandardMaterial color={FIXTURE_COLORS[solid.id] ?? '#d8d3c8'} roughness={0.9} />
      </mesh>;
    })}
  </group>;
}

/** The parked vehicle for a bay, or an empty marked bay. */
function Bay({ index, vehicle }: { index: number; vehicle: { id: string; label: string } | null }) {
  const [x, , z] = GARAGE_BAYS[index];
  return (
    <group position={[x, 0, z]}>
      {/* Bay markings, so an empty bay reads as a space for something. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.3, 3.4]} />
        <meshStandardMaterial color={vehicle ? '#c3bdaf' : '#b9b3a6'} roughness={1} />
      </mesh>
      {vehicle?.id === 'tricycle' && (
        <group position={[0, 0.32, 0]}>
          <mesh castShadow><boxGeometry args={[0.55, 0.24, 1.35]} /><meshStandardMaterial color="#e94255" /></mesh>
          {[-0.55, 0.55].map((dz) => (
            <mesh key={dz} position={[0, -0.19, dz]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.26, 0.11, 12]} /><meshStandardMaterial color="#292929" />
            </mesh>
          ))}
          <mesh position={[0, 0.34, -0.5]}><boxGeometry args={[0.62, 0.07, 0.07]} /><meshStandardMaterial color="#f2c94c" /></mesh>
        </group>
      )}
      {vehicle?.id === 'mini-ride-on' && (
        <group position={[0, 0.36, 0]}>
          <mesh castShadow><boxGeometry args={[1.1, 0.58, 1.95]} /><meshStandardMaterial color="#7c4dff" metalness={0.16} /></mesh>
          <mesh position={[0, 0.48, -0.24]}><boxGeometry args={[0.74, 0.46, 0.72]} /><meshStandardMaterial color="#f9d84a" /></mesh>
          {[[-0.52, 0.66], [0.52, 0.66], [-0.52, -0.66], [0.52, -0.66]].map(([dx, dz]) => (
            <mesh key={`${dx}-${dz}`} position={[dx, -0.25, dz]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.21, 0.21, 0.13, 12]} /><meshStandardMaterial color="#292929" />
            </mesh>
          ))}
        </group>
      )}
      <Text position={[0, 0.06, 1.9]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color={vehicle ? '#4b3023' : '#8b8478'} anchorX="center">
        {vehicle ? vehicle.label.toUpperCase() : 'EMPTY BAY'}
      </Text>
    </group>
  );
}

function ExitDoor() {
  const vector = useMemo(() => new THREE.Vector3(...GARAGE_EXIT_POINT), []);
  const candidate = useMemo(() => ({
    id: 'garage-exit', position: vector.clone(), valid: true, range: 2.4, priority: 100,
    forcePriority: true, questPriority: true,
  }), [vector]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate('garage-exit', { position: vector, valid: true }));
  return (
    <group position={[0, 0, 5.94]}>
      {/* Roller-door slats over the exit, so the way out reads as a door. */}
      {[0.35, 0.95, 1.55, 2.15].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[2.1, 0.5, 0.06]} />
          <meshStandardMaterial color="#dfe3e7" roughness={0.6} metalness={0.12} />
        </mesh>
      ))}
      <Text position={[0, 2.62, -0.1]} rotation={[0, Math.PI, 0]} fontSize={0.19} color="#4b3023" anchorX="center">
        EXIT TO THE DRIVEWAY
      </Text>
    </group>
  );
}

export function GarageInterior() {
  const owned = useStorybookLaneStore((state) => state.ownedItems);
  const bays = garageBays(owned);
  return (
    <group>
      <ambientLight intensity={0.78} />
      <directionalLight position={[2, 9, 5]} intensity={0.7} castShadow />
      <pointLight position={[0, 2.6, 0]} intensity={0.55} distance={16} />
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[12.6, 0.12, 12.6]} />
        <meshStandardMaterial color="#a9a396" roughness={0.98} />
      </mesh>
      <AuthoredGarageGeometry />
      <ExitDoor />
      {bays.map((vehicle, index) => <Bay key={index} index={index} vehicle={vehicle} />)}
      <Text position={[0, 2.5, -5.86]} fontSize={0.3} color="#5c3a21" anchorX="center">YOUR GARAGE</Text>
      <Text position={[0, 2.14, -5.86]} fontSize={0.14} color="#7a6353" anchorX="center">
        RIDES ARE STORED HERE
      </Text>
    </group>
  );
}
