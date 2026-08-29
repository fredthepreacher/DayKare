import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';

function assetPath(fileName: string) {
  return `${import.meta.env.BASE_URL}daykare-assets/${fileName}`;
}

export function SuppliedArtwork({
  fileName,
  position,
  size,
  rotation = [0, 0, 0],
}: {
  fileName: string;
  position: [number, number, number];
  size: [number, number];
  rotation?: [number, number, number];
}) {
  const texture = useLoader(TextureLoader, assetPath(fileName));
  return (
    <mesh position={position} rotation={rotation} castShadow renderOrder={2}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}