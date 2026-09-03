import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useGameStore } from './store';
import { SuppliedArtwork } from './Artwork';
import { shouldUpdateOptionalAnimation } from './performanceTelemetry';

import * as THREE from 'three';

export function HubDetails() {
  const isImaginationMode = useGameStore((s) => s.isImaginationMode);
  const schedule = useGameStore((s) => s.schedule);
  const storageOrganizer = useGameStore((s) => s.progression.hubUpgrades.includes('storage-organizer'));

  return (
    <group>
      <Cubbies imaginationMode={isImaginationMode} />
      <ReadingNook />
      <ActivityStationDressing imaginationMode={isImaginationMode} />
      <ArtGallery imaginationMode={isImaginationMode} />
      <RoomFinishing imaginationMode={isImaginationMode} />
      {schedule === 'nap' && <NapMats />}
      <PlaygroundDetails />
      <CeilingMobile imaginationMode={isImaginationMode} />
      <ScheduleBeacon schedule={schedule} imaginationMode={isImaginationMode} />
      <SuppliedArtwork fileName="02_wall_mural_welcome.png" surfaceAnchor={{ solidId: 'main-south-wall-west', face: 'north', height: 1.55, along: -5.1 }} size={[4.05, 2.65]} support="frame" />
      <SuppliedArtwork fileName="03_wall_decals_set.png" surfaceAnchor={{ solidId: 'hall-divider-south', face: 'east', height: 1.6, along: 4.5 }} size={[2.15, 1.6]} support="corkboard" />
      <SuppliedArtwork fileName="06_posters_charts.png" surfaceAnchor={{ solidId: 'north-boundary', face: 'south', height: 1.72, along: -12 }} size={[2.5, 1.88]} semanticRole="wayfinding" support="corkboard" />
      <SuppliedArtwork fileName="17_motivational_banner.png" surfaceAnchor={{ solidId: 'west-boundary', face: 'east', height: 1.65, along: 0 }} size={[2.55, 1.9]} semanticRole="wayfinding" support="rail" />
      <SuppliedArtwork fileName="04_classroom_scene.png" surfaceAnchor={{ solidId: 'main-south-wall-east', face: 'north', height: 1.72, along: 5 }} size={[2.55, 1.9]} support="frame" />
      <SuppliedArtwork fileName="05_playground_equipment.png" surfaceAnchor={{ solidId: 'east-boundary', face: 'west', height: 1.65, along: -4.2 }} size={[2.55, 1.9]} semanticRole="wayfinding" support="corkboard" />
      <SuppliedArtwork fileName="09_cubby_labels.png" surfaceAnchor={{ solidId: 'cubbies', face: 'north', height: 1.18, along: -5.7 }} size={[2.95, 0.72]} semanticRole="wayfinding" support="rail" />
      <SuppliedArtwork fileName="10_props_toys.png" surfaceAnchor={{ solidId: 'art-table', face: 'top', height: 1.03 }} size={[2.25, 1.55]} semanticRole="activity-surface" support="tray" />
      <SuppliedArtwork fileName="14_environment_props.png" surfaceAnchor={{ solidId: 'west-boundary', face: 'east', height: 1.65, along: 4.4 }} size={[2.35, 1.75]} support="corkboard" />
      <SuppliedArtwork fileName="19_attendance_chart.png" surfaceAnchor={{ solidId: 'west-boundary', face: 'east', height: 1.7, along: -4.5 }} size={[2.3, 1.72]} semanticRole="wayfinding" support="corkboard" />
      <SuppliedArtwork fileName="08_floor_decals.png" position={[3.8, 0.026, 4.9]} size={[2.4, 1.8]} rotation={[-Math.PI / 2, 0, 0]} semanticRole="floor-marker" support="none" />
      <SuppliedArtwork fileName="15_wayfinding_floor_markers.png" position={[6.55, 0.027, -0.2]} size={[1.9, 1.35]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} semanticRole="floor-marker" support="none" />
      <SuppliedArtwork fileName="16_material_textures.png" surfaceAnchor={{ solidId: 'north-boundary', face: 'south', height: 1.55, along: 12 }} size={[1.65, 1.15]} support="corkboard" />
      {storageOrganizer && <LostAndFoundOrganizer />}
    </group>
  );
}

