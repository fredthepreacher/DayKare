import { forwardRef, useEffect, useMemo, useRef, useImperativeHandle, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEquippedAppearance } from './useEquippedAppearance';
import { Controls } from './Controls';
import { useGameStore } from './store';
import { getTouchInput } from './touchInput';
import { CharacterModel } from './CharacterModel';
import { addCameraOrbit, consumeCameraRecenterRequest, getCameraInput, getCameraProfile, recenterCamera, stepCameraInput } from './cameraInput';
import { isGameplayBlocked } from './gameplayGate';
import { CAMERA_BLOCKERS, MIN_CAMERA_DISTANCE, PLAYER_RADIUS, TRICYCLE_RADIUS, resolveMovement, trackPlayerPosition } from './world';
import { CameraRig, advanceCameraPosition } from './cameraRig';
import { useModeStore } from './modeStore';

export const Player = forwardRef<THREE.Group>((props, ref) => {
  const localRef = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => localRef.current as THREE.Group);

  const [, getKeys] = useKeyboardControls<Controls>();
  const { camera, gl, size } = useThree();
  const isImaginationMode = useGameStore((s) => s.isImaginationMode);
  const isRiding = useGameStore((s) => s.isRiding);
  const tricycleColorIndex = useGameStore((s) => s.tricycleColorIndex);
  const teleportTrigger = useGameStore((s) => s.teleportTrigger);
  const activeDialogue = useGameStore((s) => s.activeDialogue);
  const journalOpen = useGameStore((s) => s.journalOpen);
  const zone = useGameStore((s) => s.zone);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const zoneTransitioning = useGameStore((s) => s.zoneTransitioning);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
  const frontEndBlocked = useModeStore((s) => s.menuOpen || s.activeMode === 'online-preview');
  
  // State
  const velocity = useRef(new THREE.Vector3());
  const desiredVelocity = useRef(new THREE.Vector3());
  const yVelocity = useRef(0);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const nextPosition = useRef(new THREE.Vector3());
  const idealCameraPosition = useRef(new THREE.Vector3());
  const cameraFocus = useRef(new THREE.Vector3());
  const cameraLookTarget = useRef(new THREE.Vector3());
  const cameraLookAhead = useRef(new THREE.Vector3());
  const cameraSafePosition = useRef(new THREE.Vector3());
  const resolvedDisplacement = useRef(new THREE.Vector3());
  const actualVelocity = useRef(new THREE.Vector3());
  const desiredFocus = useRef(new THREE.Vector3());
  const desiredLookAhead = useRef(new THREE.Vector3());
  const cameraRig = useRef(new CameraRig());
  const cameraBaseHeading = useRef(0);
  const cameraReady = useRef(false);
  const turnVelocity = useRef(0);
  const mouseDragging = useRef(false);
  const gameplayBlocked = useRef(false);
  const [isCrouching, setIsCrouching] = useState(false);
  const lastTeleport = useRef(teleportTrigger);
  const positionSaveAccumulator = useRef(0);
  gameplayBlocked.current = isGameplayBlocked({ journalOpen, activeDialogue, zoneTransitioning, frontEndBlocked });
  const cameraProfile = getCameraProfile(size.width, size.height);
  const zoneCameraBlockers = useMemo(
    () => CAMERA_BLOCKERS.filter((solid) => solid.zone === zone),
    [zone],
  );
  
  const colors = ["#d62828", "#3a86ff", "#ff006e", "#06d6a0"];
  
  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (!gameplayBlocked.current && event.pointerType === 'mouse' && event.button === 0) mouseDragging.current = true;
    };
    const onPointerUp = () => {
      mouseDragging.current = false;
    };
    const onPointerCancel = () => {
      mouseDragging.current = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!gameplayBlocked.current && mouseDragging.current && event.pointerType === 'mouse') {
        addCameraOrbit(event.movementX, event.movementY);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!gameplayBlocked.current && event.code === 'KeyR') recenterCamera();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('blur', onPointerCancel);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', onPointerCancel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [gl]);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.fov = cameraProfile.fov;
    camera.updateProjectionMatrix();
  }, [camera, cameraProfile.fov]);

  useFrame((state, delta) => {
    if (!localRef.current) return;
    
    if (teleportTrigger !== lastTeleport.current) {
      localRef.current.position.set(...playerPosition);
      velocity.current.set(0, 0, 0);
      desiredVelocity.current.set(0, 0, 0);
      yVelocity.current = 0;
      // A zone travel or reset should establish a fresh third-person shot at
      // the new spawn instead of easing the focus across the old zone.
      cameraFocus.current.copy(localRef.current.position);
      cameraReady.current = false;
      cameraRig.current.reset();
      recenterCamera();
      lastTeleport.current = teleportTrigger;
    }
    
    const keys = getKeys();
    const touch = getTouchInput();
    const crouching = keys.crouch || touch.crouch;
    const running = (keys.run || touch.run) && !crouching;
    
    // Base speeds
    let speed = 4;
    if (running) speed = 8;
    if (crouching) speed = 2;
    if (isRiding) speed = 10;
    
    const turnSpeed = 10;
    
    // The visual rig owns the crouch pose so the player collider remains stable.
    if (crouching !== isCrouching) setIsCrouching(crouching);

    // Camera relative movement
    forward.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.current.y = 0;
    right.current.normalize();

    desiredVelocity.current.set(0, 0, 0);

    const blocked = gameplayBlocked.current;
    if (!blocked) {
      if (keys.forward) desiredVelocity.current.addScaledVector(forward.current, speed);
      if (keys.back) desiredVelocity.current.addScaledVector(forward.current, -speed);
      if (keys.left) desiredVelocity.current.addScaledVector(right.current, -speed);
      if (keys.right) desiredVelocity.current.addScaledVector(right.current, speed);
      if (Math.abs(touch.x) > 0.05 || Math.abs(touch.y) > 0.05) {
        desiredVelocity.current.addScaledVector(right.current, touch.x * speed);
        desiredVelocity.current.addScaledVector(forward.current, -touch.y * speed);
      }
    }

    if (desiredVelocity.current.length() > speed) {
      desiredVelocity.current.normalize().multiplyScalar(speed);
    }

    if (blocked) {
      velocity.current.set(0, 0, 0);
      desiredVelocity.current.set(0, 0, 0);
      turnVelocity.current = 0;
      yVelocity.current = 0;
    } else {
      const locomotionBlend = 1 - Math.exp(-(desiredVelocity.current.lengthSq() > 0 ? 12 : 16) * delta);
      velocity.current.lerp(desiredVelocity.current, locomotionBlend);
    }

    if (velocity.current.length() > 0.08) {

      const targetAngle = Math.atan2(-velocity.current.x, -velocity.current.z);
      const currentRotation = localRef.current.rotation.y;

      const diff = THREE.MathUtils.euclideanModulo(targetAngle - currentRotation + Math.PI, Math.PI * 2) - Math.PI;
      let wrappedDiff = diff;
      if (wrappedDiff > Math.PI) wrappedDiff -= Math.PI * 2;
      if (wrappedDiff < -Math.PI) wrappedDiff += Math.PI * 2;
      turnVelocity.current = THREE.MathUtils.lerp(turnVelocity.current, wrappedDiff * turnSpeed, 1 - Math.exp(-14 * delta));
      localRef.current.rotation.y += turnVelocity.current * delta;
    } else {
      turnVelocity.current = THREE.MathUtils.lerp(turnVelocity.current, 0, 1 - Math.exp(-10 * delta));
    }

    // Apply XZ movement
    const nextPos = nextPosition.current.copy(localRef.current.position).addScaledVector(velocity.current, delta);

    const resolvedPosition = resolveMovement(
      localRef.current.position,
      nextPos,
      isRiding ? TRICYCLE_RADIUS : PLAYER_RADIUS,
      0.38,
      zone,
    );
    resolvedDisplacement.current.copy(resolvedPosition).sub(localRef.current.position);
    localRef.current.position.x = resolvedPosition.x;
    localRef.current.position.z = resolvedPosition.z;
    trackPlayerPosition(localRef.current.position);
    positionSaveAccumulator.current += delta;
    if (positionSaveAccumulator.current >= 0.5) {
      positionSaveAccumulator.current = 0;
      setPlayerPosition([
        localRef.current.position.x,
        localRef.current.position.y,
        localRef.current.position.z,
      ]);
    }

    // Jumping and Gravity
    if (!blocked) {
      const isGrounded = localRef.current.position.y <= 0;

      if (isGrounded) {
        localRef.current.position.y = 0;
        yVelocity.current = 0;
        if (keys.jump && !crouching && !isRiding) {
          yVelocity.current = 6;
        }
      } else {
        yVelocity.current -= 15 * delta; // Gravity
      }

      localRef.current.position.y += yVelocity.current * delta;
    }

    if (!cameraReady.current) {
      cameraBaseHeading.current = localRef.current.rotation.y;
      cameraReady.current = true;
    }
    if (consumeCameraRecenterRequest()) {
      cameraBaseHeading.current = localRef.current.rotation.y;
      cameraRig.current.reset(false);
    }
    stepCameraInput(delta);
    const orbit = getCameraInput();
    // Locomotion turns the character, not the camera. Only a deliberate
    // recenter changes the camera's world-facing baseline.
    const heading = cameraBaseHeading.current + orbit.yaw;
    // Follow the displacement that actually survived collision resolution.
    // This avoids aiming into a wall from the requested (but blocked) velocity.
    actualVelocity.current.set(0, 0, 0);
    if (delta > 1e-5) actualVelocity.current.copy(resolvedDisplacement.current).setY(0).multiplyScalar(1 / delta);
    const resolvedSpeed = actualVelocity.current.length();
    desiredLookAhead.current.set(0, 0, 0);
    if (resolvedSpeed > 0.01) {
      desiredLookAhead.current
        .copy(actualVelocity.current)
        .normalize()
        .multiplyScalar(cameraProfile.lookAhead * THREE.MathUtils.clamp(resolvedSpeed / 4, 0, 1));
    }
    const reversing = cameraLookAhead.current.lengthSq() > 0.002
      && desiredLookAhead.current.lengthSq() > 0.002
      && cameraLookAhead.current.dot(desiredLookAhead.current) < 0;
    cameraLookAhead.current.lerp(
      desiredLookAhead.current,
      1 - Math.exp(-(reversing ? 15 : desiredLookAhead.current.lengthSq() > 0 ? 9 : 5) * delta),
    );
    desiredFocus.current.copy(localRef.current.position).add(cameraLookAhead.current);
    cameraFocus.current.lerp(desiredFocus.current, 1 - Math.exp(-8 * delta));
    const horizontalDistance = cameraProfile.distance * Math.cos(orbit.pitch);
    idealCameraPosition.current.set(
      cameraFocus.current.x + Math.sin(heading) * horizontalDistance,
      localRef.current.position.y + cameraProfile.height + Math.sin(orbit.pitch) * cameraProfile.distance * 0.54,
      cameraFocus.current.z + Math.cos(heading) * horizontalDistance,
    );
    cameraLookTarget.current.copy(cameraFocus.current);
    cameraLookTarget.current.y += isCrouching ? 0.78 : 1.0;
    const cameraWasInitialized = cameraRig.current.state.initialized;
    const previousCameraSide = cameraRig.current.state.sideId;
    const rigResult = cameraRig.current.resolve(
      cameraLookTarget.current,
      idealCameraPosition.current,
      camera.position,
      0.2,
      MIN_CAMERA_DISTANCE,
      zoneCameraBlockers,
      delta,
    );
    cameraSafePosition.current.copy(rigResult.position);
    const safeDistance = cameraSafePosition.current.distanceTo(cameraLookTarget.current);
    const currentDistance = camera.position.distanceTo(cameraLookTarget.current);
    if (!cameraWasInitialized) {
      camera.position.copy(cameraSafePosition.current);
    } else if (rigResult.transitionClear) {
      const inward = safeDistance + 0.05 < currentDistance;
      const sideChanged = previousCameraSide !== null && rigResult.sideId !== previousCameraSide;
      const maxSpeed = inward ? 18 : sideChanged ? 7 : 5;
      camera.position.copy(advanceCameraPosition(
        camera.position,
        cameraLookTarget.current,
        cameraSafePosition.current,
        maxSpeed * delta,
        0.2,
        zoneCameraBlockers,
      ));
    }
    camera.lookAt(cameraLookTarget.current);
    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __daykareMovementProbeEnabled?: boolean;
        __daykareMovementProbe?: {
          player: [number, number, number];
          camera: [number, number, number];
          cameraTarget: [number, number, number];
          cameraSide: string | null;
          zone: 'hub' | 'garden';
          updatedAt: number;
        };
      };
      if (debugGlobal.__daykareMovementProbeEnabled) {
        debugGlobal.__daykareMovementProbe = {
          player: localRef.current.position.toArray(),
          camera: camera.position.toArray(),
          cameraTarget: cameraLookTarget.current.toArray(),
          cameraSide: cameraRig.current.state.sideId,
          zone,
          updatedAt: performance.now(),
        };
      }
    }
  });

  const appearance = useEquippedAppearance();

  return (
    <group ref={localRef} position={playerPosition}>
      <group position={[0, isRiding ? 0.3 : 0, 0]}>
        {/* Equipped Drip tints the player. Buying a hoodie and seeing nothing
            change would make the whole economy abstract, so the cosmetic slots
            drive the rig's colours directly; unequipped slots fall back to the
            original palette rather than to grey. */}
        <CharacterModel
          bodyColor={appearance.top ?? '#f47b43'}
          accentColor={appearance.accent ?? '#ffc857'}
          hairColor="#713f32"
          hairStyle={appearance.hat ? 'cap' : 'cap'}
          mood="excited"
          isCrouching={isCrouching && !isRiding}
          imaginationMode={isImaginationMode}
          motionSeed={1.3}
          idleEnergy={1.05}
        />
        {/* Hat and shoes have no slot in the rig, so they are drawn here as
            simple shapes rather than left invisible. */}
        {appearance.hat && (
          <group position={[0, 1.34, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.27, 0.29, 0.12, 12]} />
              <meshStandardMaterial color={appearance.hat} roughness={0.75} />
            </mesh>
            <mesh position={[0, -0.04, 0.2]} castShadow>
              <boxGeometry args={[0.4, 0.04, 0.26]} />
              <meshStandardMaterial color={appearance.hat} roughness={0.75} />
            </mesh>
          </group>
        )}
        {appearance.shoes && (
          <group position={[0, 0.06, 0.02]}>
            <mesh position={[-0.12, 0, 0]} castShadow>
              <boxGeometry args={[0.16, 0.11, 0.28]} />
              <meshStandardMaterial color={appearance.shoes} roughness={0.7} />
            </mesh>
            <mesh position={[0.12, 0, 0]} castShadow>
              <boxGeometry args={[0.16, 0.11, 0.28]} />
              <meshStandardMaterial color={appearance.shoes} roughness={0.7} />
            </mesh>
          </group>
        )}
        {appearance.bottom && (
          <mesh position={[0, 0.44, 0]} castShadow>
            <boxGeometry args={[0.44, 0.3, 0.32]} />
            <meshStandardMaterial color={appearance.bottom} roughness={0.8} />
          </mesh>
        )}
      </group>
      
      {/* Dropped shadow indicator */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      {/* Ridden Tricycle */}
      {isRiding && (
        <group position={[0, 0.4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.2, 1.2]} />
            <meshStandardMaterial color={colors[tricycleColorIndex]} />
          </mesh>
          <mesh position={[0, -0.2, 0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
            <meshStandardMaterial color="#000" />
          </mesh>
          <mesh position={[0.3, -0.2, -0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
            <meshStandardMaterial color="#000" />
          </mesh>
          <mesh position={[-0.3, -0.2, -0.5]} rotation={[0, 0, Math.PI/2]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
            <meshStandardMaterial color="#000" />
          </mesh>
        </group>
      )}
    </group>
  );
});
