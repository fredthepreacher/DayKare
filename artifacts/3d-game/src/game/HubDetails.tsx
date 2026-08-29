import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';

export function HubDetails() {
  const isImaginationMode = useGameStore((s) => s.isImaginationMode);
  const schedule = useGameStore((s) => s.schedule);

  return (
    <group>
      <WindowRow imaginationMode={isImaginationMode} />
      <Cubbies imaginationMode={isImaginationMode} />
      <ReadingNook />
      <ArtGallery imaginationMode={isImaginationMode} />
      <PlaygroundDetails />
      <CeilingMobile imaginationMode={isImaginationMode} />
      <ScheduleBeacon schedule={schedule} imaginationMode={isImaginationMode} />
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
    <group position={[-7.72, 1.65, 0]} rotation={[0, Math.PI / 2, 0]}>
      {frames.map((color, index) => (
        <group key={color} position={[0, 0, -4 + index * 4]}>
          <mesh castShadow>
            <boxGeometry args={[1.15, 1.5, 0.12]} />
            <meshStandardMaterial color="#e7c79b" roughness={0.75} />
          </mesh>
          <mesh position={[0.02, 0, -0.08]} rotation={[0, 0, index === 1 ? 0.12 : -0.08]}>
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
      <group position={[10, 0.08, 7.2]}>
        {[-1.2, 0, 1.2].map((x, index) => (
          <mesh key={x} position={[x, 0, Math.sin(index) * 0.3]} rotation={[-Math.PI / 2, 0, index * 0.25]} receiveShadow>
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
  const ref = useRef<THREE.Group>(null);
  const colors: Record<string, string> = {
    'morning-play': '#f2b85b',
    'art-time': '#e8613c',
    'juice-club': '#55b89b',
    'outdoor-play': '#4c82d4',
    pickup: '#d76f78',
  };
  const color = imaginationMode ? '#ff4da6' : colors[schedule] ?? '#f2b85b';

  useFrame((state) => {
    if (ref.current) ref.current.position.y = Math.sin(state.clock.elapsedTime * 2.4) * 0.04;
  });

  return (
    <group ref={ref} position={[6.7, 0.05, -6.8]}>
      <mesh position={[0, 0.82, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 1.45, 6]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
      </mesh>
      <mesh position={[0.28, 1.27, 0]} rotation={[0, 0, -0.12]} castShadow>
        <boxGeometry args={[0.58, 0.32, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.025, 6, 18]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}