function ActivityStationDressing({ imaginationMode }: { imaginationMode: boolean }) {
  const warm = imaginationMode ? '#ff4da6' : '#e76f51';
  const sunny = imaginationMode ? '#ffd166' : '#f4a261';
  const cool = imaginationMode ? '#52e7ff' : '#2a9d8f';
  return (
    <group>
      {/* Shared block station: a grounded tray and enough pieces to read from the camera. */}
      <group position={[-2.8, 0, 1.4]}>
        <mesh position={[0, 0.055, 0]} receiveShadow>
          <cylinderGeometry args={[0.68, 0.72, 0.1, 16]} />
          <meshStandardMaterial color="#f4dfb6" roughness={0.94} />
        </mesh>
        {[
          [-0.3, 0.18, -0.12, warm],
          [0.02, 0.18, 0.16, cool],
          [0.31, 0.18, -0.06, sunny],
          [-0.12, 0.4, 0.02, '#4c82d4'],
        ].map(([x, y, z, color], index) => (
          <mesh key={index} position={[x as number, y as number, z as number]} rotation={[0, index * 0.28, 0]}>
            <boxGeometry args={[0.26, 0.26, 0.26]} />
            <meshStandardMaterial color={color as string} roughness={0.86} />
          </mesh>
        ))}
      </group>

      {/* Story station: open books stay on a real floor mat beside the reading nook. */}
      <group position={[4.05, 0, -5.05]}>
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.82, 18]} />
          <meshStandardMaterial color={imaginationMode ? '#5a47a8' : '#a8dadc'} roughness={0.94} />
        </mesh>
        {[-0.3, 0.28].map((x, index) => (
          <group key={x} position={[x, 0.07, 0.05 + index * 0.08]} rotation={[0, index ? -0.45 : 0.35, 0]}>
            <mesh position={[-0.13, 0, 0]}><boxGeometry args={[0.25, 0.045, 0.34]} /><meshStandardMaterial color={index ? sunny : '#4c82d4'} /></mesh>
            <mesh position={[0.13, 0, 0]}><boxGeometry args={[0.25, 0.045, 0.34]} /><meshStandardMaterial color="#fff1cf" /></mesh>
          </group>
        ))}
      </group>

      {/* Circle-time boundary keeps small groups readable without becoming a collider. */}
      <mesh position={[0, 0.024, 2.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.055, 8, 28]} />
        <meshBasicMaterial color={cool} transparent opacity={0.72} />
      </mesh>
    </group>
  );
}

