import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';

function assetPath(fileName: string) {
  return `${import.meta.env.BASE_URL}daykare-assets/${fileName}`;
}

export function artworkBackingSize(size: [number, number]): [number, number] {
  return [size[0] + 0.16, size[1] + 0.16];
}

export function SuppliedArtwork({
  fileName,
  position,
  size,
  rotation = [0, 0, 0],
  backingColor = '#fff0c7',
}: {
  fileName: string;
  position: [number, number, number];
  size: [number, number];
  rotation?: [number, number, number];
  backingColor?: string;
}) {
  const texture = useLoader(TextureLoader, assetPath(fileName));
  const backingSize = artworkBackingSize(size);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.025]} renderOrder={1}>
        <planeGeometry args={backingSize} />
        <meshStandardMaterial color={backingColor} roughness={0.84} />
      </mesh>
      <mesh castShadow renderOrder={2}>
        <planeGeometry args={size} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}