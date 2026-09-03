import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import {
  HOME_BASEMENT_MAX_X, HOME_BASEMENT_Y, HOME_EXIT_POINT, HOME_GROUND_MAX_X, HOME_GROUND_MIN_X,
  HOME_UPPER_MIN_X, HOME_UPPER_Y, WORLD_SOLIDS, groundHeightAt,
} from './world';
import { useFinalMasterStore } from './finalMasterStore';
import { HOME_THEMES, homeTheme, type InteriorPalette } from './interiorThemes';

/**
 * The owned Stony Brook home.
 *
 * Every wall and every piece of furniture is drawn from the same solids
 * the collision system uses, so what the player sees and what stops them
 * cannot drift apart. Only the trim — rugs, lamps, a TV screen, art — is
 * authored separately, and none of it blocks.
 */

function wallColors(palette: InteriorPalette): Record<string, string> {
  return {
    basement: palette.wallBasement,
    ground: palette.wallGround,
    upper: palette.wallUpper,
    stairs: palette.trim,
  };
}

function floorBandFor(x: number): 'basement' | 'ground' | 'upper' | 'stairs' {
  if (x <= HOME_BASEMENT_MAX_X) return 'basement';
  if (x < HOME_GROUND_MIN_X) return 'stairs';
  if (x <= HOME_GROUND_MAX_X) return 'ground';
  if (x < HOME_UPPER_MIN_X) return 'stairs';
  return 'upper';
}

const HOME_SOLIDS = WORLD_SOLIDS.filter((solid) => solid.zone === 'home');

/** A walk-up spot inside the home. */
function useHomeCandidate(id: string, position: readonly [number, number, number], priority = 60, range = 2.3) {
  const vector = useMemo(() => new THREE.Vector3(...position), [position]);
  const candidate = useMemo(() => ({ id, position: vector.clone(), valid: true, range, priority }), [id, vector, range, priority]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate(id, { position: vector, valid: true }));
  return null;
}

/** Walls and furniture, drawn straight from their colliders. */
function AuthoredHomeGeometry({ palette }: { palette: InteriorPalette }) {
  const walls = wallColors(palette);
  return <group>
    {HOME_SOLIDS.map((solid) => {
      const centerX = (solid.minX + solid.maxX) / 2;
      const centerZ = (solid.minZ + solid.maxZ) / 2;
      const base = groundHeightAt(centerX, 'home');
      const isWall = solid.kind === 'wall';
      const height = isWall ? 3 : (solid.maxY ?? 1);
      const color = isWall
        ? walls[floorBandFor(centerX)]
        : FURNITURE_COLORS[solid.id] ?? palette.trim;
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
  'home-primary-nightstand-west': '#8d6244',
  'home-primary-nightstand-east': '#8d6244',
  'home-primary-dresser': '#8d6244',
  'home-primary-closet': '#a3785a',
  'home-primary-armchair': '#8fb6c9',
  'home-primary-desk': '#9c7248',
  'home-primary-bookshelf': '#8d6244',
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

/** The wardrobe in the primary bedroom, where outfits are changed. */
function ClosetStation() {
  useHomeCandidate('home-closet', [15.7, HOME_UPPER_Y, 2.5], 84, 2.4);
  return (
    <group position={[15.7, HOME_UPPER_Y, 2.5]}>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.72, 24]} />
        <meshBasicMaterial color="#ffd84d" transparent opacity={0.5} />
      </mesh>
      <Text position={[0, 2.35, 0]} fontSize={0.2} color="#7a5a3f" anchorX="center">CLOSET</Text>
    </group>
  );
}

/** The ping pong table, and the spot you stand at to play. */
function PingPongTable({ palette }: { palette: InteriorPalette }) {
  useHomeCandidate('home-ping-pong', [-18.55, HOME_BASEMENT_Y, -0.8], 82, 2.4);
  return (
    <group position={[-18.55, HOME_BASEMENT_Y, 1.55]}>
      <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.08, 2.7]} />
        <meshStandardMaterial color="#2f6f4f" roughness={0.85} />
      </mesh>
      {/* Centre line and net. */}
      <mesh position={[0, 0.725, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.05, 2.6]} />
        <meshStandardMaterial color="#f2f6f4" />
      </mesh>
      <mesh position={[0, 0.83, 0]}>
        <boxGeometry args={[1.62, 0.22, 0.03]} />
        <meshStandardMaterial color="#e9edf0" />
      </mesh>
      {[[-0.62, -1.2], [0.62, -1.2], [-0.62, 1.2], [0.62, 1.2]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.32, z]} castShadow>
          <boxGeometry args={[0.09, 0.64, 0.09]} />
          <meshStandardMaterial color={palette.trim} />
        </mesh>
      ))}
      {/* Two bats and a ball, so the table reads as ready to play. */}
      <mesh position={[-0.42, 0.75, 1.05]} rotation={[-Math.PI / 2, 0, 0.4]}>
        <cylinderGeometry args={[0.16, 0.16, 0.03, 14]} />
        <meshStandardMaterial color="#c8433f" />
      </mesh>
      <mesh position={[0.44, 0.75, -1.05]} rotation={[-Math.PI / 2, 0, -0.3]}>
        <cylinderGeometry args={[0.16, 0.16, 0.03, 14]} />
        <meshStandardMaterial color="#22262b" />
      </mesh>
      <mesh position={[0.1, 0.78, 0.6]}>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color="#fff6d8" />
      </mesh>
      <Text position={[0, 1.5, 0]} fontSize={0.18} color="#7a5a3f" anchorX="center">PING PONG</Text>
    </group>
  );
}

