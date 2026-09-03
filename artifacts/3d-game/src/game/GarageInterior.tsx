import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { GARAGE_BAYS, GARAGE_EXIT_POINT, WORLD_SOLIDS } from './world';
import { useStorybookLaneStore } from './storybookLaneStore';
import { garageBays } from './ownership';
import { useFinalMasterStore } from './finalMasterStore';
import { GARAGE_THEMES, garageTheme, type GaragePalette } from './interiorThemes';

/**
 * The garage.
 *
 * Walls and fixtures come from the same solids that stop the player, so the
 * two cannot drift. What is parked here is read from the lane store's owned
 * items — there is no separate garage inventory to fall out of sync with what
 * the player actually bought.
 */

const GARAGE_SOLIDS = WORLD_SOLIDS.filter((solid) => solid.zone === 'garage');

function AuthoredGarageGeometry({ palette }: { palette: GaragePalette }) {
  const fixtures: Record<string, string> = {
    'garage-workbench': palette.fixture,
    'garage-shelf': palette.fixture,
    'garage-toolbox': palette.signage,
    'garage-door': '#c9cdd2',
  };
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
        <meshStandardMaterial color={fixtures[solid.id] ?? palette.wall} roughness={0.9} />
      </mesh>;
    })}
  </group>;
}

/** The parked vehicle for a bay, or an empty marked bay. */
function Bay({ index, vehicle, palette }: { index: number; vehicle: { id: string; label: string } | null; palette: GaragePalette }) {
  const [x, , z] = GARAGE_BAYS[index];
  return (
    <group position={[x, 0, z]}>
      {/* Painted bay markings, so an empty bay reads as a space for something
          rather than as bare floor. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2.3, 3.4]} />
        <meshStandardMaterial color={palette.floor} roughness={1} />
      </mesh>
      {[-1.1, 1.1].map((edge) => (
        <mesh key={edge} position={[edge, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.09, 3.4]} />
          <meshStandardMaterial color={palette.marking} />
        </mesh>
      ))}
      <mesh position={[0, 0.025, -1.65]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3, 0.09]} />
        <meshStandardMaterial color={palette.marking} />
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

/** A rack for bikes and trikes, a tire stack, hooks and bins. */
function GarageFittings({ palette }: { palette: GaragePalette }) {
  return (
    <group>
      {/* Bike rack along the east wall. */}
      <group position={[5.1, 0, 1.4]}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.5, 0.12, 2.6]} />
          <meshStandardMaterial color={palette.fixture} />
        </mesh>
        {[-0.9, 0, 0.9].map((z) => (
          <mesh key={z} position={[0, 0.45, z]} castShadow>
            <boxGeometry args={[0.07, 0.78, 0.07]} />
            <meshStandardMaterial color={palette.fixture} />
          </mesh>
        ))}
        <Text position={[-0.5, 1.1, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.16} color={palette.signage} anchorX="center">BIKE RACK</Text>
      </group>

      {/* Tire stack in the corner. */}
      <group position={[-5.1, 0, 3.4]}>
        {[0, 1, 2].map((tier) => (
          <mesh key={tier} position={[0, 0.14 + tier * 0.26, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.36, 0.13, 8, 16]} />
            <meshStandardMaterial color="#33383d" roughness={0.95} />
          </mesh>
        ))}
      </group>

      {/* Wall hooks with helmets, above the workbench. */}
      <group position={[-4.05, 1.55, -5.85]}>
        {[-0.8, 0, 0.8].map((x, index) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.16, 0.06]}>
              <boxGeometry args={[0.05, 0.24, 0.05]} />
              <meshStandardMaterial color={palette.fixture} />
            </mesh>
            <mesh position={[0, 0, 0.14]} castShadow>
              <sphereGeometry args={[0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={['#e94255', '#f2c94c', '#5fa8d3'][index]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Storage bins under the shelf. */}
      {[-0.9, 0, 0.9].map((z, index) => (
        <mesh key={z} position={[5.2, 0.26, -1.4 + z]} castShadow>
          <boxGeometry args={[0.8, 0.52, 0.72]} />
          <meshStandardMaterial color={[palette.marking, palette.signage, palette.fixture][index]} />
        </mesh>
      ))}

      {/* Signage over the workbench. */}
      <Text position={[-4.05, 2.35, -5.9]} fontSize={0.26} color={palette.signage} anchorX="center">HOME GARAGE</Text>
    </group>
  );
}

/** The paint chart by the door that cycles the garage's theme. */
function GarageThemeSwitch({ palette }: { palette: GaragePalette }) {
  const vector = useMemo(() => new THREE.Vector3(-3.4, 0, 5.2), []);
  const candidate = useMemo(() => ({
    id: 'garage-theme-switch', position: vector.clone(), valid: true, range: 2.2, priority: 70,
  }), [vector]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate('garage-theme-switch', { position: vector, valid: true }));
  return (
    <group position={[-3.4, 0, 5.75]}>
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[1.1, 0.72, 0.08]} />
        <meshStandardMaterial color="#f2f0ec" />
      </mesh>
      {GARAGE_THEMES.map((theme, index) => (
        <mesh key={theme.id} position={[-0.34 + index * 0.34, 1.35, -0.06]}>
          <boxGeometry args={[0.26, 0.5, 0.03]} />
          <meshStandardMaterial color={theme.marking} />
        </mesh>
      ))}
      <Text position={[0, 1.92, -0.06]} rotation={[0, Math.PI, 0]} fontSize={0.15} color={palette.signage} anchorX="center">
        GARAGE COLOURS
      </Text>
    </group>
  );
}

export function GarageInterior() {
  const owned = useStorybookLaneStore((state) => state.ownedItems);
  const themeIndex = useFinalMasterStore((state) => state.garageThemeIndex);
  const palette = garageTheme(themeIndex);
  const bays = garageBays(owned);
  return (
    <group>
      <ambientLight intensity={0.78} />
      <directionalLight position={[2, 9, 5]} intensity={0.7} castShadow />
      <pointLight position={[0, 2.6, 0]} intensity={0.55} distance={16} />
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[12.6, 0.12, 12.6]} />
        <meshStandardMaterial color={palette.floor} roughness={0.98} />
      </mesh>
      <AuthoredGarageGeometry palette={palette} />
      <GarageFittings palette={palette} />
      <GarageThemeSwitch palette={palette} />
      <ExitDoor />
      {bays.map((vehicle, index) => <Bay key={index} index={index} vehicle={vehicle} palette={palette} />)}
      <Text position={[0, 2.5, -5.86]} fontSize={0.3} color="#5c3a21" anchorX="center">YOUR GARAGE</Text>
      <Text position={[0, 2.14, -5.86]} fontSize={0.14} color="#7a6353" anchorX="center">
        RIDES ARE STORED HERE
      </Text>
    </group>
  );
}
