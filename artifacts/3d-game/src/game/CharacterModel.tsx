import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

type HairStyle = 'bob' | 'curls' | 'ponytail' | 'cap' | 'sprout';
type Mood = 'happy' | 'sad' | 'curious' | 'grumpy' | 'excited';

export interface CharacterModelProps {
  bodyColor: string;
  accentColor: string;
  hairColor: string;
  skinColor?: string;
  hairStyle?: HairStyle;
  mood?: Mood;
  isTeacher?: boolean;
  isCrouching?: boolean;
  isTalking?: boolean;
  imaginationMode?: boolean;
}

const moodBrowRotation: Record<Mood, number> = {
  happy: -0.08,
  sad: 0.12,
  curious: -0.18,
  grumpy: 0.2,
  excited: -0.22,
};

export function CharacterModel({
  bodyColor,
  accentColor,
  hairColor,
  skinColor = '#f6c6a8',
  hairStyle = 'bob',
  mood = 'happy',
  isTeacher = false,
  isCrouching = false,
  isTalking = false,
  imaginationMode = false,
}: CharacterModelProps) {
  const rig = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  const lastPosition = useRef(new THREE.Vector3());
  const currentPosition = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    if (!rig.current) return;

    rig.current.parent?.getWorldPosition(currentPosition.current);
    const distance = currentPosition.current.distanceTo(lastPosition.current);
    const speed = distance / Math.max(delta, 0.016);
    lastPosition.current.copy(currentPosition.current);

    const moving = speed > 0.12;
    const running = speed > 5.5;
    phase.current += delta * (moving ? (running ? 13 : 8) : 2.2);
    const stride = moving ? Math.sin(phase.current) * (running ? 0.55 : 0.34) : 0;
    const idle = Math.sin(state.clock.elapsedTime * 2.1 + bodyColor.length) * 0.025;

    if (leftArm.current && rightArm.current && leftLeg.current && rightLeg.current) {
      leftArm.current.rotation.x = stride * 0.8;
      rightArm.current.rotation.x = -stride * 0.8;
      leftLeg.current.rotation.x = -stride * 0.7;
      rightLeg.current.rotation.x = stride * 0.7;
      leftArm.current.rotation.z = -0.08;
      rightArm.current.rotation.z = 0.08;
    }

    if (head.current) {
      head.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.7 + bodyColor.length) * 0.018;
      head.current.rotation.x = isTalking ? -0.08 : idle;
    }

    if (mouth.current) {
      const syllable = Math.abs(Math.sin(state.clock.elapsedTime * 11 + bodyColor.length));
      const targetMouthX = isTalking ? 0.9 + syllable * 0.35 : 0.75;
      const targetMouthY = isTalking ? 0.65 + syllable * 0.85 : 0.6;
      mouth.current.scale.x = THREE.MathUtils.lerp(mouth.current.scale.x, targetMouthX, delta * 14);
      mouth.current.scale.y = THREE.MathUtils.lerp(mouth.current.scale.y, targetMouthY, delta * 14);
    }

    if (rig.current) {
      const targetY = isCrouching ? 0.72 : 1;
      rig.current.scale.y = THREE.MathUtils.lerp(rig.current.scale.y, targetY, delta * 9);
      rig.current.position.y = isCrouching ? 0.14 : 0.2 + idle;
    }
  });

  const mainColor = imaginationMode ? '#ff4da6' : bodyColor;
  const trimColor = imaginationMode ? '#52e7ff' : accentColor;
  const expressionRotation = moodBrowRotation[mood];
  const eyeColor = imaginationMode ? '#21123d' : '#302331';

  return (
    <group ref={rig}>
      <group position={[0, 0.02, 0]}>
        <mesh position={[0, 0.68, 0]} castShadow>
          <capsuleGeometry args={[0.31, 0.52, 5, 12]} />
          <meshStandardMaterial color={mainColor} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.74, -0.04]} scale={[1.04, 0.62, 0.96]} castShadow>
          <sphereGeometry args={[0.32, 16, 12]} />
          <meshStandardMaterial color={trimColor} roughness={0.74} />
        </mesh>

        <group ref={leftArm} position={[-0.36, 0.82, 0]}>
          <mesh position={[0, -0.24, 0]} rotation={[0, 0, -0.12]} castShadow>
            <capsuleGeometry args={[0.095, 0.34, 4, 8]} />
            <meshStandardMaterial color={mainColor} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.46, 0]} castShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshStandardMaterial color={skinColor} roughness={0.82} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.36, 0.82, 0]}>
          <mesh position={[0, -0.24, 0]} rotation={[0, 0, 0.12]} castShadow>
            <capsuleGeometry args={[0.095, 0.34, 4, 8]} />
            <meshStandardMaterial color={mainColor} roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.46, 0]} castShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshStandardMaterial color={skinColor} roughness={0.82} />
          </mesh>
        </group>

        <group ref={leftLeg} position={[-0.16, 0.32, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.32, 4, 8]} />
            <meshStandardMaterial color={isTeacher ? '#314a6e' : '#4a5672'} roughness={0.82} />
          </mesh>
          <mesh position={[0, -0.45, -0.07]} scale={[1.05, 0.55, 1.35]} castShadow>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color="#27314d" roughness={0.82} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.16, 0.32, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <capsuleGeometry args={[0.11, 0.32, 4, 8]} />
            <meshStandardMaterial color={isTeacher ? '#314a6e' : '#4a5672'} roughness={0.82} />
          </mesh>
          <mesh position={[0, -0.45, -0.07]} scale={[1.05, 0.55, 1.35]} castShadow>
            <sphereGeometry args={[0.13, 10, 8]} />
            <meshStandardMaterial color="#27314d" roughness={0.82} />
          </mesh>
        </group>
      </group>

      <group ref={head} position={[0, 1.42, -0.02]}>
        <mesh scale={[0.88, 0.96, 0.88]} castShadow>
          <sphereGeometry args={[0.43, 18, 14]} />
          <meshStandardMaterial color={skinColor} roughness={0.72} />
        </mesh>

        <group position={[0, 0.23, 0.12]}>
          {hairStyle === 'bob' && (
            <>
              <mesh position={[0, 0.04, 0]} scale={[1.02, 0.72, 0.98]} castShadow>
                <sphereGeometry args={[0.43, 14, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
              <mesh position={[-0.35, -0.16, -0.04]} scale={[0.35, 0.62, 0.4]} castShadow>
                <sphereGeometry args={[0.24, 12, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
              <mesh position={[0.35, -0.16, -0.04]} scale={[0.35, 0.62, 0.4]} castShadow>
                <sphereGeometry args={[0.24, 12, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
            </>
          )}
          {hairStyle === 'curls' && (
            <>
              {[-0.3, 0, 0.3].map((x) => (
                <mesh key={x} position={[x, 0.02, 0]} castShadow>
                  <sphereGeometry args={[0.21, 12, 10]} />
                  <meshStandardMaterial color={hairColor} roughness={0.82} />
                </mesh>
              ))}
              <mesh position={[-0.38, -0.18, 0]} castShadow>
                <sphereGeometry args={[0.2, 12, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
              <mesh position={[0.38, -0.18, 0]} castShadow>
                <sphereGeometry args={[0.2, 12, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
            </>
          )}
          {hairStyle === 'ponytail' && (
            <>
              <mesh position={[0, 0.02, 0]} scale={[1, 0.6, 0.96]} castShadow>
                <sphereGeometry args={[0.43, 14, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
              <mesh position={[0.42, 0.02, 0.12]} castShadow>
                <sphereGeometry args={[0.22, 12, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
            </>
          )}
          {hairStyle === 'cap' && (
            <mesh position={[0, 0.02, -0.02]} scale={[1.03, 0.42, 1.02]} castShadow>
              <sphereGeometry args={[0.44, 14, 10]} />
              <meshStandardMaterial color={hairColor} roughness={0.82} />
            </mesh>
          )}
          {hairStyle === 'sprout' && (
            <>
              <mesh position={[0, 0, 0]} scale={[1.02, 0.46, 0.96]} castShadow>
                <sphereGeometry args={[0.43, 14, 10]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
              <mesh position={[0, 0.25, 0]} rotation={[0, 0, -0.18]} castShadow>
                <capsuleGeometry args={[0.11, 0.35, 4, 8]} />
                <meshStandardMaterial color={hairColor} roughness={0.82} />
              </mesh>
            </>
          )}
        </group>

        <mesh position={[-0.15, -0.02, -0.39]} scale={[0.8, 1.1, 0.3]}>
          <sphereGeometry args={[0.065, 10, 8]} />
          <meshStandardMaterial color={eyeColor} roughness={0.55} />
        </mesh>
        <mesh position={[0.15, -0.02, -0.39]} scale={[0.8, 1.1, 0.3]}>
          <sphereGeometry args={[0.065, 10, 8]} />
          <meshStandardMaterial color={eyeColor} roughness={0.55} />
        </mesh>
        <mesh position={[-0.15, 0.1, -0.405]} rotation={[0, 0, expressionRotation]}>
          <boxGeometry args={[0.15, 0.025, 0.02]} />
          <meshBasicMaterial color={eyeColor} />
        </mesh>
        <mesh position={[0.15, 0.1, -0.405]} rotation={[0, 0, -expressionRotation]}>
          <boxGeometry args={[0.15, 0.025, 0.02]} />
          <meshBasicMaterial color={eyeColor} />
        </mesh>
        <mesh ref={mouth} position={[0, -0.18, -0.405]} scale={[0.75, 0.6, 0.35]}>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshStandardMaterial color={isTalking ? '#d46372' : '#a94758'} roughness={0.65} />
        </mesh>
        <mesh position={[-0.3, -0.1, -0.36]} scale={[0.8, 0.5, 0.2]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshBasicMaterial color={imaginationMode ? '#ff9fca' : '#ef9b91'} transparent opacity={0.7} />
        </mesh>
        <mesh position={[0.3, -0.1, -0.36]} scale={[0.8, 0.5, 0.2]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshBasicMaterial color={imaginationMode ? '#ff9fca' : '#ef9b91'} transparent opacity={0.7} />
        </mesh>
      </group>

      {isTeacher && (
        <mesh position={[0, 1.12, -0.32]} rotation={[0, 0, 0]} castShadow>
          <torusGeometry args={[0.22, 0.035, 8, 18]} />
          <meshStandardMaterial color="#e7b95e" metalness={0.35} roughness={0.45} />
        </mesh>
      )}
    </group>
  );
}