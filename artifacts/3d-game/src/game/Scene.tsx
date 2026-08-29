import { Canvas } from '@react-three/fiber';
import { Sky, KeyboardControls } from '@react-three/drei';
import { Player } from './Player';
import { Environment } from './Environment';
import { NPCs } from './NPCs';
import { Interactables } from './Interactables';
import { keyMap } from './Controls';
import { UI } from './UI';
import { useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';

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
      <Interactables playerRef={playerRef} />
      <NPCs playerRef={playerRef} />
      <Player ref={playerRef} />
    </>
  );
}

export function DayKareApp() {
  const quality = useGameStore(s => s.quality);
  return (
    <KeyboardControls map={keyMap}>
      <div className="w-full h-screen relative bg-black overflow-hidden">
        <Canvas shadows={quality === 'high'} camera={{ position: [0, 5, 8], fov: 60 }}>
          <GameScene />
        </Canvas>
        <UI />
      </div>
    </KeyboardControls>
  );
}
