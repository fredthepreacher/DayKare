import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';
import { SuppliedArtwork } from './Artwork';

export function HubDetails() {
  const isImaginationMode = useGameStore((s) => s.isImaginationMode);
  const schedule = useGameStore((s) => s.schedule);
  const storageOrganizer = useGameStore((s) => s.progression.hubUpgrades.includes('storage-organizer'));

  return (
    <group>
      <WindowRow imaginationMode={isImaginationMode} />
      <Cubbies imaginationMode={isImaginationMode} />
      <ReadingNook />
      <ArtGallery imaginationMode={isImaginationMode} />
      <RoomFinishing imaginationMode={isImaginationMode} />
      <PlaygroundDetails />
      <CeilingMobile imaginationMode={isImaginationMode} />
      <ScheduleBeacon schedule={schedule} imaginationMode={isImaginationMode} />
      <SuppliedArtwork fileName="02_wall_mural_welcome.png" position={[0, 1.72, 7.66]} size={[4.25, 3.15]} rotation={[0, Math.PI, 0]} />
      <SuppliedArtwork fileName="03_wall_decals_set.png" position={[-7.66, 1.6, 4.5]} size={[2.15, 1.6]} rotation={[0, Math.PI / 2, 0]} />
      <SuppliedArtwork fileName="06_posters_charts.png" position={[-12, 1.72, -15.66]} size={[2.5, 1.88]} />
      <SuppliedArtwork fileName="07_classroom_signs.png" position={[-7.66, 1.6, -4.5]} size={[2.15, 1.6]} rotation={[0, Math.PI / 2, 0]} />
      <SuppliedArtwork fileName="08_floor_decals.png" position={[3.8, 0.035, 4.9]} size={[2.4, 1.8]} rotation={[-Math.PI / 2, 0, 0]} />
      <SuppliedArtwork fileName="17_motivational_banner.png" position={[-15.66, 1.65, 0]} size={[2.55, 1.9]} rotation={[0, Math.PI / 2, 0]} />
      <SuppliedArtwork fileName="18_door_sign.png" position={[-14.1, 1.7, -7.66]} size={[1.75, 1.3]} />
      <SuppliedArtwork fileName="04_classroom_scene.png" position={[4.6, 1.72, 7.65]} size={[2.55, 1.9]} rotation={[0, Math.PI, 0]} />
      <SuppliedArtwork fileName="05_playground_equipment.png" position={[15.66, 1.65, -4.2]} size={[2.55, 1.9]} rotation={[0, -Math.PI / 2, 0]} />
      <SuppliedArtwork fileName="09_cubby_labels.png" position={[-5.7, 1.18, -7.04]} size={[2.95, 0.72]} rotation={[0, Math.PI, 0]} />
      <SuppliedArtwork fileName="10_props_toys.png" position={[-12, 1.04, -12]} size={[2.25, 1.55]} rotation={[-Math.PI / 2, 0, 0]} />
      <SuppliedArtwork fileName="14_environment_props.png" position={[-15.66, 1.65, 4.4]} size={[2.35, 1.75]} rotation={[0, Math.PI / 2, 0]} />
      <SuppliedArtwork fileName="15_wayfinding_floor_markers.png" position={[6.55, 0.035, -0.2]} size={[1.9, 1.35]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} />
      <SuppliedArtwork fileName="16_material_textures.png" position={[-12, 0.036, -5.5]} size={[2.1, 1.55]} rotation={[-Math.PI / 2, 0, 0]} />
      <SuppliedArtwork fileName="19_attendance_chart.png" position={[-15.66, 1.7, -4.5]} size={[2.3, 1.72]} rotation={[0, Math.PI / 2, 0]} />
      {storageOrganizer && <LostAndFoundOrganizer />}
    </group>
  );
}