function RoomFinishing({ imaginationMode }: { imaginationMode: boolean }) {
  const accent = imaginationMode ? '#52e7ff' : '#2a9d8f';
  const warm = imaginationMode ? '#ff4da6' : '#e76f51';
  const sunny = imaginationMode ? '#ffd166' : '#f4a261';
  return (
    <group>
      {/* Classroom: low-cost wall dots and a soft story-time mat. */}
      <mesh position={[-3.8, 0.025, 5.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.15, 20]} />
        <meshStandardMaterial color="#a8dadc" roughness={0.92} />
      </mesh>
      {[-4.8, -3.8, -2.8].map((x, index) => (
          <mesh key={x} position={[x, 1.9, 7.64]}>
          <circleGeometry args={[0.28 + index * 0.04, 12]} />
          <meshStandardMaterial color={[warm, sunny, accent][index]} roughness={0.8} />
        </mesh>
      ))}

      {/* Hallway: a runner, name tiles, and cheerful pennants. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, 0.018, 0]}>
        <planeGeometry args={[2.35, 10.8]} />
        <meshStandardMaterial color={imaginationMode ? '#5935a5' : '#e29578'} roughness={0.94} />
      </mesh>
      {[-5, -3, -1, 1, 3, 5].map((z, index) => (
        <group key={z}>
          <mesh position={[-15.65, 1.55, z]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.5, 0.42, 0.025]} />
            <meshStandardMaterial color={[warm, sunny, accent][index % 3]} roughness={0.82} />
          </mesh>
          <mesh position={[-10.2, 0.055, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.18, 10]} />
            <meshBasicMaterial color={[accent, sunny, warm][index % 3]} />
          </mesh>
        </group>
      ))}

      {/* Art room: washable rug, paint cups, and pinned paper. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, 0.018, -14.65]}>
        <planeGeometry args={[5.2, 1.1]} />
        <meshStandardMaterial color={imaginationMode ? '#3d5bd6' : '#f1faee'} roughness={0.92} />
      </mesh>
      {[-0.55, 0, 0.55].map((x, index) => (
        <group key={x} position={[-12 + x, 1.12, -12]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.1, 0.22, 8]} />
            <meshStandardMaterial color={[warm, sunny, accent][index]} roughness={0.76} />
          </mesh>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.14 - index * 0.12]}>
            <cylinderGeometry args={[0.014, 0.014, 0.3, 5]} />
            <meshBasicMaterial color="#bc6c25" />
          </mesh>
        </group>
      ))}

      {/* Storage: box labels and grounded foam shapes without extra shadows. */}
      {[
        [-14, 1.02, 9.27, warm],
        [-11, 1.02, 13.07, accent],
        [-14, 1.92, 9.58, sunny],
      ].map(([x, y, z, color], index) => (
        <mesh key={index} position={[x as number, y as number, z as number]}>
          <boxGeometry args={[0.48, 0.24, 0.025]} />
          <meshStandardMaterial color={color as string} roughness={0.84} />
        </mesh>
      ))}
      {[-13.2, -12.4, -11.6].map((x, index) => (
        <mesh key={x} position={[x, 0.12, 9]} rotation={[0, index * 0.45, 0]}>
          <boxGeometry args={[0.3, 0.24, 0.3]} />
          <meshStandardMaterial color={[accent, warm, sunny][index]} roughness={0.9} />
        </mesh>
      ))}

      {/* Playground: hopscotch tiles and a row of planted flowers. */}
      {[0, 1, 2, 3].map((index) => (
        <mesh key={index} rotation={[-Math.PI / 2, 0, index % 2 ? 0.15 : -0.15]} position={[9.05 + (index % 2) * 0.34, 0.019, -7.8 + index * 0.58]}>
          <planeGeometry args={[0.58, 0.5]} />
          <meshBasicMaterial color={[sunny, accent, warm][index % 3]} />
        </mesh>
      ))}
      {[-13.5, -12.4, -11.3].map((z, index) => (
        <group key={z} position={[15.2, 0, z]}>
          <mesh position={[0, 0.34, 0]}><cylinderGeometry args={[0.025, 0.025, 0.65, 5]} /><meshBasicMaterial color="#2a9d8f" /></mesh>
          <mesh position={[0, 0.68, 0]}><sphereGeometry args={[0.16, 8, 6]} /><meshStandardMaterial color={[warm, sunny, accent][index]} /></mesh>
        </group>
      ))}
    </group>
  );
}

/** The classroom ceiling, and where the mobile's hub hangs below it. */
export const CLASSROOM_CEILING_HEIGHT = 3.9;
export const MOBILE_HUB_HEIGHT = 3.05;

