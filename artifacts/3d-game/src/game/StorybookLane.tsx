import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { getTrackedPlayerPosition } from './world';
import { useStorybookLaneStore } from './storybookLaneStore';
import { useFinalMasterStore } from './finalMasterStore';
import { REALTORS, realtorPatrolTarget, type RealtorProfile } from './realEstate';
import { DOG_RECALL_RESCUE_DISTANCE, consumeDogRecall } from './dogRecall';
import { STORYBOOK_PLAY_LOOPS, storybookPlayTarget, type PlayStyle, type StorybookPlayLoop } from './storybookPlay';
import { isAfterHours } from './storybookLaneConfig';
import { GARAGE_DOOR_APPROACH, TENNIS_APPROACH, TENNIS_COURT } from './world';
import { activitySpots, type NeighborhoodActivityId, type NeighborhoodSpot } from './neighborhood';
import { KID_CAST, type KidDefinition } from './NPCs';
import { useGameStore } from './store';

const HOUSES = [
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

function House({ house }: { house: typeof HOUSES[number] }) {
  const [x, , z] = house.position;
  const door = [x, 0, z + 2.65] as const;
  useStorybookCandidate(`storybook-home-${house.id}`, door, 2.4, 18);
  return (
    <group position={house.position}>
      <mesh position={[0, 1.6, -2.45]} castShadow receiveShadow><boxGeometry args={[6.2, 3.2, 0.3]} /><meshStandardMaterial color={house.color} roughness={0.86} /></mesh>
      <mesh position={[-2.95, 1.6, 0]} castShadow receiveShadow><boxGeometry args={[0.3, 3.2, 5.2]} /><meshStandardMaterial color={house.color} roughness={0.86} /></mesh>
      <mesh position={[2.95, 1.6, 0]} castShadow receiveShadow><boxGeometry args={[0.3, 3.2, 5.2]} /><meshStandardMaterial color={house.color} roughness={0.86} /></mesh>
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[6.2, 0.12, 5.2]} /><meshStandardMaterial color="#ead3ad" roughness={0.94} /></mesh>
      <mesh position={[0, 3.65, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[4.6, 2.3, 4]} />
        <meshStandardMaterial color="#9a5639" roughness={0.82} />
      </mesh>
      <Text position={[0, 2.7, 2.76]} fontSize={0.38} color="#fffaf0" anchorX="center" anchorY="middle">
        {house.label}
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


/**
 * Wavy Manor — the property the player can own.
 *
 * The shell is a single collider (nobody walks through the exterior; the
 * front door loads the interior zone), so everything here is skin over
 * that one solid plus flat surfaces for the drive and the path.
 */
function WavyManor() {
  const owned = useFinalMasterStore((state) => state.ownedStarterHome);
  useStorybookCandidate('storybook-home-my-home', [-13, 0, -9.6], 2.6, 40);
  useStorybookCandidate('storybook-garage-door', GARAGE_DOOR_APPROACH, 2.5, 38);
  return (
    <group>
      {/* Driveway and front path: flat surfaces, walked straight over. */}
      <mesh position={[-16.5, 0.02, -8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, 6]} /><meshStandardMaterial color="#8d8983" roughness={0.96} />
      </mesh>
      <mesh position={[-13, 0.02, -8.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.6, 5]} /><meshStandardMaterial color="#cfc3a8" roughness={0.96} />
      </mesh>
      <mesh position={[-13, 0.04, -10.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.4, 1.1]} /><meshStandardMaterial color="#d8cbb0" />
      </mesh>

      {/* Shell: ground storey, upper storey, roof. */}
      <mesh position={[-13, 1.6, -14]} castShadow receiveShadow>
        <boxGeometry args={[10, 3.2, 6]} /><meshStandardMaterial color="#f2d9a8" roughness={0.88} />
      </mesh>
      <mesh position={[-13, 4.4, -14.3]} castShadow receiveShadow>
        <boxGeometry args={[9, 2.4, 5.4]} /><meshStandardMaterial color="#e9c98d" roughness={0.88} />
      </mesh>
      <mesh position={[-13, 6.1, -14.3]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[6.4, 1.9, 4]} /><meshStandardMaterial color="#7d4a37" roughness={0.85} />
      </mesh>

      {/* Garage front: a roller door the player can actually open. */}
      <group position={[-16.4, 0, -10.94]}>
        {[0.4, 1.0, 1.6, 2.2].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <boxGeometry args={[2.8, 0.5, 0.16]} />
            <meshStandardMaterial color="#dfe3e7" roughness={0.62} metalness={0.1} />
          </mesh>
        ))}
        <mesh position={[0, 2.62, 0.02]} castShadow>
          <boxGeometry args={[3.1, 0.16, 0.24]} /><meshStandardMaterial color="#8a5a44" />
        </mesh>
        <Text position={[0, 2.86, 0.06]} fontSize={0.19} color="#5c3a21" anchorX="center">GARAGE</Text>
      </group>

      {/* Front door and porch. */}
      <mesh position={[-13, 1.15, -10.94]} castShadow>
        <boxGeometry args={[1.5, 2.3, 0.16]} /><meshStandardMaterial color="#8a5a44" />
      </mesh>
      <mesh position={[-12.5, 1.12, -10.83]}><sphereGeometry args={[0.08, 10, 8]} /><meshStandardMaterial color="#e8c15a" metalness={0.5} /></mesh>
      <mesh position={[-13, 2.72, -10.6]} castShadow>
        <boxGeometry args={[4.6, 0.24, 1.2]} /><meshStandardMaterial color="#7d4a37" />
      </mesh>

      {/* Windows: frame, sill and tinted glass rather than a flat blue slab.
          The upper row lines up with the upper storey's own front face. */}
      {[-15.6, -10.4].map((x) => <ManorWindow key={x} x={x} y={1.62} z={-10.94} width={1.7} height={1.2} />)}
      {[-15.2, -13, -10.8].map((x) => <ManorWindow key={`u${x}`} x={x} y={4.4} z={-11.62} width={1.4} height={1.1} />)}

      {/* Shrubs, planted on the hedge lines so nothing sits across the
          driveway or the front door. */}
      {[-14.5, -11.6, -10.4, -9.2].map((x) => (
        <mesh key={`s${x}`} position={[x, 0.42, -10.65]} castShadow>
          <sphereGeometry args={[0.42, 12, 10]} /><meshStandardMaterial color="#5f9e63" roughness={1} />
        </mesh>
      ))}

      {/* Dog house in the side yard, clear of the path and the driveway.
          It is the dog's home spot as well as a sign the player owns one. */}
      <DogHouse />

      {/* Mailbox on the curb. */}
      <group position={[-11.84, 0, -6.2]}>
        <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.07, 0.07, 1.1, 8]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <mesh position={[0, 1.2, 0]} castShadow><boxGeometry args={[0.28, 0.28, 0.5]} /><meshStandardMaterial color="#c8483f" /></mesh>
      </group>

      <Text position={[-13, 3.35, -10.55]} fontSize={0.4} color="#fffaf0" anchorX="center" anchorY="middle">
        {owned ? 'WAVY MANOR ★' : 'WAVY MANOR · FOR SALE'}
      </Text>
    </group>
  );
}

