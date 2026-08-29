import { useFrame } from '@react-three/fiber';
import { useGameStore } from './store';
import { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { CharacterModel, type CharacterModelProps } from './CharacterModel';

type KidDefinition = {
  name: string;
  color: string;
  accent: string;
  hairColor: string;
  hairStyle: NonNullable<CharacterModelProps['hairStyle']>;
  skinColor: string;
  defaultPos: [number, number, number];
};

const KID_CAST: KidDefinition[] = [
  { name: 'Leo', color: '#e65a4f', accent: '#ffd166', hairColor: '#5b352c', hairStyle: 'sprout', skinColor: '#efb58f', defaultPos: [2, 0, 3] },
  { name: 'Mia', color: '#54b9bd', accent: '#f1d985', hairColor: '#3f2927', hairStyle: 'ponytail', skinColor: '#c98562', defaultPos: [-3, 0, 4] },
  { name: 'Sam', color: '#2a9d8f', accent: '#ecb56b', hairColor: '#2f231f', hairStyle: 'curls', skinColor: '#8f5139', defaultPos: [-12, 0, -10] },
  { name: 'Zoe', color: '#e9aa45', accent: '#e76f8c', hairColor: '#8d5d2f', hairStyle: 'bob', skinColor: '#f2c4a0', defaultPos: [12, 0, -2] },
  { name: 'Eli', color: '#f08a5d', accent: '#6a8caf', hairColor: '#d0a16d', hairStyle: 'cap', skinColor: '#f2c8a8', defaultPos: [13, 0, 4] },
  { name: 'Noah', color: '#7654bd', accent: '#71d4b4', hairColor: '#4d2c25', hairStyle: 'curls', skinColor: '#b66f50', defaultPos: [5, 0, -5] },
  { name: 'Lily', color: '#db568a', accent: '#8fd0c5', hairColor: '#202334', hairStyle: 'ponytail', skinColor: '#e4aa7f', defaultPos: [-6, 0, -6] },
  { name: 'Finn', color: '#4c82d4', accent: '#f3ca52', hairColor: '#bd7448', hairStyle: 'sprout', skinColor: '#f1bf98', defaultPos: [0, 0, 6] },
  { name: 'Ruby', color: '#e8613c', accent: '#8bc5db', hairColor: '#7a2d2d', hairStyle: 'bob', skinColor: '#d5916b', defaultPos: [-4, 0, 0] },
  { name: 'Max', color: '#e6ae2f', accent: '#4b7f8c', hairColor: '#4b382c', hairStyle: 'cap', skinColor: '#d79b78', defaultPos: [4, 0, 2] },
];

function namePhase(name: string) {
  return [...name].reduce((total, character) => total + character.charCodeAt(0), 0) * 0.37;
}

export function NPCs({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  return (
    <group>
      <Teacher
        name="Ms. Harper"
        color="#457b9d"
        accent="#e4bd6a"
        hairColor="#46352f"
        hairStyle="bob"
        skinColor="#c98562"
        defaultPos={[-2, 0, -2]}
        playerRef={playerRef}
      />
      <Teacher
        name="Mr. Davis"
        color="#355272"
        accent="#68a9a7"
        hairColor="#6a4a3c"
        hairStyle="curls"
        skinColor="#e6ad88"
        defaultPos={[10, 0, 0]}
        playerRef={playerRef}
      />
      {KID_CAST.map((kid) => (
        <Kid key={kid.name} {...kid} playerRef={playerRef} />
      ))}
    </group>
  );
}

function Teacher({
  name,
  color,
  accent,
  hairColor,
  hairStyle,
  skinColor,
  defaultPos,
  playerRef,
}: {
  name: string;
  color: string;
  accent: string;
  hairColor: string;
  hairStyle: NonNullable<CharacterModelProps['hairStyle']>;
  skinColor: string;
  defaultPos: [number, number, number];
  playerRef: React.RefObject<THREE.Group | null>;
}) {
  const ref = useRef<THREE.Group>(null);
  const schedule = useGameStore(s => s.schedule);
  const isRainy = useGameStore(s => s.isRainy);
  const setTeacherSuspicion = useGameStore(s => s.setTeacherSuspicion);
  const teacherSuspicion = useGameStore(s => s.teacherSuspicion);
  
  const triggerTeleport = useGameStore(s => s.triggerTeleport);
  const setActiveDialogue = useGameStore(s => s.setActiveDialogue);
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  const activeDialogue = useGameStore(s => s.activeDialogue);
  
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
      <group scale={1.28}>
        <CharacterModel
          bodyColor={color}
          accentColor={accent}
          hairColor={hairColor}
          hairStyle={hairStyle}
          skinColor={skinColor}
          mood="curious"
          isTeacher
          isTalking={activeDialogue?.name === name}
          imaginationMode={isImaginationMode}
          motionSeed={namePhase(name)}
          idleEnergy={0.55}
        />
      </group>
    </group>
  );
}

function Kid({
  name,
  color,
  accent,
  hairColor,
  hairStyle,
  skinColor,
  defaultPos,
  playerRef,
}: KidDefinition & { playerRef: React.RefObject<THREE.Group | null> }) {
  const ref = useRef<THREE.Group>(null);
  const schedule = useGameStore(s => s.schedule);
  const isRainy = useGameStore(s => s.isRainy);
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  
  const setActiveInteractable = useGameStore(s => s.setActiveInteractable);
  const activeInteractable = useGameStore(s => s.activeInteractable);
  const activeDialogue = useGameStore(s => s.activeDialogue);
  const mood = useGameStore(s => s.friends[name]?.mood ?? 'happy');
  
  const [canInteract, setCanInteract] = useState(false);

  const basePos = useMemo(() => new THREE.Vector3(...defaultPos), [defaultPos]);
  const targetPos = useRef(new THREE.Vector3(...defaultPos));
  const timeOffset = useMemo(() => namePhase(name), [name]);

  useFrame((state, delta) => {
    if (!ref.current || !playerRef.current) return;
    
    // Determine area based on schedule and weather
    if (schedule === 'outdoor-play' && !isRainy) {
      basePos.set(12 + Math.cos(timeOffset) * 3, 0, Math.sin(timeOffset) * 10);
    } else if (schedule === 'outdoor-play' && isRainy) {
      basePos.set(4.8 + Math.cos(timeOffset) * 1.5, 0, -5.4 + Math.sin(timeOffset) * 1.1);
    } else if (schedule === 'art-time') {
      basePos.set(-12 + Math.cos(timeOffset) * 2, 0, -12 + Math.sin(timeOffset) * 2);
    } else if (schedule === 'juice-club') {
      basePos.set(Math.cos(timeOffset) * 4, 0, Math.sin(timeOffset) * 4);
    } else if (schedule === 'pickup') {
      basePos.set(-5.8 + Math.cos(timeOffset) * 1.2, 0, Math.sin(timeOffset) * 5.5);
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

    const pauseForAmbientMoment = Math.sin(state.clock.elapsedTime * 0.48 + timeOffset) > 0.78;

    // Move in short, readable bursts, then pause for a look-around or reaction.
    if (activeInteractable !== `kid-${name}` && !pauseForAmbientMoment) {
      ref.current.position.lerp(targetPos.current, delta * 1.5);
      if (targetPos.current.distanceTo(ref.current.position) > 0.1) {
        ref.current.lookAt(targetPos.current.x, ref.current.position.y, targetPos.current.z);
      }
    } else if (activeInteractable === `kid-${name}`) {
      // Look at player when talking
      ref.current.lookAt(playerRef.current.position.x, ref.current.position.y, playerRef.current.position.z);
    } else {
      const targetYaw = Math.sin(state.clock.elapsedTime * 0.42 + timeOffset) * 0.35;
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetYaw, 1 - Math.exp(-2.4 * delta));
    }
  });

  const activeColor = isImaginationMode ? "#ff006e" : color;

  return (
    <group ref={ref} position={defaultPos}>
      <CharacterModel
        bodyColor={activeColor}
        accentColor={accent}
        hairColor={hairColor}
        hairStyle={hairStyle}
        skinColor={skinColor}
        mood={mood}
        isTalking={activeDialogue?.name === name}
        imaginationMode={isImaginationMode}
        motionSeed={timeOffset}
        idleEnergy={0.8 + (timeOffset % 0.5)}
      />
    </group>
  );
}
