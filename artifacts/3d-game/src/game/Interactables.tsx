import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import { useRef, useState } from 'react';
import * as THREE from 'three';

export function Interactables({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  
  return (
    <group>
      {/* Juice & Crackers Club Stand */}
      <JuiceStand playerRef={playerRef} />
      
      {/* Binky (The lost toy) */}
      <Binky playerRef={playerRef} />
      
      {/* Ride-on Tricycle */}
      <Tricycle playerRef={playerRef} />
      
      {/* A Toy block */}
      <ToyBlock playerRef={playerRef} position={[-3, 0.25, -2]} id="blue-block" color="#3a86ff" />
      <ToyBlock playerRef={playerRef} position={[2, 0.25, 4]} id="red-block" color="#ff006e" />
    </group>
  );
}

function JuiceStand({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const setActiveInteractable = useGameStore(s => s.setActiveInteractable);
  const activeInteractable = useGameStore(s => s.activeInteractable);
  
  const [canInteract, setCanInteract] = useState(false);

  useFrame(() => {
    if (!ref.current || !playerRef.current) return;
    const dist = ref.current.position.distanceTo(playerRef.current.position);
    const inRange = dist < 2.5;
    
    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable('juice-stand');
      else if (activeInteractable === 'juice-stand') setActiveInteractable(null);
    }
  });

  return (
    <group ref={ref} position={[3, 0, -3]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[2, 1.2, 1]} />
        <meshStandardMaterial color="#ffd166" />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[1.8, 0.5, 0.1]} />
        <meshStandardMaterial color="#8338ec" />
      </mesh>
      <mesh position={[-0.5, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
        <meshStandardMaterial color="#ff5400" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0.5, 1.25, 0]} castShadow>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#c2b280" />
      </mesh>
    </group>
  );
}

function Binky({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const binkyStatus = useGameStore(s => s.binkyStatus);
  const setActiveInteractable = useGameStore(s => s.setActiveInteractable);
  const activeInteractable = useGameStore(s => s.activeInteractable);
  const [canInteract, setCanInteract] = useState(false);

  // Hidden in storage area
  const pos = new THREE.Vector3(-14, 0.2, 14);

  useFrame(() => {
    if (!ref.current || !playerRef.current) return;
    
    // Binky only appears if you're on the right mission step
    if (binkyStatus === 'not-started' || binkyStatus === 'talked-to-owner' || binkyStatus === 'found' || binkyStatus.startsWith('returned')) {
      if (canInteract) {
        setCanInteract(false);
        if (activeInteractable === 'binky') setActiveInteractable(null);
      }
      return;
    }

    const dist = pos.distanceTo(playerRef.current.position);
    const inRange = dist < 1.5;
    
    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable('binky');
      else if (activeInteractable === 'binky') setActiveInteractable(null);
    }
  });

  if (binkyStatus === 'not-started' || binkyStatus === 'talked-to-owner' || binkyStatus === 'found' || binkyStatus.startsWith('returned')) return null;

  return (
    <group ref={ref} position={pos}>
      <mesh castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ffc8dd" />
      </mesh>
      <mesh position={[0.2, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#ffc8dd" />
      </mesh>
      <mesh position={[-0.2, 0.1, 0]} castShadow>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#ffc8dd" />
      </mesh>
    </group>
  );
}

function Tricycle({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const setActiveInteractable = useGameStore(s => s.setActiveInteractable);
  const activeInteractable = useGameStore(s => s.activeInteractable);
  const colorIndex = useGameStore(s => s.tricycleColorIndex);
  const isRiding = useGameStore(s => s.isRiding);
  const [canInteract, setCanInteract] = useState(false);
  
  const colors = ["#d62828", "#3a86ff", "#ff006e", "#06d6a0"];

  useFrame(() => {
    if (isRiding) {
      if (canInteract) {
        setCanInteract(false);
        if (activeInteractable === 'tricycle' || activeInteractable === 'tricycle-ride') setActiveInteractable(null);
      }
      return;
    }

    if (!ref.current || !playerRef.current) return;
    const dist = ref.current.position.distanceTo(playerRef.current.position);
    const inRange = dist < 2.0;
    
    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable('tricycle');
      else if (activeInteractable === 'tricycle' || activeInteractable === 'tricycle-ride') setActiveInteractable(null);
    }
  });

  if (isRiding) return null; // Player renders it when riding

  return (
    <group ref={ref} position={[12, 0.4, 2]} rotation={[0, Math.PI / 4, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.2, 0.2, 0.4]} />
        <meshStandardMaterial color={colors[colorIndex]} />
      </mesh>

      <mesh position={[0.5, -0.2, 0]} rotation={[Math.PI/2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <mesh position={[-0.5, -0.2, 0.3]} rotation={[Math.PI/2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <mesh position={[-0.5, -0.2, -0.3]} rotation={[Math.PI/2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
        <meshStandardMaterial color="#000" />
      </mesh>
      <mesh position={[0.5, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.6]} />
        <meshStandardMaterial color="#c0c0c0" />
      </mesh>
      <mesh position={[0.5, 0.8, 0]} rotation={[Math.PI/2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.8]} />
        <meshStandardMaterial color="#000" />
      </mesh>
    </group>
  );
}

function ToyBlock({ playerRef, position, id, color }: { playerRef: React.RefObject<THREE.Group | null>, position: [number, number, number], id: string, color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const inventory = useGameStore(s => s.inventory);
  const setActiveInteractable = useGameStore(s => s.setActiveInteractable);
  const activeInteractable = useGameStore(s => s.activeInteractable);
  const [canInteract, setCanInteract] = useState(false);

  const isPickedUp = inventory.includes(id);

  useFrame(() => {
    if (!ref.current || !playerRef.current || isPickedUp) return;
    const dist = ref.current.position.distanceTo(playerRef.current.position);
    const inRange = dist < 1.5;
    
    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable(id);
      else if (activeInteractable === id) setActiveInteractable(null);
    }
  });

  if (isPickedUp) return null;

  return (
    <mesh ref={ref} position={position} castShadow>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}