/** Where the dog lives, and where a recall brings it back from. */
export const DOG_HOUSE_POSITION: [number, number, number] = [-9.2, 0, -9.2];

/** A framed, glazed window on the manor's front elevation. */
function ManorWindow({ x, y, z, width, height }: { x: number; y: number; z: number; width: number; height: number }) {
  const bar = 0.1;
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[width + bar, height + bar, 0.06]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[width, height, 0.05]} />
        <meshStandardMaterial color="#bcdff0" roughness={0.16} metalness={0.12} transparent opacity={0.82} />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[bar * 0.5, height, 0.05]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.7} />
      </mesh>
      <mesh position={[0, -height / 2 - bar / 2, 0.09]}>
        <boxGeometry args={[width + bar * 2.4, bar * 0.8, 0.16]} />
        <meshStandardMaterial color="#e8dcc4" roughness={0.8} />
      </mesh>
    </group>
  );
}

function DogHouse() {
  const ownsDog = useStorybookLaneStore((state) => state.ownedItems.includes('dog'));
  if (!ownsDog) return null;
  return (
    <group position={DOG_HOUSE_POSITION}>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 0.84, 1.25]} />
        <meshStandardMaterial color="#b9764a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.98, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.98, 0.5, 4]} />
        <meshStandardMaterial color="#8a4f33" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.34, 0.64]}>
        <boxGeometry args={[0.5, 0.62, 0.06]} />
        <meshStandardMaterial color="#43301f" />
      </mesh>
      <mesh position={[0.86, 0.06, 0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.24, 14]} />
        <meshStandardMaterial color="#d9c7a5" />
      </mesh>
      <Text position={[0, 1.42, 0]} fontSize={0.18} color="#5c3a21" anchorX="center">DOG HOUSE</Text>
    </group>
  );
}

