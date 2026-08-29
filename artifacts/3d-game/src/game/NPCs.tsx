import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';

export function NPCs({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      <Teacher name="Ms. Harper" color="#457b9d" defaultPos={[-2, 0, -2]} playerRef={playerRef} />
      <Teacher name="Mr. Davis" color="#1d3557" defaultPos={[10, 0, 0]} playerRef={playerRef} />
      
      <Kid name="Leo" color="#e63946" defaultPos={[2, 0, 3]} playerRef={playerRef} />
      <Kid name="Mia" color="#a8dadc" defaultPos={[-3, 0, 4]} playerRef={playerRef} />
      <Kid name="Sam" color="#2a9d8f" defaultPos={[-12, 0, -10]} playerRef={playerRef} />
      <Kid name="Zoe" color="#e9c46a" defaultPos={[12, 0, -2]} playerRef={playerRef} />
      <Kid name="Eli" color="#f4a261" defaultPos={[13, 0, 4]} playerRef={playerRef} />
      
      <Kid name="Noah" color="#8338ec" defaultPos={[5, 0, -5]} playerRef={playerRef} />
      <Kid name="Lily" color="#ff006e" defaultPos={[-6, 0, -6]} playerRef={playerRef} />
      <Kid name="Finn" color="#3a86ff" defaultPos={[0, 0, 6]} playerRef={playerRef} />
      <Kid name="Ruby" color="#fb5607" defaultPos={[-4, 0, 0]} playerRef={playerRef} />
      <Kid name="Max" color="#ffbe0b" defaultPos={[4, 0, 2]} playerRef={playerRef} />
    </group>
  );
}

function Teacher({ name, color, defaultPos, playerRef }: { name: string, color: string, defaultPos: [number, number, number], playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const schedule = useGameStore(s => s.schedule);
  const isRainy = useGameStore(s => s.isRainy);
  const setTeacherSuspicion = useGameStore(s => s.setTeacherSuspicion);
  const teacherSuspicion = useGameStore(s => s.teacherSuspicion);
  
  const triggerTeleport = useGameStore(s => s.triggerTeleport);
  const setActiveDialogue = useGameStore(s => s.setActiveDialogue);
  
  const targetPos = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  
  useFrame((state, delta) => {
    if (!ref.current || !playerRef.current) return;
    
    // Adjust target based on schedule
    if (schedule === 'outdoor-play' && !isRainy) {
      if (name === 'Ms. Harper') targetPos.set(10, 0, -2);
    } else if (schedule === 'art-time') {
      if (name === 'Ms. Harper') targetPos.set(-10, 0, -12);
    } else {
      targetPos.set(...defaultPos);
    }

    // Move towards target smoothly
    ref.current.position.lerp(targetPos, delta * 2);

    // Suspicion mechanic (only Ms. Harper checks for simplicity)
    if (name === 'Ms. Harper') {
      const px = playerRef.current.position.x;
      const pz = playerRef.current.position.z;
      // In Storage Area
      if (px < -8 && pz > 8) {
        setTeacherSuspicion(s => {
          const next = s + delta * 20;
          if (next >= 100) {
            triggerTeleport();
            setActiveDialogue({
              name: 'Ms. Harper',
              text: 'Storage is off limits during playtime! Back to the main room.'
            });
            return 0; // Reset suspicion
          }
          return Math.min(100, next);
        });
      } else {
        setTeacherSuspicion(s => Math.max(0, s - delta * 10));
      }
      
      // If suspicious, look at player
      if (teacherSuspicion > 0) {
        ref.current.lookAt(playerRef.current.position);
      }
    }
  });

  return (
    <group ref={ref} position={defaultPos}>
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[0.9, 2, 0.9]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 2.8, 0]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial color="#fcd5ce" />
      </mesh>
    </group>
  );
}

function Kid({ name, color, defaultPos, playerRef }: { name: string, color: string, defaultPos: [number, number, number], playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const schedule = useGameStore(s => s.schedule);
  const isRainy = useGameStore(s => s.isRainy);
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  
  const setActiveInteractable = useGameStore(s => s.setActiveInteractable);
  const activeInteractable = useGameStore(s => s.activeInteractable);
  
  const [canInteract, setCanInteract] = useState(false);

  const basePos = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const targetPos = useRef(new THREE.Vector3(...defaultPos));
  const timeOffset = useMemo(() => Math.random() * 100, []);

  useFrame((state, delta) => {
    if (!ref.current || !playerRef.current) return;
    
    // Determine area based on schedule and weather
    if (schedule === 'outdoor-play' && !isRainy) {
      basePos.set(12 + Math.cos(timeOffset) * 3, 0, Math.sin(timeOffset) * 10);
    } else if (schedule === 'outdoor-play' && isRainy) {
      basePos.set(Math.cos(timeOffset) * 4, 0, Math.sin(timeOffset) * 4); // Stay inside
    } else if (schedule === 'art-time') {
      basePos.set(-12 + Math.cos(timeOffset) * 2, 0, -12 + Math.sin(timeOffset) * 2);
    } else if (schedule === 'juice-club') {
      basePos.set(Math.cos(timeOffset) * 4, 0, Math.sin(timeOffset) * 4);
    } else {
      basePos.set(defaultPos[0], defaultPos[1], defaultPos[2]);
    }

    // Add some random wandering
    targetPos.current.x = basePos.x + Math.sin(state.clock.elapsedTime + timeOffset) * 1.5;
    targetPos.current.z = basePos.z + Math.cos((state.clock.elapsedTime + timeOffset) * 0.8) * 1.5;

    // Interaction Check
    const dist = ref.current.position.distanceTo(playerRef.current.position);
    const inRange = dist < 2.0;
    
    if (inRange !== canInteract) {
      setCanInteract(inRange);
      if (inRange) setActiveInteractable(`kid-${name}`);
      else if (activeInteractable === `kid-${name}`) setActiveInteractable(null);
    }

    // Move if not talking
    if (activeInteractable !== `kid-${name}`) {
      ref.current.position.lerp(targetPos.current, delta * 1.5);
      if (targetPos.current.distanceTo(ref.current.position) > 0.1) {
        ref.current.lookAt(targetPos.current.x, ref.current.position.y, targetPos.current.z);
      }
    } else {
      // Look at player when talking
      ref.current.lookAt(playerRef.current.position.x, ref.current.position.y, playerRef.current.position.z);
    }
  });

  const activeColor = isImaginationMode ? "#ff006e" : color;

  return (
    <group ref={ref} position={defaultPos}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.7, 1, 0.7]} />
        <meshStandardMaterial color={activeColor} />
      </mesh>
      <mesh position={[0, 1.25, 0]} castShadow>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial color="#fcd5ce" />
      </mesh>
    </group>
  );
}