/** A paint swatch by the basement stairs that cycles the home's theme. */
function ThemeSwitch() {
  useHomeCandidate('home-theme-switch', [-15.2, HOME_BASEMENT_Y, 2.6], 70, 2.2);
  return (
    <group position={[-15.2, HOME_BASEMENT_Y, 2.6]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.12, 0.7, 0.9]} />
        <meshStandardMaterial color="#e9edf0" />
      </mesh>
      {HOME_THEMES.map((theme, index) => (
        <mesh key={theme.id} position={[0.07, 0.9, -0.24 + index * 0.48]}>
          <boxGeometry args={[0.03, 0.44, 0.36]} />
          <meshStandardMaterial color={theme.accent} />
        </mesh>
      ))}
      <Text position={[0, 1.5, 0]} fontSize={0.15} color="#7a5a3f" anchorX="center">HOME COLOURS</Text>
    </group>
  );
}

export function HomeInterior() {
  const themeIndex = useFinalMasterStore((state) => state.homeThemeIndex);
  const palette = homeTheme(themeIndex);
  return <group>
    <ambientLight intensity={0.82} />
    <directionalLight position={[-4, 12, 6]} intensity={0.85} castShadow />
    <pointLight position={[-6, 2.4, 3]} intensity={0.5} distance={14} />
    <pointLight position={[12, HOME_UPPER_Y + 2.4, 2]} intensity={0.45} distance={14} />
    <pointLight position={[-19, HOME_BASEMENT_Y + 2.2, 0]} intensity={0.5} distance={14} />

    {/* Floors */}
    <Slab minX={-26} maxX={-14} minZ={-7} maxZ={7} y={HOME_BASEMENT_Y} color={palette.floorBasement} />
    <Slab minX={-10} maxX={2} minZ={-8} maxZ={8} y={0} color={palette.floorGround} />
    <Slab minX={6} maxX={18} minZ={-8} maxZ={8} y={HOME_UPPER_Y} color={palette.floorUpper} />

    {/* Stair corridors: a floor slab is no use on a slope, so the ramp
        surface itself is drawn as steps. */}
    <Stairs fromX={-14} toX={-10} fromY={HOME_BASEMENT_Y} toY={0} z={0} />
    <Stairs fromX={2} toX={6} fromY={0} toY={HOME_UPPER_Y} z={0} />

    <AuthoredHomeGeometry palette={palette} />
    <ExitDoor />

    {/* Living room */}
    <Rug x={-7} z={4} y={0} w={4.6} d={3.4} color="#c98fae" />
    {/* TV setup: panel on a stand, with a soundbar and a console shelf. */}
    <mesh position={[-8, 1.12, 1.42]} castShadow><boxGeometry args={[2.25, 1.3, 0.09]} /><meshStandardMaterial color="#22262b" /></mesh>
    <mesh position={[-8, 1.12, 1.36]}><planeGeometry args={[2.05, 1.12]} /><meshStandardMaterial color="#5fa8d3" emissive="#2f6f9c" emissiveIntensity={0.4} /></mesh>
    <mesh position={[-8, 0.44, 1.42]}><boxGeometry args={[0.16, 0.32, 0.16]} /><meshStandardMaterial color="#3a4046" /></mesh>
    <mesh position={[-8, 0.68, 1.5]}><boxGeometry args={[1.5, 0.11, 0.13]} /><meshStandardMaterial color="#3a4046" /></mesh>
    <mesh position={[-8.9, 0.7, 1.5]}><boxGeometry args={[0.34, 0.09, 0.28]} /><meshStandardMaterial color={palette.accent} /></mesh>
    <mesh position={[-7, 0.42, 4]} castShadow><boxGeometry args={[1.5, 0.44, 0.9]} /><meshStandardMaterial color="#a9713f" /></mesh>
    <Lamp x={-4.2} z={7} y={0} />
    <mesh position={[-9.85, 1.9, 4]}><boxGeometry args={[0.06, 1, 1.5]} /><meshStandardMaterial color="#8ec6a4" /></mesh>
    <RoomLabel x={-7} z={3} y={0} text="LIVING ROOM" />

    {/* Kitchen + coffee maker */}
    <mesh position={[-9.2, 1.02, -7.2]} castShadow><boxGeometry args={[0.34, 0.4, 0.3]} /><meshStandardMaterial color="#3e4750" /></mesh>
    <mesh position={[-6.4, 1.03, -7.2]} castShadow><boxGeometry args={[0.62, 0.16, 0.44]} /><meshStandardMaterial color="#8fb6c9" /></mesh>
    <RoomLabel x={-6.5} z={-5} y={0} text="KITCHEN" />

    {/* The old dining area is open floor now, on the way to the stairs. */}
    <Rug x={-0.6} z={0.6} y={0} w={3} d={3.4} color={palette.accent} />
    <RoomLabel x={-0.6} z={-1.6} y={0} text="HALL" />

    {/* Entry */}
    <Rug x={-1} z={5.6} y={0} w={2.4} d={1.6} color="#d9b26a" />
    <RoomLabel x={-1} z={5} y={0} text="ENTRY" />

    {/* Bathroom 1 */}
    <mesh position={[0.2, 0.3, -7.2]} castShadow><boxGeometry args={[0.5, 0.6, 0.62]} /><meshStandardMaterial color="#f4f8f9" /></mesh>
    <mesh position={[1.25, 1.5, -7.9]}><boxGeometry args={[0.7, 0.62, 0.05]} /><meshStandardMaterial color="#cfe2e8" /></mesh>
    <RoomLabel x={-0.5} z={-5.5} y={0} text="BATHROOM" />

    {/* Upper: one large primary bedroom, sleeping end and reading end */}
    <Rug x={13.2} z={5.6} y={HOME_UPPER_Y} w={5.2} d={3.6} color="#e0b6cf" />
    <Rug x={13.4} z={-1.2} y={HOME_UPPER_Y} w={4} d={2.6} color="#d3bfe0" />
    {/* Headboard and pillows, so the bed reads as a bed and not a slab. */}
    <mesh position={[11.45, HOME_UPPER_Y + 0.62, 7.5]} castShadow><boxGeometry args={[2.2, 1.05, 0.16]} /><meshStandardMaterial color="#8d6244" /></mesh>
    {[-0.5, 0.5].map((offset) => (
      <mesh key={offset} position={[11.45 + offset, HOME_UPPER_Y + 0.7, 7.05]} castShadow>
        <boxGeometry args={[0.9, 0.18, 0.5]} /><meshStandardMaterial color="#fdf3f7" />
      </mesh>
    ))}
    <mesh position={[11.45, HOME_UPPER_Y + 0.64, 5.9]} castShadow><boxGeometry args={[2.05, 0.08, 1.5]} /><meshStandardMaterial color="#a3688c" /></mesh>
    <Lamp x={10.7} z={4.5} y={HOME_UPPER_Y + 0.56} />
    <Lamp x={12.2} z={4.5} y={HOME_UPPER_Y + 0.56} />
    {/* Closet doors, so the closet block reads as storage. */}
    {[2.0, 2.9].map((z) => (
      <mesh key={z} position={[16.36, HOME_UPPER_Y + 1.05, z]} castShadow>
        <boxGeometry args={[0.06, 1.9, 0.82]} /><meshStandardMaterial color="#c7a184" />
      </mesh>
    ))}
    <mesh position={[16.1, HOME_UPPER_Y + 1.75, 5.9]}><boxGeometry args={[0.06, 0.85, 1.2]} /><meshStandardMaterial color="#f0a0b8" /></mesh>
    <RoomLabel x={13.2} z={3.6} y={HOME_UPPER_Y} text="PRIMARY BEDROOM" />
    <ClosetStation />

    {/* Upper: bathroom 2 + hallway */}
    <mesh position={[12.6, HOME_UPPER_Y + 0.3, -7.2]} castShadow><boxGeometry args={[0.5, 0.6, 0.62]} /><meshStandardMaterial color="#f4f8f9" /></mesh>
    <RoomLabel x={13.4} z={-5.4} y={HOME_UPPER_Y} text="BATHROOM 2" />
    <Lamp x={7.4} z={5} y={HOME_UPPER_Y} />
    <mesh position={[6.2, HOME_UPPER_Y + 1.9, 5]}><boxGeometry args={[0.06, 0.9, 1.3]} /><meshStandardMaterial color="#f0a0b8" /></mesh>
    <RoomLabel x={7.4} z={0} y={HOME_UPPER_Y} text="UPSTAIRS HALL" />

    {/* Ping pong, in the rec room */}
    <PingPongTable palette={palette} />

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
    <RoomLabel x={-23.4} z={-1.4} y={HOME_BASEMENT_Y} text="DINING" />
    {/* Basement dining: table, chairs and a sideboard. */}
    <Rug x={-23.4} z={2.7} y={HOME_BASEMENT_Y} w={3.6} d={3.6} color={palette.accent} />
    <ThemeSwitch />
  </group>;
}
