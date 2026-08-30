import { useGameStore } from './store';
import { getWorldSolidTransform, PLAY_SLIDE_RAMP, WORLD_SOLIDS } from './world';

export function Environment() {
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  const quality = useGameStore(s => s.quality);
  
  // Colors adjust based on imagination mode
  const floorMain = isImaginationMode ? "#2b1055" : "#e4d0b6";
  const floorArt = isImaginationMode ? "#0f380f" : "#d5e2dc";
  const floorGrass = isImaginationMode ? "#590d22" : "#99c279";
  const floorStorage = isImaginationMode ? "#1a0b16" : "#c4af98";
  const floorHall = isImaginationMode ? "#0d1b2a" : "#dbc1a1";
  
  const wallColor = isImaginationMode ? "#3c096c" : "#faf5ee";

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={isImaginationMode ? 0.4 : 0.7} color={isImaginationMode ? "#8a4fff" : "#ffffff"} />
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={isImaginationMode ? 1.5 : 1} 
        color={isImaginationMode ? "#ff0a54" : "#ffeedd"}
        castShadow={quality === 'high'}
        shadow-mapSize-width={quality === 'high' ? 1024 : 256}
        shadow-mapSize-height={quality === 'high' ? 1024 : 256}
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
      {WORLD_SOLIDS.filter((solid) => solid.zone === 'hub' && (solid.kind === 'wall' || solid.kind === 'boundary')).map((solid) => {
        const transform = getWorldSolidTransform(solid.id, 3);
        const color = isImaginationMode
          ? wallColor
          : solid.id.includes('divider')
            ? '#ead7c3'
            : solid.id.includes('boundary')
              ? '#f4ebd8'
              : wallColor;
        return (
          <group key={solid.id}>
            <Wall position={transform.position} size={transform.size} color={color} />
            <WallTrim position={[transform.position[0], 0.18, transform.position[2]]} size={transform.size} color={isImaginationMode ? '#6e4aa5' : '#dcb68a'} />
          </group>
        );
      })}

      {/* Decorations / Decor */}
      {/* Main room rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color={isImaginationMode ? "#ff006e" : "#f4a261"} />
      </mesh>
      
      {/* Playground Slide */}
      <group>
        <AuthoredSolidBox id="play-slide" height={2} color="#457b9d" />
        <mesh position={PLAY_SLIDE_RAMP.position} rotation={PLAY_SLIDE_RAMP.rotation} castShadow>
          <boxGeometry args={PLAY_SLIDE_RAMP.size} />
          <meshStandardMaterial color="#e76f51" />
        </mesh>
      </group>
      
      {/* Playground Sandbox */}
      <AuthoredSolidSurface id="sandbox" color="#e9c46a" />
      
      {/* Art Room Tables */}
      <group>
        <AuthoredSolidBox id="art-table" height={1} color="#a8dadc" />
        {/* Easels */}
        <AuthoredSolidBox id="art-easel" height={2} color="#2a9d8f" />
      </group>
      
      {/* Storage Boxes */}
      <group>
        <AuthoredSolidBox id="storage-box-a" height={1} color="#e9c46a" />
        <AuthoredSolidBox id="storage-box-upper" height={0.8} centerY={1.4} color="#d4a373" />
        <AuthoredSolidBox id="storage-box-b" height={1} color="#f4a261" />
      </group>
    </group>
  );
}

function AuthoredSolidBox({ id, height, centerY, color }: { id: string; height: number; centerY?: number; color: string }) {
  const transform = getWorldSolidTransform(id, height, centerY);
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

function WallTrim({ position, size, color }: { position: [number, number, number], size: [number, number, number], color: string }) {
  return (
    <mesh position={position} receiveShadow>
      <boxGeometry args={[size[0], 0.16, size[2] + 0.015]} />
      <meshStandardMaterial color={color} roughness={0.88} />
    </mesh>
  );
}
