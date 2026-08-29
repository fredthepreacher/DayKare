import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

type HairStyle = 'bob' | 'curls' | 'ponytail' | 'cap' | 'sprout';
type Mood = 'happy' | 'sad' | 'curious' | 'grumpy' | 'excited';
type Accessory = 'none' | 'backpack' | 'badge';
type ActivityMode = 'standing' | 'walking' | 'sitting' | 'playing' | 'gathering' | 'coloring' | 'toy-play' | 'conversation' | 'reading' | 'singing' | 'dancing' | 'pretend-play' | 'circle-time' | 'snacking' | 'following' | 'reacting' | 'intervening';
type SocialReaction = 'smile' | 'wave' | 'cheer' | 'listen';
type IdleVariant = 'sway' | 'fidget' | 'look-around' | 'bounce';

const SHARED_ACCESSORY_BOX = new THREE.BoxGeometry(0.42, 0.5, 0.16);
const SHARED_BADGE = new THREE.CircleGeometry(0.09, 10);

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
  motionSeed?: number;
  idleEnergy?: number;
  accessory?: Accessory;
  activityMode?: ActivityMode;
  socialReaction?: SocialReaction;
  idleVariant?: IdleVariant;
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
  motionSeed = 0,
  idleEnergy = 1,
  accessory = 'none',
  activityMode = 'standing',
  socialReaction,
  idleVariant = 'sway',
}: CharacterModelProps) {
  const rig = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  const lastPosition = useRef(new THREE.Vector3());
  const currentPosition = useRef(new THREE.Vector3());
  const movementBlend = useRef(0);
  const runningBlend = useRef(0);

  useFrame((state, delta) => {
    if (!rig.current) return;

    rig.current.parent?.getWorldPosition(currentPosition.current);
    const distance = currentPosition.current.distanceTo(lastPosition.current);
    const speed = distance / Math.max(delta, 0.016);
    lastPosition.current.copy(currentPosition.current);

    const targetMovement = THREE.MathUtils.clamp((speed - 0.12) / 1.8, 0, 1);
    const targetRunning = THREE.MathUtils.clamp((speed - 5.5) / 2.5, 0, 1);
    movementBlend.current = THREE.MathUtils.lerp(movementBlend.current, targetMovement, 1 - Math.exp(-10 * delta));
    runningBlend.current = THREE.MathUtils.lerp(runningBlend.current, targetRunning, 1 - Math.exp(-9 * delta));
    phase.current += delta * THREE.MathUtils.lerp(2.2, 8 + runningBlend.current * 5, movementBlend.current);
    const stride = Math.sin(phase.current) * movementBlend.current * THREE.MathUtils.lerp(0.34, 0.55, runningBlend.current);
    const idle = Math.sin(state.clock.elapsedTime * 2.1 + motionSeed) * 0.025 * idleEnergy;
    const idleClock = idleVariant === 'fidget' ? 2.2 : idleVariant === 'bounce' ? 2.7 : 1.45;
    const idleGesture = Math.sin(state.clock.elapsedTime * idleClock + motionSeed)
      * (1 - movementBlend.current)
      * idleEnergy;
    const talkGesture = isTalking ? Math.sin(state.clock.elapsedTime * 4.2 + motionSeed) * 0.14 : 0;
    const activityGesture = activityMode === 'coloring'
      ? 0.24 + Math.sin(state.clock.elapsedTime * 2.8 + motionSeed) * 0.08
      : activityMode === 'toy-play' || activityMode === 'playing'
        ? -0.16 + Math.sin(state.clock.elapsedTime * 4 + motionSeed) * 0.12
        : activityMode === 'reading'
          ? 0.28 + Math.sin(state.clock.elapsedTime * 2.4 + motionSeed) * 0.06
          : activityMode === 'singing'
            ? -0.04 + Math.sin(state.clock.elapsedTime * 4.8 + motionSeed) * 0.28
            : activityMode === 'dancing'
              ? Math.sin(state.clock.elapsedTime * 4.2 + motionSeed) * 0.52
              : activityMode === 'pretend-play'
                ? 0.12 + Math.sin(state.clock.elapsedTime * 3.3 + motionSeed) * 0.2
                : activityMode === 'circle-time'
                  ? 0.2 + Math.sin(state.clock.elapsedTime * 2.1 + motionSeed) * 0.08
                  : activityMode === 'snacking'
                    ? 0.32 + Math.sin(state.clock.elapsedTime * 2.7 + motionSeed) * 0.06
                    : activityMode === 'following'
                      ? Math.sin(state.clock.elapsedTime * 3.6 + motionSeed) * 0.14
                      : activityMode === 'reacting'
                        ? Math.sin(state.clock.elapsedTime * 5.5 + motionSeed) * 0.34
                        : activityMode === 'intervening'
                          ? -0.34
                          : 0;
    const blink = Math.pow(Math.max(0, Math.sin(state.clock.elapsedTime * 0.62 + motionSeed * 0.7)), 30);

    if (leftArm.current && rightArm.current && leftLeg.current && rightLeg.current) {
      const wave = socialReaction === 'wave' ? Math.sin(state.clock.elapsedTime * 6 + motionSeed) * 0.5 : 0;
      const cheer = socialReaction === 'cheer' ? -0.7 : 0;
      leftArm.current.rotation.x = stride * 0.8 + idleGesture * 0.045 + cheer + activityGesture;
      rightArm.current.rotation.x = -stride * 0.8 - idleGesture * 0.045 + wave + cheer + activityGesture * 0.7;
      leftLeg.current.rotation.x = -stride * 0.7;
      rightLeg.current.rotation.x = stride * 0.7;
      leftArm.current.rotation.z = -0.08 - idleGesture * 0.025 - talkGesture;
      rightArm.current.rotation.z = 0.08 + idleGesture * 0.025 + talkGesture;
    }

    if (head.current) {
      head.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.7 + motionSeed) * 0.018 * idleEnergy;
      head.current.rotation.x = isTalking ? -0.08 : socialReaction === 'listen' ? 0.09 : idle;
      head.current.rotation.y = idleVariant === 'look-around'
        ? Math.sin(state.clock.elapsedTime * 0.8 + motionSeed) * 0.1
        : 0;
    }

    if (leftEye.current && rightEye.current) {
      leftEye.current.scale.y = 1 - blink * 0.9;
      rightEye.current.scale.y = 1 - blink * 0.9;
    }

    if (mouth.current) {
      const syllable = Math.abs(Math.sin(state.clock.elapsedTime * 11 + motionSeed));
      const targetMouthX = isTalking ? 0.9 + syllable * 0.35 : 0.75;
      const targetMouthY = isTalking ? 0.65 + syllable * 0.85 : 0.6;
      mouth.current.scale.x = THREE.MathUtils.lerp(mouth.current.scale.x, targetMouthX, delta * 14);
      mouth.current.scale.y = THREE.MathUtils.lerp(mouth.current.scale.y, targetMouthY, delta * 14);
    }

    if (rig.current) {
      const lowActivity = activityMode === 'sitting'
        || activityMode === 'coloring'
        || activityMode === 'reading'
        || activityMode === 'circle-time'
        || activityMode === 'snacking';
      const targetY = isCrouching
        ? 0.72
        : lowActivity
          ? 0.8
          : 1;
      rig.current.scale.y = THREE.MathUtils.lerp(rig.current.scale.y, targetY, delta * 9);
      const activityBounce = activityMode === 'playing' || activityMode === 'toy-play' || idleVariant === 'bounce'
        ? Math.abs(Math.sin(state.clock.elapsedTime * 2.8 + motionSeed)) * 0.045
        : 0;
      const targetRootY = isCrouching
        ? 0.14
        : lowActivity
          ? -0.02
          : 0.2 + idle + activityBounce;
      rig.current.position.y = THREE.MathUtils.lerp(rig.current.position.y, targetRootY, 1 - Math.exp(-12 * delta));
      rig.current.rotation.z = activityMode === 'gathering'
        ? Math.sin(state.clock.elapsedTime * 1.2 + motionSeed) * 0.025
        : 0;
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

        <mesh ref={leftEye} position={[-0.15, -0.02, -0.39]} scale={[0.8, 1.1, 0.3]}>
          <sphereGeometry args={[0.065, 10, 8]} />
          <meshStandardMaterial color={eyeColor} roughness={0.55} />
        </mesh>
        <mesh ref={rightEye} position={[0.15, -0.02, -0.39]} scale={[0.8, 1.1, 0.3]}>
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
      {accessory === 'backpack' && (
        <group position={[0, 1.02, 0.3]}>
          <mesh>
            <primitive object={SHARED_ACCESSORY_BOX} attach="geometry" />
            <meshStandardMaterial color={trimColor} roughness={0.82} />
          </mesh>
          <mesh position={[0, 0.02, 0.1]}>
            <boxGeometry args={[0.24, 0.16, 0.04]} />
            <meshStandardMaterial color={mainColor} roughness={0.82} />
          </mesh>
        </group>
      )}
      {accessory === 'badge' && (
        <mesh position={[0.24, 1.13, -0.34]} rotation={[0, 0, 0]}>
          <primitive object={SHARED_BADGE} attach="geometry" />
          <meshStandardMaterial color={trimColor} roughness={0.65} />
        </mesh>
      )}
    </group>
  );
}