function Realtor({ profile }: { profile: RealtorProfile }) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const candidateId = `storybook-realtor-${profile.id}`;
  const candidatePosition = useMemo(() => new THREE.Vector3(...profile.patrol[0]), [profile]);
  useEffect(() => registerInteractionCandidate({
    id: candidateId, position: candidatePosition.clone(), valid: true, range: 2.6, priority: 44,
  }), [candidateId, candidatePosition]);
  useFrame((state, delta) => {
    if (!ref.current) return;
    candidatePosition.copy(ref.current.position);
    updateInteractionCandidate(candidateId, { position: candidatePosition, valid: true });
    target.set(...realtorPatrolTarget(profile, state.clock.elapsedTime));
    const offset = target.clone().sub(ref.current.position);
    offset.y = 0;
    if (offset.lengthSq() > 0.05) {
      ref.current.position.addScaledVector(offset.normalize(), Math.min(1.05 * delta, 1));
      ref.current.rotation.y = Math.atan2(-offset.x, -offset.z);
    }
  });
  return (
    <group ref={ref} position={profile.patrol[0]}>
      <CharacterModel
        bodyColor={profile.bodyColor}
        accentColor={profile.accentColor}
        bottomColor={profile.bottomColor}
        hairColor={profile.hairColor}
        hairStyle={profile.hairStyle}
        skinColor={profile.skinColor}
        isTeacher
        activityMode="conversation"
        idleVariant="look-around"
        motionSeed={profile.id === 'realtor_male_01' ? 21 : 22}
      />
      <Text position={[0, 2.3, 0]} fontSize={0.22} color="#3d2f24" anchorX="center">{profile.name.toUpperCase()}</Text>
      <Text position={[0, 2.05, 0]} fontSize={0.13} color="#6b5a4a" anchorX="center">{profile.title}</Text>
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
  // One dog, one component. A recall never spawns a second one; at worst it
  // moves this one, and only when it is genuinely stranded.
  useStorybookCandidate('storybook-whistle-dog', DOG_HOUSE_POSITION, 3.2, 30);
  useFrame((_, delta) => {
    if (!ref.current || !ownsDog) return;
    const [x, , z] = getTrackedPlayerPosition();
    const target = new THREE.Vector3(x - 1.1, 0, z + 1.2);
    const recall = consumeDogRecall();
    if (recall) {
      // Close enough to hear you: it just hurries over. Genuinely lost -
      // stuck on geometry, or left on the far side of the lane - and it
      // comes home from the dog house rather than teleporting to your feet.
      if (ref.current.position.distanceTo(target) > DOG_RECALL_RESCUE_DISTANCE) {
        ref.current.position.set(...DOG_HOUSE_POSITION);
      } else {
        ref.current.position.lerp(target, 0.55);
      }
    }
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

/**
 * The cast at after-hours play.
 *
 * Every child walks their own authored loop, so they spread across the
 * neighbourhood instead of piling onto one anchor, and the ones on wheels
 * bring their ride with them. Positions are lerped on the frame rather than
 * pushed through state, so eleven children cost eleven transforms and no
 * re-renders.
 */
function AfterHoursChild({ loop, cast }: { loop: StorybookPlayLoop; cast: KidDefinition }) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...loop.spots[0]), [loop]);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const riding = loop.style === 'trike' || loop.style === 'ride-on';
  useFrame((state, delta) => {
    if (!ref.current) return;
    target.set(...storybookPlayTarget(loop, state.clock.elapsedTime));
    offset.copy(target).sub(ref.current.position);
    offset.y = 0;
    if (offset.lengthSq() > 0.08) {
      const speed = riding ? 1.9 : 1.15;
      ref.current.position.addScaledVector(offset.normalize(), Math.min(speed * delta, 1));
      ref.current.rotation.y = Math.atan2(-offset.x, -offset.z);
    }
  });
  const mode = loop.style === 'chat'
    ? 'conversation'
    : loop.style === 'sit'
      ? 'reading'
      : 'playing';
  return (
    <group ref={ref} position={loop.spots[0] as unknown as [number, number, number]}>
      <group position={[0, riding ? 0.34 : 0, 0]}>
        <CharacterModel
          bodyColor={cast.color}
          accentColor={cast.accent}
          hairColor={cast.hairColor}
          hairStyle={cast.hairStyle}
          skinColor={cast.skinColor}
          activityMode={mode}
          motionSeed={loop.name.length + loop.spots.length}
        />
      </group>
      {riding && <Ride style={loop.style} />}
      <Text position={[0, 2.05, 0]} fontSize={0.17} color="#5c3a21" anchorX="center">{loop.name}</Text>
    </group>
  );
}

