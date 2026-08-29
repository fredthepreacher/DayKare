import { useGameStore } from './store';

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

      {/* Walls (simplified blocks) */}
      {/* Top Wall main */}
      <Wall position={[0, 1.5, -8]} size={[16, 3, 0.5]} color={wallColor} />
      {/* Bottom Wall main */}
      <Wall position={[0, 1.5, 8]} size={[16, 3, 0.5]} color={wallColor} />
      
      {/* Divider between Main and Playground (Right) with door */}
      <Wall position={[8, 1.5, -5]} size={[0.5, 3, 6]} color={wallColor} />
      <Wall position={[8, 1.5, 5]} size={[0.5, 3, 6]} color={wallColor} />
      
      {/* Divider between Main and Hallway (Left) with door */}
      <Wall position={[-8, 1.5, -5]} size={[0.5, 3, 6]} color={wallColor} />
      <Wall position={[-8, 1.5, 5]} size={[0.5, 3, 6]} color={wallColor} />

      {/* Far walls */}
      <Wall position={[-16, 1.5, 0]} size={[0.5, 3, 32]} color={wallColor} />
      <Wall position={[16, 1.5, 0]} size={[0.5, 3, 32]} color={wallColor} />
      <Wall position={[-12, 1.5, -16]} size={[8, 3, 0.5]} color={wallColor} />
      <Wall position={[-12, 1.5, 16]} size={[8, 3, 0.5]} color={wallColor} />
      <Wall position={[12, 1.5, -16]} size={[8, 3, 0.5]} color={wallColor} />
      <Wall position={[12, 1.5, 16]} size={[8, 3, 0.5]} color={wallColor} />

      {/* Decorations / Decor */}
      {/* Main room rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color={isImaginationMode ? "#ff006e" : "#ffb703"} />
      </mesh>
      
      {/* Playground Slide */}
      <group position={[12, 0, -5]}>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[1, 2, 1]} />
          <meshStandardMaterial color="#3a86ff" />
        </mesh>
        <mesh position={[0, 0.5, 1.5]} rotation={[-Math.PI / 4, 0, 0]} castShadow>
          <boxGeometry args={[1, 3, 0.2]} />
          <meshStandardMaterial color="#ff006e" />
        </mesh>
      </group>
      
      {/* Playground Sandbox */}
      <mesh position={[12, 0.1, 5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#fb8500" />
      </mesh>
      
      {/* Art Room Tables */}
      <group position={[-12, 0, -12]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[3, 1, 3]} />
          <meshStandardMaterial color="#8ecae6" />
        </mesh>
        {/* Easels */}
        <mesh position={[-2, 1, -2]} castShadow>
          <boxGeometry args={[1, 2, 0.2]} />
          <meshStandardMaterial color="#219ebc" />
        </mesh>
      </group>
      
      {/* Storage Boxes */}
      <group position={[-12, 0, 12]}>
        <mesh position={[-2, 0.5, -2]} castShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#bb9457" />
        </mesh>
        <mesh position={[-2, 1.5, -2]} castShadow>
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial color="#99582a" />
        </mesh>
        <mesh position={[1, 0.5, 2]} castShadow>
          <boxGeometry args={[1.5, 1, 1.5]} />
          <meshStandardMaterial color="#bb9457" />
        </mesh>
      </group>
    </group>
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
