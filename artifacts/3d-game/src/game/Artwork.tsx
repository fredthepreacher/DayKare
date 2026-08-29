import { useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import { MultiplyBlending, Path, Shape, TextureLoader } from 'three';
import {
  getWorldSolidSurfaceTransform,
  type WorldSolidFace,
} from './world';

function assetPath(fileName: string) {
  return `${import.meta.env.BASE_URL}daykare-assets/${fileName}`;
}

export function artworkBackingSize(size: [number, number]): [number, number] {
  return [size[0] + 0.16, size[1] + 0.16];
}

type ArtworkRole = 'wall-display' | 'wayfinding' | 'floor-marker' | 'activity-surface' | 'branding';
type ArtworkSupport = 'frame' | 'corkboard' | 'rail' | 'signboard' | 'tray' | 'none';

type ArtworkSurfaceAnchor = {
  solidId: string;
  face: WorldSolidFace;
  height: number;
  along?: number;
  offset?: number;
};

function createFrameShape(width: number, height: number, trim: number) {
  const outerWidth = width + trim * 2;
  const outerHeight = height + trim * 2;
  const frame = new Shape()
    .moveTo(-outerWidth / 2, -outerHeight / 2)
    .lineTo(outerWidth / 2, -outerHeight / 2)
    .lineTo(outerWidth / 2, outerHeight / 2)
    .lineTo(-outerWidth / 2, outerHeight / 2)
    .closePath();
  const opening = new Path()
    .moveTo(-width / 2, -height / 2)
    .lineTo(-width / 2, height / 2)
    .lineTo(width / 2, height / 2)
    .lineTo(width / 2, -height / 2)
    .closePath();
  frame.holes.push(opening);
  return frame;
}

export function SuppliedArtwork({
  fileName,
  position = [0, 0, 0],
  size,
  rotation = [0, 0, 0],
  backingColor = '#fff0c7',
  surfaceAnchor,
  semanticRole = 'wall-display',
  support,
}: {
  fileName: string;
  position?: [number, number, number];
  size: [number, number];
  rotation?: [number, number, number];
  backingColor?: string;
  surfaceAnchor?: ArtworkSurfaceAnchor;
  semanticRole?: ArtworkRole;
  support?: ArtworkSupport;
}) {
  const texture = useLoader(TextureLoader, assetPath(fileName));
  const backingSize = artworkBackingSize(size);
  const anchored = surfaceAnchor
    ? getWorldSolidSurfaceTransform(
      surfaceAnchor.solidId,
      surfaceAnchor.face,
      surfaceAnchor.height,
      surfaceAnchor.along,
      surfaceAnchor.offset,
    )
    : null;
  const resolvedSupport = support ?? (
    semanticRole === 'floor-marker'
      ? 'none'
      : semanticRole === 'activity-surface'
        ? 'tray'
        : semanticRole === 'branding'
          ? 'signboard'
          : 'frame'
  );
  const backingDepth = semanticRole === 'floor-marker'
    ? 0.012
    : resolvedSupport === 'tray'
      ? 0.045
      : 0.07;
  const trim = 0.07;
  const supportColor = resolvedSupport === 'corkboard' ? '#b87955' : '#9b6849';
  const boardColor = resolvedSupport === 'corkboard' ? '#c88c69' : backingColor;
  const frameShape = useMemo(
    () => createFrameShape(backingSize[0], backingSize[1], trim),
    [backingSize, trim],
  );
  return (
    <group position={anchored?.position ?? position} rotation={anchored?.rotation ?? rotation}>
      {resolvedSupport !== 'none' && (
        <mesh position={[0, 0, -backingDepth / 2]} renderOrder={1} castShadow={resolvedSupport === 'tray'}>
          <boxGeometry args={[backingSize[0], backingSize[1], backingDepth]} />
          <meshStandardMaterial color={boardColor} roughness={resolvedSupport === 'corkboard' ? 0.96 : 0.84} />
        </mesh>
      )}
      {resolvedSupport !== 'none' && resolvedSupport !== 'tray' && (
        <mesh position={[0, 0, 0.025]}>
          <shapeGeometry args={[frameShape]} />
          <meshStandardMaterial
            color={resolvedSupport === 'rail' || resolvedSupport === 'signboard' ? '#b97a51' : supportColor}
            roughness={0.78}
          />
        </mesh>
      )}
      <mesh
        position={[0, 0, resolvedSupport === 'none' ? 0.006 : 0.046]}
        castShadow={resolvedSupport === 'tray'}
        renderOrder={2}
      >
        <planeGeometry args={size} />
        <meshBasicMaterial
          map={texture}
          toneMapped={false}
          blending={semanticRole === 'floor-marker' ? MultiplyBlending : undefined}
          transparent={semanticRole === 'floor-marker'}
          depthWrite={semanticRole !== 'floor-marker'}
        />
      </mesh>
    </group>
  );
}