/** The trike or ride-on under a child who is using one. */
function Ride({ style }: { style: PlayStyle }) {
  if (style === 'trike') {
    return (
      <group position={[0, 0.3, 0]}>
        <mesh castShadow><boxGeometry args={[0.5, 0.22, 1.25]} /><meshStandardMaterial color="#e94255" /></mesh>
        {[-0.5, 0.5].map((z) => (
          <mesh key={z} position={[0, -0.18, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.1, 10]} /><meshStandardMaterial color="#292929" />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group position={[0, 0.34, 0]}>
      <mesh castShadow><boxGeometry args={[1.05, 0.55, 1.85]} /><meshStandardMaterial color="#7c4dff" metalness={0.16} /></mesh>
      <mesh position={[0, 0.46, -0.22]}><boxGeometry args={[0.7, 0.44, 0.68]} /><meshStandardMaterial color="#f9d84a" /></mesh>
      {[[-0.5, 0.62], [0.5, 0.62], [-0.5, -0.62], [0.5, -0.62]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, -0.24, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.12, 10]} /><meshStandardMaterial color="#292929" />
        </mesh>
      ))}
    </group>
  );
}

function AfterHoursPlay() {
  const minute = useGameStore((state) => state.clock.minute);
  if (!isAfterHours(minute)) return null;
  return (
    <group>
      {STORYBOOK_PLAY_LOOPS.map((loop) => {
        const cast = KID_CAST.find((kid) => kid.name === loop.name);
        return cast ? <AfterHoursChild key={loop.name} loop={loop} cast={cast} /> : null;
      })}
    </group>
  );
}

/** The tennis court: surface, lines, net and a fence. */
function TennisCourt() {
  const midX = (TENNIS_COURT.minX + TENNIS_COURT.maxX) / 2;
  const midZ = (TENNIS_COURT.minZ + TENNIS_COURT.maxZ) / 2;
  const width = TENNIS_COURT.maxX - TENNIS_COURT.minX;
  const depth = TENNIS_COURT.maxZ - TENNIS_COURT.minZ;
  useStorybookCandidate('storybook-tennis', TENNIS_APPROACH, 2.6, 42);
  return (
    <group>
      <mesh position={[midX, 0.02, midZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#5f8f6a" roughness={1} />
      </mesh>
      {/* Court lines. */}
      {[TENNIS_COURT.minZ + 0.5, TENNIS_COURT.maxZ - 0.5].map((z) => (
        <mesh key={z} position={[midX, 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width - 1, 0.09]} /><meshStandardMaterial color="#f4f7f3" />
        </mesh>
      ))}
      {[TENNIS_COURT.minX + 0.5, TENNIS_COURT.maxX - 0.5].map((x) => (
        <mesh key={x} position={[x, 0.03, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.09, depth - 1]} /><meshStandardMaterial color="#f4f7f3" />
        </mesh>
      ))}
      <mesh position={[midX, 0.03, midZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 1, 0.07]} /><meshStandardMaterial color="#f4f7f3" />
      </mesh>
      {/* Net. */}
      <mesh position={[midX, 0.48, midZ]} castShadow>
        <boxGeometry args={[width - 0.6, 0.9, 0.07]} />
        <meshStandardMaterial color="#e7ecef" transparent opacity={0.86} />
      </mesh>
      {/* Fence posts at the corners, outside the play area. */}
      {[[TENNIS_COURT.minX, TENNIS_COURT.minZ], [TENNIS_COURT.maxX, TENNIS_COURT.minZ],
        [TENNIS_COURT.minX, TENNIS_COURT.maxZ], [TENNIS_COURT.maxX, TENNIS_COURT.maxZ]].map(([x, z]) => (
        <mesh key={`${x}-${z}`} position={[x, 0.8, z]} castShadow>
          <boxGeometry args={[0.16, 1.6, 0.16]} /><meshStandardMaterial color="#6f7a63" />
        </mesh>
      ))}
      <Text position={[midX, 1.9, TENNIS_COURT.maxZ + 0.4]} fontSize={0.34} color="#4a5a44" anchorX="center">
        STONY BROOK COURT
      </Text>
    </group>
  );
}

/** Lamp posts, benches, planters and a lane sign. */
function LaneFurniture() {
  return (
    <group>
      {[[-7, -6], [7, -6], [0, 12]].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.13, 3, 8]} /><meshStandardMaterial color="#4a4f55" />
          </mesh>
          <mesh position={[0, 3.12, 0]} castShadow>
            <sphereGeometry args={[0.26, 12, 10]} />
            <meshStandardMaterial color="#fff3c7" emissive="#ffd98a" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      {[[-4.5, -11.4], [4.5, -11.4]].map(([x, z]) => (
        <group key={`b${x}`} position={[x, 0, z]}>
          <mesh position={[0, 0.42, 0]} castShadow>
            <boxGeometry args={[1.8, 0.12, 0.5]} /><meshStandardMaterial color="#9a7d5c" />
          </mesh>
          <mesh position={[0, 0.68, -0.2]} castShadow>
            <boxGeometry args={[1.8, 0.42, 0.1]} /><meshStandardMaterial color="#9a7d5c" />
          </mesh>
          {[-0.7, 0.7].map((leg) => (
            <mesh key={leg} position={[leg, 0.2, 0]}>
              <boxGeometry args={[0.12, 0.4, 0.42]} /><meshStandardMaterial color="#6f5b45" />
            </mesh>
          ))}
        </group>
      ))}
      {[-2.5, 2.5].map((x) => (
        <group key={`p${x}`} position={[x, 0, 12]}>
          <mesh position={[0, 0.32, 0]} castShadow>
            <boxGeometry args={[0.8, 0.64, 0.8]} /><meshStandardMaterial color="#b9764a" />
          </mesh>
          <mesh position={[0, 0.74, 0]} castShadow>
            <sphereGeometry args={[0.38, 12, 10]} /><meshStandardMaterial color="#5f9e63" roughness={1} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, -12]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[0.14, 2.4, 0.14]} /><meshStandardMaterial color="#7f5a42" />
        </mesh>
        <mesh position={[0, 2.15, 0]} castShadow>
          <boxGeometry args={[2.4, 0.55, 0.08]} /><meshStandardMaterial color="#fff6e2" />
        </mesh>
        <Text position={[0, 2.15, 0.06]} fontSize={0.24} color="#5c3a21" anchorX="center">STONY BROOK</Text>
      </group>
    </group>
  );
}

/** The three neighbourhood activities, as markers you walk up to. */
function NeighborhoodSpots() {
  const done = useFinalMasterStore((state) => state.neighborhoodDone);
  return (
    <group>
      {activitySpots().map(({ activity, spot }) => (
        <NeighborhoodMarker key={spot.id} activityId={activity.id} spot={spot} done={done.includes(spot.id)} />
      ))}
    </group>
  );
}

function NeighborhoodMarker({ activityId, spot, done }: {
  activityId: NeighborhoodActivityId; spot: NeighborhoodSpot; done: boolean;
}) {
  useStorybookCandidate(`storybook-spot-${spot.id}`, spot.position, 2.2, done ? 12 : 36);
  const color = activityId === 'mail-run' ? '#5fa8d3' : activityId === 'chalk-art' ? '#e78bb5' : '#f2c94c';
  return (
    <group position={spot.position as unknown as [number, number, number]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.54, 20]} />
        <meshBasicMaterial color={done ? '#9aa79b' : color} transparent opacity={done ? 0.35 : 0.8} />
      </mesh>
      {!done && (
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[0.34, 0.34, 0.12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
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
      <WavyManor />
      {REALTORS.map((profile) => <Realtor key={profile.id} profile={profile} />)}
      {HOUSES.map((house) => <House key={house.id} house={house} />)}
      <VehicleSpot />
      <DogFollower />
      <group position={[0, 0, 22]}>
        <mesh position={[-2.5, 1.25, 0]} castShadow><boxGeometry args={[0.34, 2.5, 0.34]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <mesh position={[2.5, 1.25, 0]} castShadow><boxGeometry args={[0.34, 2.5, 0.34]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <mesh position={[0, 2.55, 0]} castShadow><boxGeometry args={[5.35, 0.38, 0.34]} /><meshStandardMaterial color="#7f5a42" /></mesh>
        <Text position={[0, 2.5, -0.22]} rotation={[0, Math.PI, 0]} fontSize={0.42} color="#fff7df" anchorX="center">BACK TO DAYKARE</Text>
      </group>
      <AfterHoursPlay />
      <TennisCourt />
      <LaneFurniture />
      <NeighborhoodSpots />
    </group>
  );
}
