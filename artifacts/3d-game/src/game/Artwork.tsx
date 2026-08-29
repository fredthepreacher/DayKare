import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
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

type ArtworkSurfaceAnchor = {
  solidId: string;
  face: WorldSolidFace;
  height: number;
  along?: number;
  offset?: number;
};

export function SuppliedArtwork({
  fileName,
  position = [0, 0, 0],
  size,
  rotation = [0, 0, 0],
  backingColor = '#fff0c7',
  surfaceAnchor,
  semanticRole = 'wall-display',
}: {
  fileName: string;
  position?: [number, number, number];
  size: [number, number];
  rotation?: [number, number, number];
  backingColor?: string;
  surfaceAnchor?: ArtworkSurfaceAnchor;
  semanticRole?: ArtworkRole;
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
  const backingDepth = semanticRole === 'floor-marker'
    ? 0.025
    : semanticRole === 'activity-surface'
      ? 0.045
      : 0.07;
  return (
    <group position={anchored?.position ?? position} rotation={anchored?.rotation ?? rotation}>
      <mesh position={[0, 0, -backingDepth / 2]} renderOrder={1} castShadow={semanticRole !== 'floor-marker'}>
        <boxGeometry args={[backingSize[0], backingSize[1], backingDepth]} />
        <meshStandardMaterial color={backingColor} roughness={0.84} />
      </mesh>
      <mesh position={[0, 0, 0.006]} castShadow={semanticRole !== 'floor-marker'} renderOrder={2}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}