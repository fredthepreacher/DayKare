import { useGameStore } from './store';
import { getWorldSolidTransform, PLAY_SLIDE_RAMP, WORLD_SOLIDS } from './world';

export function Environment() {
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  
  // Colors adjust based on imagination mode
  const floorMain = isImaginationMode ? "#2b1055" : "#e0cda7";
  const floorArt = isImaginationMode ? "#0f380f" : "#d9e2e8";
  const floorGrass = isImaginationMode ? "#590d22" : "#a3c485";
  const floorStorage = isImaginationMode ? "#1a0b16" : "#6c6663";
  const floorHall = isImaginationMode ? "#0d1b2a" : "#c4a484";
  
  const wallColor = isImaginationMode ? "#3c096c" : "#fdf8ec";

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={isImaginationMode ? 0.4 : 0.7} color={isImaginationMode ? "#8a4fff" : "#ffffff"} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={isImaginationMode ? 1.5 : 1} 
        color={isImaginationMode ? "#ff0a54" : "#ffeedd"}
        castShadow 
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {isImaginationMode && (
        <pointLight position={[-5, 5, -5]} intensity={2} color="#4cc9f0" distance={20} />
      )}

      {/* Floors */}
      {/* Main Classroom (Center) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 16]} />
        <meshStandardMaterial color={floorMain} />
      </mesh>
      
      {/* Hallway (Left) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 16]} />
        <meshStandardMaterial color={floorHall} />
      </mesh>

      {/* Art Room (Top Left) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, 0, -12]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={floorArt} />
      </mesh>

      {/* Storage Area (Bottom Left) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, 0, 12]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={floorStorage} />
      </mesh>

      {/* Playground (Right) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 32]} />
        <meshStandardMaterial color={floorGrass} />
      </mesh>

      {/* Visible walls are derived from the same bounds used by collision. */}
      {WORLD_SOLIDS.filter((solid) => solid.kind === 'wall' || solid.kind === 'boundary').map((solid) => {
        const transform = getWorldSolidTransform(solid.id, 3);
        return <Wall key={solid.id} position={transform.position} size={transform.size} color={wallColor} />;
      })}

      {/* Decorations / Decor */}
      {/* Main room rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color={isImaginationMode ? "#ff006e" : "#ffb703"} />
      </mesh>
      
      {/* Playground Slide */}
      <group>
        <AuthoredSolidBox id="play-slide" height={2} color="#3a86ff" />
        <mesh position={PLAY_SLIDE_RAMP.position} rotation={PLAY_SLIDE_RAMP.rotation} castShadow>
          <boxGeometry args={PLAY_SLIDE_RAMP.size} />
          <meshStandardMaterial color="#ff006e" />
        </mesh>
      </group>
      
      {/* Playground Sandbox */}
      <AuthoredSolidSurface id="sandbox" color="#fb8500" />
      
      {/* Art Room Tables */}
      <group>
        <AuthoredSolidBox id="art-table" height={1} color="#8ecae6" />
        {/* Easels */}
        <AuthoredSolidBox id="art-easel" height={2} color="#219ebc" />
      </group>
      
      {/* Storage Boxes */}
      <group>
        <AuthoredSolidBox id="storage-box-a" height={1} color="#bb9457" />
        <mesh position={[-14, 1.5, 10]} castShadow>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color="#99582a" />
        </mesh>
        <AuthoredSolidBox id="storage-box-b" height={1} color="#bb9457" />
      </group>
    </group>
  );
}

function AuthoredSolidBox({ id, height, color }: { id: string; height: number; color: string }) {
  const transform = getWorldSolidTransform(id, height);
  return (
    <mesh position={transform.position} castShadow receiveShadow>
      <boxGeometry args={transform.size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function AuthoredSolidSurface({ id, color }: { id: string; color: string }) {
  const transform = getWorldSolidTransform(id, 0.06, 0.04);
  return (
    <mesh position={transform.position} receiveShadow>
      <boxGeometry args={transform.size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function Wall({ position, size, color }: { position: [number, number, number], size: [number, number, number], color: string }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
