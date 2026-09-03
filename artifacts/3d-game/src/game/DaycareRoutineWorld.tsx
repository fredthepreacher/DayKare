import { Text } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { useGameStore } from './store';

export const CAFETERIA_SEATS = [
  { id: 'cafeteria-seat-0', position: [9.4, 0, 3.5] },
  { id: 'cafeteria-seat-1', position: [11.2, 0, 3.5] },
  { id: 'cafeteria-seat-2', position: [13, 0, 3.5] },
  { id: 'cafeteria-seat-3', position: [9.4, 0, 6.2] },
  { id: 'cafeteria-seat-4', position: [11.2, 0, 6.2] },
  { id: 'cafeteria-seat-5', position: [13, 0, 6.2] },
] as const;
export const PLAYER_NAP_POSITION: [number, number, number] = [5.2, 0, 6.1];

export function seatPositionForId(id: string): [number, number, number] | null {
  const seat = CAFETERIA_SEATS.find((candidate) => candidate.id === id);
  return seat ? [...seat.position] : null;
}

function Candidate({ id, position, valid }: { id: string; position: readonly [number, number, number]; valid: boolean }) {
  const vector = useMemo(() => new THREE.Vector3(...position), [position]);
  useEffect(() => registerInteractionCandidate({ id, position: vector, valid, priority: 92, range: 2.1, questPriority: true }), [id, valid, vector]);
  useFrame(() => updateInteractionCandidate(id, { position: vector, valid, priority: 92, range: 2.1 }));
  return null;
}

function KidTable({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position={[0, .52, 0]} castShadow><cylinderGeometry args={[1.05, 1.05, .14, 20]} /><meshStandardMaterial color="#f5c765" /></mesh>
    {[0, 1, 2, 3].map((index) => <mesh key={index} position={[Math.cos(index * Math.PI / 2) * .62, .68, Math.sin(index * Math.PI / 2) * .62]}><boxGeometry args={[.3, .05, .22]} /><meshStandardMaterial color={index % 2 ? '#75c9b7' : '#ef7d67'} /></mesh>)}
    <mesh position={[0, .25, 0]}><cylinderGeometry args={[.18, .28, .5, 14]} /><meshStandardMaterial color="#9d6b53" /></mesh>
  </group>;
}

export function DaycareRoutineWorld() {
  const schedule = useGameStore((state) => state.schedule);
  const seated = useGameStore((state) => state.seatedSeatId);
  const napping = useGameStore((state) => state.isNapping);
  const mealOpen = schedule === 'breakfast' || schedule === 'lunch';
  return <group>
    <group>
      <mesh position={[11.3, .015, 4.8]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6.4, 5.8]} /><meshStandardMaterial color="#f7e2a1" /></mesh>
      <KidTable position={[10.2, 0, 4.8]} /><KidTable position={[12.5, 0, 4.8]} />
      <mesh position={[14.55, .62, 4.8]} castShadow><boxGeometry args={[.7, 1.24, 4.8]} /><meshStandardMaterial color="#8bc6a8" /></mesh>
      <Text position={[14.15, 1.45, 4.8]} rotation={[0, -Math.PI / 2, 0]} fontSize={.28} color="#55351f" anchorX="center">DAYKARE CAFETERIA</Text>
      <Text position={[14.14, 1.08, 4.8]} rotation={[0, -Math.PI / 2, 0]} fontSize={.13} color="#55351f" anchorX="center">JUICE · CRACKERS · FRUIT</Text>
      {CAFETERIA_SEATS.map((seat, index) => <group key={seat.id} position={seat.position}>
        <mesh position={[0, .26, 0]} castShadow><boxGeometry args={[.72, .52, .72]} /><meshStandardMaterial color={index % 2 ? '#79b8dc' : '#ef8f73'} /></mesh>
        <Candidate id={seat.id} position={seat.position} valid={mealOpen && !seated && !napping} />
      </group>)}
      <mesh position={[8.65, .38, 7.15]}><boxGeometry args={[.7, .76, .7]} /><meshStandardMaterial color="#5e9d72" /></mesh>
      <Text position={[8.65, .9, 7.15]} fontSize={.12} color="#31543b" anchorX="center">RECYCLE</Text>
    </group>
    {schedule === 'nap' && <group position={PLAYER_NAP_POSITION}>
      <mesh position={[0, .03, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.7, 1]} /><meshStandardMaterial color="#91c9d8" /></mesh>
      <mesh position={[-.62, .12, 0]} scale={[.45, .16, .38]}><sphereGeometry args={[.42, 12, 8]} /><meshStandardMaterial color="#fff3cf" /></mesh>
      <Text position={[0, .12, .72]} fontSize={.14} color="#35556a" anchorX="center">PLAYER NAP MAT</Text>
      <Candidate id="player-nap-mat" position={PLAYER_NAP_POSITION} valid={!napping && !seated} />
    </group>}
  </group>;
}
