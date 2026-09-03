import { useEffect, useMemo, useState } from 'react';
import { CollisionDebug, collisionDebugEnabled } from './CollisionDebug';
import { RIDEABLES, claimantOf } from './rideables';
import { useWeather } from './WeatherSystem';
import { useGameStore } from './store';
import { useQualitySettings } from './useQualitySettings';
import { getWorldSolidTransform, PLAY_SLIDE_RAMP, WORLD_SOLIDS } from './world';

export function Environment() {
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  // Opt-in developer overlay (?collision). Unmounted otherwise.
  const debugCollision = useMemo(() => collisionDebugEnabled(), []);
  const { sky } = useWeather();
  const quality = useQualitySettings();
  
  // Colors adjust based on imagination mode
  const floorMain = isImaginationMode ? "#2b1055" : "#e4d0b6";
  const floorArt = isImaginationMode ? "#0f380f" : "#d5e2dc";
  const floorGrass = isImaginationMode ? "#590d22" : "#99c279";
  const floorStorage = isImaginationMode ? "#1a0b16" : "#c4af98";
  const floorHall = isImaginationMode ? "#0d1b2a" : "#dbc1a1";
  
  const wallColor = isImaginationMode ? "#3c096c" : "#faf5ee";

  return (
    <group>
      {debugCollision && <CollisionDebug zone="hub" />}
      {/* Lighting.
          The sun used to be the literal vector [10, 20, 10] with a fixed colour,
          so a whole 9:00-to-17:30 day looked the same at every hour. It now
          follows the canonical clock and the weather, through a keyframe table
          quantised to two game minutes so React is not churned four times a
          second. Imagination Mode still overrides everything - it is a different
          world, not a time of day. */}
      <ambientLight
        intensity={isImaginationMode ? 0.4 : sky.ambientIntensity}
        color={isImaginationMode ? '#8a4fff' : sky.ambientColor}
      />
      <directionalLight
        position={isImaginationMode ? [10, 20, 10] : sky.sunPosition}
        intensity={isImaginationMode ? 1.5 : sky.sunIntensity}
        color={isImaginationMode ? '#ff0a54' : sky.sunColor}
        castShadow={quality.settings.shadows}
        shadow-mapSize-width={quality.settings.shadowMapSize}
        shadow-mapSize-height={quality.settings.shadowMapSize}
      />
      {/* Indoor fill. As it darkens or greys outside this warms and strengthens,
          which is what keeps the classroom readable at dusk and under rain
          without flattening the outdoor grading. */}
      {!isImaginationMode && (
        <hemisphereLight
          args={[sky.windowLight, '#6b5a48', sky.windowIntensity]}
          position={[0, 6, 0]}
        />
      )}
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
        {/* Steps up the tower, so the climb the ride plays has something
            to climb. They sit inside the tower's own collider, which is
            why they add no solid of their own. */}
        {[0, 1, 2, 3].map((step) => (
          <mesh key={step} position={[12, 0.32 + step * 0.42, -4.42 - step * 0.3]} castShadow>
            <boxGeometry args={[1.05, 0.14, 0.34]} />
            <meshStandardMaterial color="#f4a261" />
          </mesh>
        ))}
        {/* Side rails, so the top of the tower reads as a platform. */}
        {[-0.62, 0.62].map((offset) => (
          <mesh key={offset} position={[12 + offset, 2.32, -5.5]} castShadow>
            <boxGeometry args={[0.1, 0.62, 1.3]} />
            <meshStandardMaterial color="#2a9d8f" />
          </mesh>
        ))}
      </group>
      
      {/* Playground Sandbox */}
      <AuthoredSolidSurface id="sandbox" color="#e9c46a" />

      {/* Ride-on toys, parked. A trike vanishes from its parking spot while a
          child is riding it - the rider draws its own - so the toy is never in
          two places at once. */}
      <IdleRideables />
      
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


/**
 * The parked ride-on toys.
 *
 * Polls the claim registry rather than subscribing to it: claims change a couple
 * of times a minute at most, so a 500 ms poll is far cheaper than pushing store
 * updates through React on a system nothing else needs to observe.
 */
function IdleRideables() {
  const [claimed, setClaimed] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => {
      setClaimed((previous) => {
        const next = RIDEABLES.filter((entry) => claimantOf(entry.id) !== null).map((entry) => entry.id);
        return next.length === previous.length && next.every((id, index) => id === previous[index])
          ? previous
          : next;
      });
    };
    sync();
    const timer = window.setInterval(sync, 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <group>
      {RIDEABLES.map((rideable, index) => {
        if (claimed.includes(rideable.id)) return null;
        const colors = ['#e76f51', '#2a9d8f'];
        const color = colors[index % colors.length];
        return (
          <group key={rideable.id} position={[rideable.home[0], 0.16, rideable.home[1]]}>
            <mesh position={[0, 0.2, 0]} castShadow>
              <boxGeometry args={[0.36, 0.12, 0.62]} />
              <meshStandardMaterial color={color} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.32, -0.28]} castShadow>
              <boxGeometry args={[0.42, 0.06, 0.06]} />
              <meshStandardMaterial color="#f4f1de" />
            </mesh>
            <mesh position={[0, 0.14, -0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.07, 10]} />
              <meshStandardMaterial color="#3b3b45" />
            </mesh>
            <mesh position={[-0.19, 0.1, 0.26]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.11, 0.11, 0.06, 10]} />
              <meshStandardMaterial color="#3b3b45" />
            </mesh>
            <mesh position={[0.19, 0.1, 0.26]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.11, 0.11, 0.06, 10]} />
              <meshStandardMaterial color="#3b3b45" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
