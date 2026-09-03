import { Text } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { registerInteractionCandidate, updateInteractionCandidate } from './interactionFocus';
import { useGameStore } from './store';

export const CAFETERIA_SEATS = [
  { id: 'cafeteria-seat-0', position: [-14.5, 0, 10] },
  { id: 'cafeteria-seat-1', position: [-13.35, 0, 9.05] },
  { id: 'cafeteria-seat-2', position: [-13.35, 0, 10.95] },
  { id: 'cafeteria-seat-3', position: [-9.5, 0, 10] },
  { id: 'cafeteria-seat-4', position: [-10.65, 0, 9.05] },
  { id: 'cafeteria-seat-5', position: [-10.65, 0, 10.95] },
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
    <mesh position={[0, .52, 0]} castShadow><cylinderGeometry args={[.78, .78, .14, 20]} /><meshStandardMaterial color="#f5c765" /></mesh>
    {[0, 1, 2].map((index) => <mesh key={index} position={[Math.cos(index * Math.PI * 2 / 3) * .46, .64, Math.sin(index * Math.PI * 2 / 3) * .46]}><boxGeometry args={[.24, .05, .18]} /><meshStandardMaterial color={index % 2 ? '#75c9b7' : '#ef7d67'} /></mesh>)}
    <mesh position={[0, .25, 0]}><cylinderGeometry args={[.18, .28, .5, 14]} /><meshStandardMaterial color="#9d6b53" /></mesh>
  </group>;
}

function FoodTray({ position, color }: { position: [number, number, number]; color: string }) {
  return <group position={position}>
    <mesh><boxGeometry args={[.54, .035, .34]} /><meshStandardMaterial color="#f1e4c2" /></mesh>
    <mesh position={[-.13, .06, 0]}><sphereGeometry args={[.09, 10, 7]} /><meshStandardMaterial color={color} /></mesh>
    <mesh position={[.13, .055, 0]}><cylinderGeometry args={[.07, .07, .11, 10]} /><meshStandardMaterial color="#f7be4c" /></mesh>
  </group>;
}

export function DaycareRoutineWorld() {
  const schedule = useGameStore((state) => state.schedule);
  const seated = useGameStore((state) => state.seatedSeatId);
  const napping = useGameStore((state) => state.isNapping);
  const mealOpen = schedule === 'breakfast' || schedule === 'lunch';
  return <group>
    <group>
      <mesh position={[-12, .015, 10.55]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[7.1, 4.35]} /><meshStandardMaterial color="#f7e2a1" /></mesh>
      <KidTable position={[-13.35, 0, 10]} /><KidTable position={[-10.65, 0, 10]} />
      <FoodTray position={[-13.35, .69, 10]} color="#ef7d67" />
      <FoodTray position={[-10.65, .69, 10]} color="#78b968" />
      <mesh position={[-12, .58, 12.18]} castShadow><boxGeometry args={[5.55, 1.16, .72]} /><meshStandardMaterial color="#8bc6a8" /></mesh>
      <mesh position={[-12, 1.19, 12.18]} castShadow><boxGeometry args={[5.8, .1, .82]} /><meshStandardMaterial color="#6aa887" /></mesh>
      {[-13.8, -13.15, -12.5, -11.85, -11.2].map((x, index) => <mesh key={x} position={[x, 1.32, 12.1]}><cylinderGeometry args={[.12, .14, .26, 10]} /><meshStandardMaterial color={['#f08a6b', '#f4c65c', '#70b6cd'][index % 3]} /></mesh>)}
      <Text position={[-12, 2.15, 13.01]} rotation={[0, Math.PI, 0]} fontSize={.3} color="#55351f" anchorX="center">DAYKARE CAFETERIA</Text>
      <Text position={[-12, 1.76, 13.005]} rotation={[0, Math.PI, 0]} fontSize={.14} color="#55351f" anchorX="center">TINY TRAYS · BIG APPETITES</Text>
      {CAFETERIA_SEATS.map((seat, index) => <group key={seat.id} position={seat.position}>
        <mesh position={[0, .25, 0]} castShadow><boxGeometry args={[.58, .5, .58]} /><meshStandardMaterial color={index % 2 ? '#79b8dc' : '#ef8f73'} /></mesh>
        <mesh position={[0, .57, index < 3 ? -.23 : .23]} castShadow><boxGeometry args={[.58, .48, .12]} /><meshStandardMaterial color={index % 2 ? '#619fca' : '#d77461'} /></mesh>
        <Candidate id={seat.id} position={seat.position} valid={mealOpen && !seated && !napping} />
      </group>)}
      <mesh position={[-15.05, .38, 12.05]}><boxGeometry args={[.65, .76, .65]} /><meshStandardMaterial color="#5e9d72" /></mesh>
      <Text position={[-15.05, .9, 12.05]} rotation={[0, Math.PI / 2, 0]} fontSize={.12} color="#31543b" anchorX="center">RECYCLE</Text>
      <mesh position={[-12, 1.25, 13.18]}><boxGeometry args={[1.8, 2.35, .18]} /><meshStandardMaterial color="#70a695" /></mesh>
      <Text position={[-12, 1.55, 13.075]} rotation={[0, Math.PI, 0]} maxWidth={1.45} textAlign="center" fontSize={.15} color="#fff6da" anchorX="center">FUTURE CLASSROOM{`\n`}COMING LATER</Text>
    </group>
    {schedule === 'nap' && <group position={PLAYER_NAP_POSITION}>
      <mesh position={[0, .03, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[1.7, 1]} /><meshStandardMaterial color="#91c9d8" /></mesh>
      <mesh position={[-.62, .12, 0]} scale={[.45, .16, .38]}><sphereGeometry args={[.42, 12, 8]} /><meshStandardMaterial color="#fff3cf" /></mesh>
      <Text position={[0, .12, .72]} fontSize={.14} color="#35556a" anchorX="center">PLAYER NAP MAT</Text>
      <Candidate id="player-nap-mat" position={PLAYER_NAP_POSITION} valid={!napping && !seated} />
    </group>}
  </group>;
}
