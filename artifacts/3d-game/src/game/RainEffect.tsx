import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RAIN_BUDGET, isWet, type WeatherKind } from './weather';
import { useQualitySettings } from './useQualitySettings';

/**
 * Rain.
 *
 * One InstancedMesh, one draw call, no physics. Drops live in a column that
 * follows the camera on X and Z, so a few hundred instances cover the whole
 * visible world however far the player walks; a drop that falls below the floor
 * is teleported back to the top of the column rather than being destroyed and
 * recreated. Nothing allocates after mount.
 *
 * This is the shape the spec asked for - "do not create thousands of
 * physics-driven droplets, use camera-local or pooled effects" - and it is also
 * the only shape that survives a phone: the alternative, per-drop objects with
 * their own transforms, is thousands of matrix updates and thousands of draws.
 *
 * Indoors is handled by not mounting this at all (see WeatherSystem): the hub
 * has a roof, so rain inside would be a bug, not an effect.
 */

const COLUMN_RADIUS = 16;
const COLUMN_TOP = 14;
const COLUMN_BOTTOM = -1.5;
const FALL_SPEED = 22;
const WIND_X = 1.6;

export function RainEffect({ weather, intensity = 1 }: { weather: WeatherKind; intensity?: number }) {
  const quality = useQualitySettings();
  const camera = useThree((state) => state.camera);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // The budget respects the quality preset in two ways: `particles` is the
  // manager's own switch (previously declared and read by nothing), and the
  // count scales with it so Low draws a light shower rather than nothing at all
  // when particles are on.
  const count = useMemo(() => {
    if (!quality.settings.particles) return 0;
    const budget = RAIN_BUDGET[weather] ?? 0;
    const scale = quality.settings.maxPixelRatio >= 2 ? 1 : quality.settings.maxPixelRatio >= 1.5 ? 0.7 : 0.45;
    return Math.max(0, Math.round(budget * scale * Math.min(1, Math.max(0, intensity))));
  }, [quality.settings.particles, quality.settings.maxPixelRatio, weather, intensity]);

  // Per-drop offsets, allocated once and reused. Deterministic-ish spread, but
  // visual noise needs no reproducibility so Math.random is fine here.
  const drops = useMemo(() => {
    const data = new Float32Array(Math.max(1, count) * 4);
    for (let index = 0; index < data.length; index += 4) {
      data[index] = (Math.random() * 2 - 1) * COLUMN_RADIUS;
      data[index + 1] = Math.random() * (COLUMN_TOP - COLUMN_BOTTOM) + COLUMN_BOTTOM;
      data[index + 2] = (Math.random() * 2 - 1) * COLUMN_RADIUS;
      data[index + 3] = 0.75 + Math.random() * 0.5;
    }
    return data;
  }, [count]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (mesh) mesh.frustumCulled = false;
  }, [count]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    // A tab that was backgrounded can hand back a huge delta. Capping it stops
    // every drop teleporting to the bottom of the column on the first frame back.
    const step = Math.min(delta, 0.05);

    for (let index = 0; index < count; index += 1) {
      const base = index * 4;
      drops[base + 1] -= FALL_SPEED * drops[base + 3] * step;
      drops[base] += WIND_X * step;

      if (drops[base + 1] < COLUMN_BOTTOM) {
        drops[base + 1] = COLUMN_TOP;
        drops[base] = (Math.random() * 2 - 1) * COLUMN_RADIUS;
        drops[base + 2] = (Math.random() * 2 - 1) * COLUMN_RADIUS;
      }
      if (drops[base] > COLUMN_RADIUS) drops[base] -= COLUMN_RADIUS * 2;

      dummy.position.set(
        camera.position.x + drops[base],
        drops[base + 1],
        camera.position.z + drops[base + 2],
      );
      dummy.scale.set(1, drops[base + 3], 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (count === 0 || !isWet(weather)) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} renderOrder={2}>
      <boxGeometry args={[0.022, 0.42, 0.022]} />
      <meshBasicMaterial color="#cfe3f2" transparent opacity={0.5} depthWrite={false} />
    </instancedMesh>
  );
}