function RoomFinishing({ imaginationMode }: { imaginationMode: boolean }) {
  const accent = imaginationMode ? '#52e7ff' : '#4c82d4';
  const warm = imaginationMode ? '#ff4da6' : '#e8613c';
  const sunny = imaginationMode ? '#ffd166' : '#e6ae2f';
  return (
    <group>
      {/* Classroom: low-cost wall dots and a soft story-time mat. */}
      <mesh position={[-3.8, 0.025, 5.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.15, 20]} />
        <meshStandardMaterial color="#78b9b2" roughness={0.92} />
      </mesh>
      {[-4.8, -3.8, -2.8].map((x, index) => (
        <mesh key={x} position={[x, 1.9, 7.71]}>
          <circleGeometry args={[0.28 + index * 0.04, 12]} />
          <meshStandardMaterial color={[warm, sunny, accent][index]} roughness={0.8} />
        </mesh>
      ))}

      {/* Hallway: a runner, name tiles, and cheerful pennants. */}
      <mesh position={[-12, 0.025, 0]}>
        <boxGeometry args={[2.35, 0.04, 10.8]} />
        <meshStandardMaterial color={imaginationMode ? '#5935a5' : '#d77b6d'} roughness={0.94} />
      </mesh>
      {[-5, -3, -1, 1, 3, 5].map((z, index) => (
        <group key={z}>
          <mesh position={[-15.69, 1.55, z]} rotation={[0, Math.PI / 2, 0]}>
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
      <mesh position={[-12, 0.025, -14.65]}>
        <boxGeometry args={[5.2, 0.04, 1.1]} />
        <meshStandardMaterial color={imaginationMode ? '#3d5bd6' : '#a8dce4'} roughness={0.92} />
      </mesh>
      {[-0.55, 0, 0.55].map((x, index) => (
        <group key={x} position={[-12 + x, 1.12, -12]}>
          <mesh>
            <cylinderGeometry args={[0.11, 0.1, 0.22, 8]} />
            <meshStandardMaterial color={[warm, sunny, accent][index]} roughness={0.76} />
          </mesh>
          <mesh position={[0, 0.2, 0]} rotation={[0, 0, 0.14 - index * 0.12]}>
            <cylinderGeometry args={[0.014, 0.014, 0.3, 5]} />
            <meshBasicMaterial color="#7a5134" />
          </mesh>
        </group>
      ))}

      {/* Storage: box labels and grounded foam shapes without extra shadows. */}
      {[
        [-14, 1.02, 9.48, warm],
        [-11, 1.02, 13.24, accent],
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
        <mesh key={index} position={[9.05 + (index % 2) * 0.34, 0.04, -7.8 + index * 0.58]}>
          <boxGeometry args={[0.58, 0.035, 0.5]} />
          <meshStandardMaterial color={[sunny, accent, warm][index % 3]} roughness={0.9} />
        </mesh>
      ))}
      {[-13.5, -12.4, -11.3].map((z, index) => (
        <group key={z} position={[15.2, 0, z]}>
          <mesh position={[0, 0.34, 0]}><cylinderGeometry args={[0.025, 0.025, 0.65, 5]} /><meshBasicMaterial color="#4d9a73" /></mesh>
          <mesh position={[0, 0.68, 0]}><sphereGeometry args={[0.16, 8, 6]} /><meshStandardMaterial color={[warm, sunny, accent][index]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function WindowRow({ imaginationMode }: { imaginationMode: boolean }) {
  const glass = imaginationMode ? '#3d5bd6' : '#a8dce4';
  const frame = imaginationMode ? '#ff4da6' : '#fff8e8';

  return (
    <group position={[0, 2.6, -7.72]}>
      {[-4.4, -1.5, 1.5, 4.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[2.1, 1.45, 0.08]} />
            <meshStandardMaterial color={frame} roughness={0.68} />
          </mesh>
          <mesh position={[0, 0, -0.055]}>
            <boxGeometry args={[1.72, 1.08, 0.02]} />
            <meshStandardMaterial color={glass} roughness={0.32} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0, -0.08]}>
            <boxGeometry args={[0.06, 1.08, 0.025]} />
            <meshStandardMaterial color={frame} roughness={0.68} />
          </mesh>
          <mesh position={[0, 0, -0.08]}>
            <boxGeometry args={[1.72, 0.06, 0.025]} />
            <meshStandardMaterial color={frame} roughness={0.68} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Cubbies({ imaginationMode }: { imaginationMode: boolean }) {
  const colors = imaginationMode
    ? ['#ff4da6', '#52e7ff', '#ffd166', '#9d7cff']
    : ['#ef9f4d', '#4c82d4', '#e8613c', '#55b89b'];

  return (
    <group position={[-5.7, 0, -6.7]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[3.8, 1.3, 0.62]} />
        <meshStandardMaterial color="#e4c39a" roughness={0.82} />
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
        <meshStandardMaterial color="#d76f78" roughness={0.85} />
      </mesh>
      <mesh position={[-0.62, 0.18, 0.22]} scale={[0.45, 0.18, 0.4]} castShadow>
        <sphereGeometry args={[0.55, 12, 8]} />
        <meshStandardMaterial color="#f2b85b" roughness={0.85} />
      </mesh>
      <mesh position={[0.62, 0.18, 0.22]} scale={[0.45, 0.18, 0.4]} castShadow>
        <sphereGeometry args={[0.55, 12, 8]} />
        <meshStandardMaterial color="#78b9b2" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.78, -0.1]} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.75]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.78} />
      </mesh>
      {[0, 0.22, 0.44].map((x, index) => (
        <mesh key={x} position={[-0.48 + x, 0.9, -0.1]} rotation={[0, 0, index % 2 ? -0.1 : 0.08]} castShadow>
          <boxGeometry args={[0.16, 0.36, 0.42]} />
          <meshStandardMaterial color={['#e8613c', '#4c82d4', '#e6ae2f'][index]} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function ArtGallery({ imaginationMode }: { imaginationMode: boolean }) {
  const frames = imaginationMode
    ? ['#ff4da6', '#52e7ff', '#ffd166']
    : ['#e8613c', '#4c82d4', '#e6ae2f'];

  return (
    <group position={[-7.64, 1.65, 0]} rotation={[0, Math.PI / 2, 0]}>
      {frames.map((color, index) => (
        <group key={color} position={[-4 + index * 4, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[1.15, 1.5, 0.12]} />
            <meshStandardMaterial color="#e7c79b" roughness={0.75} />
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
            <meshStandardMaterial color={['#e6ae2f', '#55b89b', '#e8613c'][index]} roughness={0.86} />
          </mesh>
        ))}
      </group>
      <group position={[14.7, 0, 8.8]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.28, 2.2, 10]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.86} />
        </mesh>
        <mesh position={[0, 2.35, 0]} scale={[1, 0.8, 1]} castShadow>
          <sphereGeometry args={[0.75, 12, 10]} />
          <meshStandardMaterial color="#55a66e" roughness={0.9} />
        </mesh>
      </group>
      <mesh position={[9.4, 0.36, -10.8]} castShadow>
        <boxGeometry args={[1.8, 0.72, 0.42]} />
        <meshStandardMaterial color="#e4c39a" roughness={0.82} />
      </mesh>
      <mesh position={[9.4, 0.83, -10.8]} castShadow>
        <boxGeometry args={[1.35, 0.08, 0.6]} />
        <meshStandardMaterial color="#4c82d4" roughness={0.72} />
      </mesh>
    </group>
  );
}

function CeilingMobile({ imaginationMode }: { imaginationMode: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const colors = imaginationMode ? ['#ff4da6', '#52e7ff', '#ffd166'] : ['#e8613c', '#4c82d4', '#e6ae2f'];

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.12;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.7) * 0.04;
  });

  return (
    <group ref={ref} position={[0, 3.25, -1]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.1, 12]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.78} />
      </mesh>
      {colors.map((color, index) => {
        const angle = (index / colors.length) * Math.PI * 2;
        return (
          <group key={color} position={[Math.cos(angle) * 0.85, -0.28, Math.sin(angle) * 0.85]}>
            <mesh position={[0, 0.14, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.28, 6]} />
              <meshBasicMaterial color="#c8a97b" />
            </mesh>
            <mesh castShadow>
              <sphereGeometry args={[0.19, 10, 8]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          </group>
        );
      })}
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
  const colors: Record<string, string> = {
    'morning-play': '#f2b85b',
    'art-time': '#e8613c',
    'juice-club': '#55b89b',
    'outdoor-play': '#4c82d4',
    pickup: '#d76f78',
  };
  const color = imaginationMode ? '#ff4da6' : colors[schedule] ?? '#f2b85b';

  useFrame((state) => {
    if (indicatorRef.current) indicatorRef.current.position.y = Math.sin(state.clock.elapsedTime * 2.4) * 0.04;
  });

  return (
    <group position={[6.7, 0, -6.8]}>
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.45, 6]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
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
    <group position={[-10.5, 0, 10.2]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[2.2, 1.1, 0.65]} />
        <meshStandardMaterial color="#55b89b" roughness={0.75} />
      </mesh>
      {[-0.7, 0, 0.7].map((x, index) => (
        <mesh key={x} position={[x, 0.62, -0.36]} castShadow>
          <boxGeometry args={[0.48, 0.58, 0.08]} />
          <meshStandardMaterial color={['#4c82d4', '#e8613c', '#e6ae2f'][index]} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[1.8, 0.34, 0.1]} />
        <meshStandardMaterial color="#fff0b8" roughness={0.7} />
      </mesh>
    </group>
  );
}