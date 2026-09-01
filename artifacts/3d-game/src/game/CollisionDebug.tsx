import { useMemo } from 'react';
import {
  WORLD_PORTALS,
  WORLD_SOLIDS,
  WORLD_WALKABLE_REGIONS,
  blocksPlayer,
  type GameZone,
} from './world';

/**
 * Developer collision overlay: `?collision` on any build.
 *
 * Every collider in DayKare is authored data, so the entire class of bug the
 * owner reported - flat things that block, colliders larger than their mesh,
 * hard stops with no geometry at all - was visible in the numbers the whole
 * time and invisible in the game. Red means the player is stopped; green means
 * the shape is walked over; the blue outlines are the walkable regions, which
 * are a second, independent gate and the one that produced the worst offender.
 *
 * Cheap and unmounted unless asked for: a handful of wireframes, no per-frame
 * work, and nothing imports it into the normal render path.
 */

export function collisionDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has('collision');
  } catch {
    return false;
  }
}

export function CollisionDebug({ zone }: { zone: GameZone }) {
  const solids = useMemo(() => WORLD_SOLIDS.filter((solid) => solid.zone === zone), [zone]);
  const regions = useMemo(
    () => WORLD_WALKABLE_REGIONS.filter((region) => (zone === 'garden' ? region.id === 'garden' : region.id !== 'garden')),
    [zone],
  );

  return (
    <group name="collision-debug">
      {solids.map((solid) => {
        const blocking = blocksPlayer(solid);
        const height = Math.max(0.08, (solid.maxY ?? 1.5) - (solid.minY ?? 0));
        const centreX = (solid.minX + solid.maxX) / 2;
        const centreZ = (solid.minZ + solid.maxZ) / 2;
        const centreY = (solid.minY ?? 0) + height / 2;
        return (
          <mesh key={solid.id} position={[centreX, centreY, centreZ]}>
            {solid.shape === 'circle' && solid.radius !== undefined ? (
              <cylinderGeometry args={[solid.radius, solid.radius, height, 16]} />
            ) : (
              <boxGeometry args={[solid.maxX - solid.minX, height, solid.maxZ - solid.minZ]} />
            )}
            <meshBasicMaterial
              color={blocking ? '#ff2d55' : '#2ecc71'}
              wireframe
              transparent
              opacity={blocking ? 0.85 : 0.5}
            />
          </mesh>
        );
      })}

      {regions.map((region) => (
        <mesh key={`region-${region.id}`} position={[(region.minX + region.maxX) / 2, 0.02, (region.minZ + region.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[region.maxX - region.minX, region.maxZ - region.minZ]} />
          <meshBasicMaterial color="#3d8bff" wireframe transparent opacity={0.6} />
        </mesh>
      ))}

      {zone === 'hub' && WORLD_PORTALS.map((portal) => {
        const [x, , z] = portal.position;
        const size: [number, number, number] = portal.axis === 'x'
          ? [0.12, 2.2, portal.width]
          : [portal.width, 2.2, 0.12];
        return (
          <mesh key={`portal-${portal.id}`} position={[x, 1.1, z]}>
            <boxGeometry args={size} />
            <meshBasicMaterial color="#ffd166" wireframe transparent opacity={0.8} />
          </mesh>
        );
      })}
    </group>
  );
}
