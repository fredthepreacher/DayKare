import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import {
  HOME_BASEMENT_MAX_X, HOME_BASEMENT_Y, HOME_EXIT_POINT, HOME_GROUND_MAX_X, HOME_GROUND_MIN_X,
  HOME_UPPER_MIN_X, HOME_UPPER_Y, WORLD_SOLIDS, groundHeightAt,
} from './world';

/**
 * The owned Stony Brook home.
 *
 * Every wall and every piece of furniture is drawn from the same solids
 * the collision system uses, so what the player sees and what stops them
 * cannot drift apart. Only the trim — rugs, lamps, a TV screen, art — is
 * authored separately, and none of it blocks.
 */

const WALL_COLORS: Record<string, string> = {
  basement: '#c3b6a4',
  ground: '#f6d9a8',
  upper: '#e8cfe4',
  stairs: '#e6c99a',
};

function floorBandFor(x: number): keyof typeof WALL_COLORS {
  if (x <= HOME_BASEMENT_MAX_X) return 'basement';
  if (x < HOME_GROUND_MIN_X) return 'stairs';
  if (x <= HOME_GROUND_MAX_X) return 'ground';
  if (x < HOME_UPPER_MIN_X) return 'stairs';
  return 'upper';
}

const HOME_SOLIDS = WORLD_SOLIDS.filter((solid) => solid.zone === 'home');

/** Walls and furniture, drawn straight from their colliders. */
function AuthoredHomeGeometry() {
  return <group>
    {HOME_SOLIDS.map((solid) => {
      const centerX = (solid.minX + solid.maxX) / 2;
      const centerZ = (solid.minZ + solid.maxZ) / 2;
      const base = groundHeightAt(centerX, 'home');
      const isWall = solid.kind === 'wall';
      const height = isWall ? 3 : (solid.maxY ?? 1);
      const color = isWall
        ? WALL_COLORS[floorBandFor(centerX)]
        : FURNITURE_COLORS[solid.id] ?? '#b98d63';
      return <mesh key={solid.id} position={[centerX, base + height / 2, centerZ]} castShadow receiveShadow>
        <boxGeometry args={[solid.maxX - solid.minX, height, solid.maxZ - solid.minZ]} />
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>;
    })}
  </group>;
}

const FURNITURE_COLORS: Record<string, string> = {
  'home-sofa': '#7fb2c4',
  'home-tv-stand': '#5c4433',
  'home-bookshelf': '#8d6244',
  'home-kitchen-counter-north': '#e6dcc8',
  'home-kitchen-counter-west': '#e6dcc8',
  'home-kitchen-island': '#d8c8ac',
  'home-fridge': '#dfe6e9',
  'home-dining-table': '#a9713f',
  'home-bath1-tub': '#eef4f6',
  'home-bath1-vanity': '#e2e8ea',
  'home-primary-bed': '#c98fae',
  'home-primary-dresser': '#8d6244',
  'home-primary-closet': '#a3785a',
  'home-flex-bed': '#8fb6c9',
  'home-flex-desk': '#9c7248',
  'home-bath2-tub': '#eef4f6',
  'home-bath2-vanity': '#e2e8ea',
  'home-rec-sofa': '#8c7fc4',
  'home-rec-arcade': '#4d3f6e',
  'home-rec-shelf': '#7d6047',
  'home-storage-crates': '#a98452',
  'home-storage-shelf': '#7d6047',
};

/** A floor slab. Non-blocking; the perimeter walls do the containing. */
function Slab({ minX, maxX, minZ, maxZ, y, color }: { minX: number; maxX: number; minZ: number; maxZ: number; y: number; color: string }) {
  return <mesh position={[(minX + maxX) / 2, y - 0.06, (minZ + maxZ) / 2]} receiveShadow>
    <boxGeometry args={[maxX - minX, 0.12, maxZ - minZ]} />
    <meshStandardMaterial color={color} roughness={0.95} />
  </mesh>;
}

