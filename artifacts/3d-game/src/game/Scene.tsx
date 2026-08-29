import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, KeyboardControls } from '@react-three/drei';
import { Player } from './Player';
import { Environment } from './Environment';
import { NPCs } from './NPCs';
import { Interactables } from './Interactables';
import { HubDetails } from './HubDetails';
import { HubProgression } from './HubProgression';
import { keyMap } from './Controls';
import { UI } from './UI';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';
import { resolveInteractionCandidate } from './interactionFocus';

function InteractionFocusSystem({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const forward = useRef(new THREE.Vector3());
  const cameraForward = useRef(new THREE.Vector3());
  const { camera } = useThree();
  useFrame(() => {
    if (!playerRef.current) return;
    forward.current.set(0, 0, -1).applyQuaternion(playerRef.current.quaternion);
    camera.getWorldDirection(cameraForward.current);
    const candidate = resolveInteractionCandidate(playerRef.current.position, forward.current, cameraForward.current);
    const store = useGameStore.getState();
    if (store.activeInteractable !== (candidate?.id ?? null)) {
      store.setActiveInteractable(candidate?.id ?? null);
    }
  });
  return null;
}

function GameScene() {
  const playerRef = useRef<THREE.Group>(null);
  const isRainy = useGameStore(s => s.isRainy);
  const isImaginationMode = useGameStore(s => s.isImaginationMode);

  return (
    <>
      <Sky 
        distance={450000} 
        sunPosition={isImaginationMode ? [0, -1, 0] : (isRainy ? [0, 1, 0] : [10, 20, 10])} 
        inclination={0} 
        azimuth={0.25} 
        mieCoefficient={isImaginationMode ? 0.05 : (isRainy ? 0.01 : 0.005)}
        rayleigh={isImaginationMode ? 2 : (isRainy ? 4 : 0.5)}
      />
      {(isRainy || isImaginationMode) && (
        <fog attach="fog" args={[isImaginationMode ? '#2b1055' : '#8899a6', 5, 30]} />
      )}
      
      <Environment />
      <HubDetails />
      <HubProgression playerRef={playerRef} />
      <Interactables playerRef={playerRef} />
      <NPCs playerRef={playerRef} />
      <Player ref={playerRef} />
      <InteractionFocusSystem playerRef={playerRef} />
    </>
  );
}

export function DayKareApp() {
  const quality = useGameStore(s => s.quality);
  return (
    <KeyboardControls map={keyMap}>
      <div className="daykare-app-shell w-full relative bg-black overflow-hidden">
        <Canvas shadows={quality === 'high'} camera={{ position: [0, 5, 8], fov: 60 }}>
          <GameScene />
        </Canvas>
        <UI />
      </div>
    </KeyboardControls>
  );
}
