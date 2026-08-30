import { useLoader } from '@react-three/fiber';
import { Component, Suspense, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { MultiplyBlending, Path, Shape, TextureLoader } from 'three';
import {
  getWorldSolidSurfaceTransform,
  validateWorldSurfaceAnchor,
  type WorldSolidFace,
} from './world';

function assetPath(fileName: string) {
  return `${import.meta.env.BASE_URL}daykare-assets/${fileName}`;
}

export function artworkBackingSize(size: [number, number]): [number, number] {
  return [size[0] + 0.16, size[1] + 0.16];
}

export function validateArtworkSurfaceAnchor(
  anchor: ArtworkSurfaceAnchor,
  size: [number, number],
) {
  return validateWorldSurfaceAnchor(
    anchor.solidId,
    anchor.face,
    anchor.height,
    artworkBackingSize(size),
    anchor.along,
  );
}

type ArtworkRole = 'wall-display' | 'wayfinding' | 'floor-marker' | 'activity-surface' | 'branding';
type ArtworkSupport = 'frame' | 'corkboard' | 'rail' | 'signboard' | 'tray' | 'none';

export type ArtworkSurfaceAnchor = {
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

function ArtworkMesh({
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
  if (surfaceAnchor) {
    const validation = validateArtworkSurfaceAnchor(surfaceAnchor, size);
    if (!validation.valid) {
      throw new Error(`Invalid artwork mount for ${fileName}: ${validation.issues.join(', ')}`);
    }
  }
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
          premultipliedAlpha={semanticRole === 'floor-marker'}
          transparent={semanticRole === 'floor-marker'}
          depthWrite={semanticRole !== 'floor-marker'}
        />
      </mesh>
    </group>
  );
}


interface ArtworkBoundaryProps {
  fileName: string;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Keeps one failed piece of artwork from taking down the app.
 *
 * `useLoader` throws when a texture cannot be fetched, and an authored mount
 * that fails validation throws too. Without a boundary here those throws walk
 * all the way to the app root, and a single missing PNG blanks the entire
 * DayKare front end - menu, HUD and all. That was observed with one absent
 * mural texture. It matters more every time the asset count grows.
 */
class ArtworkBoundary extends Component<ArtworkBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Logged once per failed piece, named, so a missing asset is obvious in the
    // console instead of silently vanishing from the room.
    console.error(
      `DayKare: artwork "${this.props.fileName}" failed to render and was skipped.`,
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * A quiet stand-in for artwork that could not load: the backing board without
 * its picture. Keeps the room's geometry and silhouette intact rather than
 * leaving a hole where a frame should be.
 */
function ArtworkFallback({
  position,
  rotation,
  size,
  semanticRole,
  backingColor,
  surfaceAnchor,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  semanticRole: ArtworkRole;
  backingColor: string;
  surfaceAnchor?: ArtworkSurfaceAnchor;
}) {
  // Floor markers are painted onto the floor; a blank card lying there would
  // look far more wrong than nothing at all.
  if (semanticRole === 'floor-marker') return null;

  // Anchored artwork gets its transform from the wall it is mounted on, so the
  // raw position prop is meaningless for it. Resolve the anchor if we still
  // can; if that is what failed, render nothing rather than dropping a blank
  // board at the world origin.
  let placement: { position: [number, number, number]; rotation: [number, number, number] } = {
    position,
    rotation,
  };
  if (surfaceAnchor) {
    try {
      const anchored = getWorldSolidSurfaceTransform(
        surfaceAnchor.solidId,
        surfaceAnchor.face,
        surfaceAnchor.height,
        surfaceAnchor.along,
        surfaceAnchor.offset,
      );
      if (!anchored) return null;
      placement = anchored;
    } catch {
      return null;
    }
  }

  const backingSize = artworkBackingSize(size);
  return (
    <group position={placement.position} rotation={placement.rotation}>
      <mesh position={[0, 0, -0.006]}>
        <boxGeometry args={[backingSize[0], backingSize[1], 0.012]} />
        <meshStandardMaterial color={backingColor} roughness={0.9} />
      </mesh>
    </group>
  );
}

export function SuppliedArtwork(props: Parameters<typeof ArtworkMesh>[0]) {
  const {
    fileName,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    size,
    semanticRole = 'wall-display',
    backingColor = '#fff0c7',
    surfaceAnchor,
  } = props;

  return (
    <ArtworkBoundary
      fileName={fileName}
      fallback={
        <ArtworkFallback
          position={position}
          rotation={rotation}
          size={size}
          semanticRole={semanticRole}
          backingColor={backingColor}
          surfaceAnchor={surfaceAnchor}
        />
      }
    >
      <Suspense fallback={null}>
        <ArtworkMesh {...props} />
      </Suspense>
    </ArtworkBoundary>
  );
}