/** A rug, a flat decoration that the player walks straight over. */
function Rug({ x, z, y, w, d, color }: { x: number; z: number; y: number; w: number; d: number; color: string }) {
  return <mesh position={[x, y + 0.015, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[w, d]} />
    <meshStandardMaterial color={color} roughness={1} />
  </mesh>;
}

function Lamp({ x, z, y }: { x: number; z: number; y: number }) {
  return <group position={[x, y, z]}>
    <mesh position={[0, 0.62, 0]}><cylinderGeometry args={[0.05, 0.09, 1.24, 10]} /><meshStandardMaterial color="#c8a05a" /></mesh>
    <mesh position={[0, 1.36, 0]}><coneGeometry args={[0.3, 0.36, 14]} /><meshStandardMaterial color="#fff0b8" emissive="#ffd98a" emissiveIntensity={0.35} /></mesh>
  </group>;
}

/** The staircases. Steps are decoration: the ramped floor height is what
 *  the player actually walks, so a step can never trap them. */
function Stairs({ fromX, toX, fromY, toY, z }: { fromX: number; toX: number; fromY: number; toY: number; z: number }) {
  const steps = 9;
  return <group>
    {Array.from({ length: steps }, (_, index) => {
      const t = index / steps;
      const next = (index + 1) / steps;
      const x = fromX + (toX - fromX) * (t + next) / 2;
      const y = fromY + (toY - fromY) * next;
      return <mesh key={index} position={[x, y - 0.07, z]} receiveShadow castShadow>
        <boxGeometry args={[Math.abs(toX - fromX) / steps, 0.14, 3.4]} />
        <meshStandardMaterial color="#b98d63" roughness={0.9} />
      </mesh>;
    })}
  </group>;
}

function RoomLabel({ x, z, y, text }: { x: number; z: number; y: number; text: string }) {
  return <Text position={[x, y + 2.45, z]} fontSize={0.26} color="#7a5a3f" anchorX="center" anchorY="middle">{text}</Text>;
}

function ExitDoor() {
  const vector = useMemo(() => new THREE.Vector3(...HOME_EXIT_POINT), []);
  const candidate = useMemo(() => ({ id: 'final-home-exit', position: vector.clone(), valid: true, range: 2.4, priority: 100, forcePriority: true, questPriority: true }), [vector]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate('final-home-exit', { position: vector, valid: true }));
  return <group position={[-1, 0, 8.02]}>
    <mesh position={[0, 1.15, 0]}><boxGeometry args={[1.5, 2.3, 0.14]} /><meshStandardMaterial color="#8a5a44" /></mesh>
    <mesh position={[0.52, 1.12, -0.1]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color="#e8c15a" metalness={0.5} /></mesh>
    <Text position={[0, 1.95, -0.1]} rotation={[0, Math.PI, 0]} fontSize={0.17} color="#fff3c7" anchorX="center">EXIT TO STONY BROOK</Text>
  </group>;
}

export function HomeInterior() {
  return <group>
    <ambientLight intensity={0.82} />
    <directionalLight position={[-4, 12, 6]} intensity={0.85} castShadow />
    <pointLight position={[-6, 2.4, 3]} intensity={0.5} distance={14} />
    <pointLight position={[12, HOME_UPPER_Y + 2.4, 2]} intensity={0.45} distance={14} />
    <pointLight position={[-19, HOME_BASEMENT_Y + 2.2, 0]} intensity={0.5} distance={14} />

    {/* Floors */}
    <Slab minX={-26} maxX={-14} minZ={-7} maxZ={7} y={HOME_BASEMENT_Y} color="#9d9182" />
    <Slab minX={-10} maxX={2} minZ={-8} maxZ={8} y={0} color="#d8b98c" />
    <Slab minX={6} maxX={18} minZ={-8} maxZ={8} y={HOME_UPPER_Y} color="#cfa9c6" />

    {/* Stair corridors: a floor slab is no use on a slope, so the ramp
        surface itself is drawn as steps. */}
    <Stairs fromX={-14} toX={-10} fromY={HOME_BASEMENT_Y} toY={0} z={0} />
    <Stairs fromX={2} toX={6} fromY={0} toY={HOME_UPPER_Y} z={0} />

    <AuthoredHomeGeometry />
    <ExitDoor />

    {/* Living room */}
    <Rug x={-7} z={4} y={0} w={4.6} d={3.4} color="#c98fae" />
    <mesh position={[-8, 0.98, 1.4]}><boxGeometry args={[2.1, 1.2, 0.1]} /><meshStandardMaterial color="#2c3138" /></mesh>
    <mesh position={[-8, 0.98, 1.34]}><planeGeometry args={[1.95, 1.05]} /><meshStandardMaterial color="#5fa8d3" emissive="#2f6f9c" emissiveIntensity={0.35} /></mesh>
    <mesh position={[-7, 0.42, 4]} castShadow><boxGeometry args={[1.5, 0.44, 0.9]} /><meshStandardMaterial color="#a9713f" /></mesh>
    <Lamp x={-4.2} z={7} y={0} />
    <mesh position={[-9.85, 1.9, 4]}><boxGeometry args={[0.06, 1, 1.5]} /><meshStandardMaterial color="#8ec6a4" /></mesh>
    <RoomLabel x={-7} z={3} y={0} text="LIVING ROOM" />

    {/* Kitchen + coffee maker */}
    <mesh position={[-9.2, 1.02, -7.2]} castShadow><boxGeometry args={[0.34, 0.4, 0.3]} /><meshStandardMaterial color="#3e4750" /></mesh>
    <mesh position={[-6.4, 1.03, -7.2]} castShadow><boxGeometry args={[0.62, 0.16, 0.44]} /><meshStandardMaterial color="#8fb6c9" /></mesh>
    <RoomLabel x={-6.5} z={-5} y={0} text="KITCHEN" />

    {/* Dining */}
    {[[-2.1, 0.9], [-0.7, 0.9], [-2.1, 1.9], [-0.7, 1.9]].map(([cx, cz]) => (
      <mesh key={`${cx}-${cz}`} position={[cx, 0.28, cz]} castShadow><boxGeometry args={[0.42, 0.56, 0.42]} /><meshStandardMaterial color="#8d6244" /></mesh>
    ))}
    <RoomLabel x={-1.4} z={0} y={0} text="DINING" />

    {/* Entry */}
    <Rug x={-1} z={5.6} y={0} w={2.4} d={1.6} color="#d9b26a" />
    <RoomLabel x={-1} z={5} y={0} text="ENTRY" />

    {/* Bathroom 1 */}
    <mesh position={[0.2, 0.3, -7.2]} castShadow><boxGeometry args={[0.5, 0.6, 0.62]} /><meshStandardMaterial color="#f4f8f9" /></mesh>
    <mesh position={[1.25, 1.5, -7.9]}><boxGeometry args={[0.7, 0.62, 0.05]} /><meshStandardMaterial color="#cfe2e8" /></mesh>
    <RoomLabel x={-0.5} z={-5.5} y={0} text="BATHROOM" />

    {/* Upper: primary bedroom */}
    <Rug x={13} z={5.2} y={HOME_UPPER_Y} w={4.4} d={3.2} color="#e0b6cf" />
    <mesh position={[13.4, HOME_UPPER_Y + 0.3, 6.4]} castShadow><boxGeometry args={[0.6, 0.6, 0.5]} /><meshStandardMaterial color="#8d6244" /></mesh>
    <Lamp x={13.4} z={6.4} y={HOME_UPPER_Y + 0.6} />
    <RoomLabel x={13} z={4} y={HOME_UPPER_Y} text="PRIMARY BEDROOM" />

    {/* Upper: flex room */}
    <mesh position={[15.4, HOME_UPPER_Y + 0.26, -0.3]} castShadow><boxGeometry args={[0.44, 0.52, 0.44]} /><meshStandardMaterial color="#8d6244" /></mesh>
    <RoomLabel x={13.4} z={-1.4} y={HOME_UPPER_Y} text="FLEX ROOM" />

    {/* Upper: bathroom 2 + hallway */}
    <mesh position={[12.6, HOME_UPPER_Y + 0.3, -7.2]} castShadow><boxGeometry args={[0.5, 0.6, 0.62]} /><meshStandardMaterial color="#f4f8f9" /></mesh>
    <RoomLabel x={13.4} z={-5.4} y={HOME_UPPER_Y} text="BATHROOM 2" />
    <Lamp x={7.4} z={5} y={HOME_UPPER_Y} />
    <mesh position={[6.2, HOME_UPPER_Y + 1.9, 5]}><boxGeometry args={[0.06, 0.9, 1.3]} /><meshStandardMaterial color="#f0a0b8" /></mesh>
    <RoomLabel x={7.4} z={0} y={HOME_UPPER_Y} text="UPSTAIRS HALL" />

    {/* Basement rec room */}
    <Rug x={-18.6} z={4} y={HOME_BASEMENT_Y} w={5} d={3.6} color="#89c4a6" />
    {[[-17.4, 2.2], [-16.2, 3.2], [-18.8, 1.6]].map(([bx, bz]) => (
      <mesh key={`${bx}-${bz}`} position={[bx, HOME_BASEMENT_Y + 0.28, bz]} castShadow>
        <sphereGeometry args={[0.42, 12, 10]} />
        <meshStandardMaterial color={bx < -17 ? '#f2c94c' : '#ef7d82'} />
      </mesh>
    ))}
    <mesh position={[-20.2, HOME_BASEMENT_Y + 0.26, -4.2]} castShadow><boxGeometry args={[0.9, 0.52, 0.7]} /><meshStandardMaterial color="#5fa8d3" /></mesh>
    <RoomLabel x={-18} z={0} y={HOME_BASEMENT_Y} text="REC ROOM" />
    <RoomLabel x={-24} z={0} y={HOME_BASEMENT_Y} text="STORAGE" />
  </group>;
}