function Cubbies({ imaginationMode }: { imaginationMode: boolean }) {
  const colors = imaginationMode
    ? ['#ff4da6', '#52e7ff', '#ffd166', '#9d7cff']
    : ['#f4a261', '#457b9d', '#e76f51', '#2a9d8f'];

  return (
    <group position={[-5.7, 0, -6.7]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[3.8, 1.3, 0.62]} />
        <meshStandardMaterial color="#e9d8a6" roughness={0.82} />
      </mesh>
      {colors.map((color, index) => (
        <group key={color} position={[-1.25 + index * 0.83, 0.73, -0.34]}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.72, 0.08]} />
            <meshStandardMaterial color={color} roughness={0.68} />
          </mesh>
          <mesh position={[0, 0.1, -0.06]}>
            <sphereGeometry args={[0.08, 10, 8]} />
            <meshStandardMaterial color="#fff2d4" roughness={0.72} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ReadingNook() {
  return (
    <group position={[5.6, 0, -6.6]}>
      <mesh position={[0, 0.2, 0]} scale={[1.2, 0.28, 0.85]} castShadow>
        <sphereGeometry args={[0.75, 14, 10]} />
        <meshStandardMaterial color="#e76f51" roughness={0.85} />
      </mesh>
      <mesh position={[-0.62, 0.18, 0.22]} scale={[0.45, 0.18, 0.4]} castShadow>
        <sphereGeometry args={[0.55, 12, 8]} />
        <meshStandardMaterial color="#f4a261" roughness={0.85} />
      </mesh>
      <mesh position={[0.62, 0.18, 0.22]} scale={[0.45, 0.18, 0.4]} castShadow>
        <sphereGeometry args={[0.55, 12, 8]} />
        <meshStandardMaterial color="#2a9d8f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.78, -0.1]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.75]} />
        <meshStandardMaterial color="#bc6c25" roughness={0.78} />
      </mesh>
      {[0, 0.22, 0.44].map((x, index) => (
        <mesh key={x} position={[-0.48 + x, 0.9, -0.1]} rotation={[0, 0, index % 2 ? -0.1 : 0.08]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.42]} />
          <meshStandardMaterial color={['#e76f51', '#457b9d', '#e9c46a'][index]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function ArtGallery({ imaginationMode }: { imaginationMode: boolean }) {
  const frames = imaginationMode
    ? ['#ff4da6', '#52e7ff', '#ffd166']
    : ['#e76f51', '#457b9d', '#e9c46a'];

  return (
    <group position={[-7.64, 1.65, 0]} rotation={[0, Math.PI / 2, 0]}>
      {frames.map((color, index) => (
        <group key={color} position={[-4 + index * 4, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.15, 1.5, 0.12]} />
            <meshStandardMaterial color="#fefae0" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0, 0.075]}>
            <boxGeometry args={[0.82, 1.12, 0.025]} />
            <meshStandardMaterial color={color} roughness={0.62} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function PlaygroundDetails() {
  return (
    <group>
      <group position={[10, 0, 7.2]}>
        {[-1.2, 0, 1.2].map((x, index) => (
          <mesh key={x} position={[x, 0.04, Math.sin(index) * 0.3]} rotation={[0, index * 0.25, 0]} receiveShadow>
            <cylinderGeometry args={[0.48, 0.48, 0.08, 12]} />
            <meshStandardMaterial color={['#e9c46a', '#2a9d8f', '#e76f51'][index]} roughness={0.86} />
          </mesh>
        ))}
      </group>
      <group position={[14.7, 0, 8.8]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.28, 2.2, 10]} />
          <meshStandardMaterial color="#bc6c25" roughness={0.86} />
        </mesh>
        <mesh position={[0, 2.35, 0]} scale={[1, 0.8, 1]} castShadow>
          <sphereGeometry args={[0.75, 12, 10]} />
          <meshStandardMaterial color="#4a7c59" roughness={0.9} />
        </mesh>
      </group>
      <mesh position={[9.4, 0.36, -10.8]} castShadow>
        <boxGeometry args={[1.8, 0.72, 0.42]} />
        <meshStandardMaterial color="#e9d8a6" roughness={0.82} />
      </mesh>
      <mesh position={[9.4, 0.83, -10.8]} castShadow>
        <boxGeometry args={[1.35, 0.08, 0.6]} />
        <meshStandardMaterial color="#457b9d" roughness={0.72} />
      </mesh>
    </group>
  );
}

/**
 * The classroom mobile.
 *
 * These balls used to hang in space with nothing above them and turn on the
 * spot forever, which read as three objects the physics had forgotten. Now
 * there is a cord to the ceiling, a crossbar they hang from, and a slow sway
 * instead of a spin - so they look suspended on purpose.
 */
function CeilingMobile({ imaginationMode }: { imaginationMode: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const lastAnimationAt = useRef(0);
  const colors = imaginationMode ? ['#ff4da6', '#52e7ff', '#ffd166'] : ['#e76f51', '#457b9d', '#e9c46a'];
  const cordColor = imaginationMode ? '#f7d9ff' : '#e9d8a6';

  useFrame((state) => {
    if (!ref.current || !shouldUpdateOptionalAnimation(lastAnimationAt, state.clock.elapsedTime * 1000)) return;
    // A gentle sway either side of rest, not a rotation that never ends.
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.32) * 0.22;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.51) * 0.03;
  });

  return (
    <group position={[0, MOBILE_HUB_HEIGHT, -1]}>
      {/* The cord to the ceiling. Without it the balls had no reason to be
          up there at all. */}
      <mesh position={[0, (CLASSROOM_CEILING_HEIGHT - MOBILE_HUB_HEIGHT) / 2, 0]}>
        <cylinderGeometry args={[0.014, 0.014, CLASSROOM_CEILING_HEIGHT - MOBILE_HUB_HEIGHT, 6]} />
        <meshBasicMaterial color={cordColor} />
      </mesh>
      <mesh position={[0, CLASSROOM_CEILING_HEIGHT - 0.05, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.1, 10]} />
        <meshStandardMaterial color="#bc6c25" roughness={0.8} />
      </mesh>
      <group ref={ref}>
        <mesh castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.09, 12]} />
          <meshStandardMaterial color="#bc6c25" roughness={0.78} />
        </mesh>
        {/* Crossbars, so the strings hang from something. */}
        {[0, Math.PI / 3, (2 * Math.PI) / 3].map((angle) => (
          <mesh key={angle} rotation={[0, angle, 0]} castShadow>
            <boxGeometry args={[1.74, 0.035, 0.035]} />
            <meshStandardMaterial color="#bc6c25" roughness={0.8} />
          </mesh>
        ))}
        {colors.map((color, index) => {
          const angle = (index / colors.length) * Math.PI * 2;
          const drop = 0.3 + index * 0.11;
          return (
            <group key={color} position={[Math.cos(angle) * 0.85, 0, Math.sin(angle) * 0.85]}>
              <mesh position={[0, -drop / 2, 0]}>
                <cylinderGeometry args={[0.011, 0.011, drop, 6]} />
                <meshBasicMaterial color={cordColor} />
              </mesh>
              <mesh position={[0, -drop, 0]} castShadow>
                <sphereGeometry args={[0.19, 10, 8]} />
                <meshStandardMaterial color={color} roughness={0.7} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

function ScheduleBeacon({
  schedule,
  imaginationMode,
}: {
  schedule: string;
  imaginationMode: boolean;
}) {
  const indicatorRef = useRef<THREE.Group>(null);
  const lastAnimationAt = useRef(0);
  const colors: Record<string, string> = {
    'morning-play': '#e9c46a',
    'art-time': '#e76f51',
    'juice-club': '#2a9d8f',
    'outdoor-play': '#457b9d',
    pickup: '#f4a261',
  };
  const color = imaginationMode ? '#ff4da6' : colors[schedule] ?? '#e9c46a';

  useFrame((state) => {
    if (
      indicatorRef.current
      && shouldUpdateOptionalAnimation(lastAnimationAt, state.clock.elapsedTime * 1000)
    ) {
      indicatorRef.current.position.y = Math.sin(state.clock.elapsedTime * 2.4) * 0.04;
    }
  });

  return (
    <group position={[6.7, 0, -6.8]}>
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.45, 6]} />
        <meshStandardMaterial color="#bc6c25" roughness={0.8} />
      </mesh>
      <group ref={indicatorRef}>
        <mesh position={[0.28, 1.27, 0]} rotation={[0, 0, -0.12]} castShadow>
          <boxGeometry args={[0.58, 0.32, 0.05]} />
          <meshStandardMaterial color={color} roughness={0.68} />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.35, 0.025, 6, 18]} />
          <meshBasicMaterial color={color} transparent opacity={0.45} />
        </mesh>
      </group>
    </group>
  );
}

function LostAndFoundOrganizer() {
  return (
    <group position={[-9.45, 0, 5]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[2.2, 1.1, 0.65]} />
        <meshStandardMaterial color="#2a9d8f" roughness={0.75} />
      </mesh>
      {[-0.7, 0, 0.7].map((x, index) => (
        <mesh key={x} position={[x, 0.62, -0.36]} castShadow>
          <boxGeometry args={[0.48, 0.58, 0.08]} />
          <meshStandardMaterial color={['#457b9d', '#e76f51', '#e9c46a'][index]} roughness={0.7} />
        </mesh>
      ))}
      {/* The sign used to hover 8 cm above the cabinet it belongs to. */}
      <mesh position={[0, 1.27, 0]} castShadow>
        <boxGeometry args={[1.8, 0.34, 0.1]} />
        <meshStandardMaterial color="#fefae0" roughness={0.7} />
      </mesh>
    </group>
  );
}

function NapMats() {
  return <group>{Array.from({ length: 11 }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return <group key={index} position={[-4.5 + column * 3, 0.025, 2.5 + row * 2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.45, 0.82]} /><meshStandardMaterial color={index % 2 ? '#a8dadc' : '#f3d6a0'} roughness={0.95} /></mesh>
      <mesh position={[-0.5, 0.08, 0]} scale={[0.34, 0.12, 0.34]}><sphereGeometry args={[0.35, 10, 7]} /><meshStandardMaterial color="#fff1cf" /></mesh>
    </group>;
  })}</group>;
}
