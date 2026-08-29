import { forwardRef, useEffect, useRef, useImperativeHandle, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './Controls';
import { useGameStore } from './store';
import { getTouchInput } from './touchInput';
import { CharacterModel } from './CharacterModel';
import { addCameraOrbit, adjustCameraZoom, consumeCameraRecenterRequest, getCameraInput, recenterCamera, stepCameraInput } from './cameraInput';
import { PLAYER_RADIUS, TRICYCLE_RADIUS, resolveCameraPosition, resolveMovement, trackPlayerPosition } from './world';

export const Player = forwardRef<THREE.Group>((props, ref) => {
  const localRef = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => localRef.current as THREE.Group);

  const [, getKeys] = useKeyboardControls<Controls>();
  const { camera, gl } = useThree();
  const isImaginationMode = useGameStore((s) => s.isImaginationMode);
  const isRiding = useGameStore((s) => s.isRiding);
  const tricycleColorIndex = useGameStore((s) => s.tricycleColorIndex);
  const teleportTrigger = useGameStore((s) => s.teleportTrigger);
  const activeDialogue = useGameStore((s) => s.activeDialogue);
  const zone = useGameStore((s) => s.zone);
  const playerPosition = useGameStore((s) => s.playerPosition);
  const zoneTransitioning = useGameStore((s) => s.zoneTransitioning);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);
  
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
  const cameraSafePosition = useRef(new THREE.Vector3());
  const cameraCurrentSafePosition = useRef(new THREE.Vector3());
  const cameraBaseHeading = useRef(0);
  const cameraReady = useRef(false);
  const turnVelocity = useRef(0);
  const mouseDragging = useRef(false);
  const [isCrouching, setIsCrouching] = useState(false);
  const lastTeleport = useRef(teleportTrigger);
  const positionSaveAccumulator = useRef(0);
  
  const colors = ["#d62828", "#3a86ff", "#ff006e", "#06d6a0"];
  
  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button === 0) mouseDragging.current = true;
    };
    const onPointerUp = () => {
      mouseDragging.current = false;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (mouseDragging.current && event.pointerType === 'mouse') addCameraOrbit(event.movementX, event.movementY);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      adjustCameraZoom(Math.sign(event.deltaY) * Math.min(1.1, Math.abs(event.deltaY) * 0.012));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyR') recenterCamera();
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  useFrame((state, delta) => {
    if (!localRef.current) return;
    
    if (teleportTrigger !== lastTeleport.current) {
      localRef.current.position.set(...playerPosition);
      velocity.current.set(0, 0, 0);
      desiredVelocity.current.set(0, 0, 0);
      yVelocity.current = 0;
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

    if (!activeDialogue && !zoneTransitioning) {
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

    const locomotionBlend = 1 - Math.exp(-(desiredVelocity.current.lengthSq() > 0 ? 12 : 16) * delta);
    velocity.current.lerp(desiredVelocity.current, locomotionBlend);

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

    if (!cameraReady.current) {
      cameraBaseHeading.current = localRef.current.rotation.y;
      cameraReady.current = true;
    }
    if (consumeCameraRecenterRequest()) {
      cameraBaseHeading.current = localRef.current.rotation.y;
    }
    stepCameraInput(delta);
    const orbit = getCameraInput();
    // Locomotion turns the character, not the camera. Only a deliberate
    // recenter changes the camera's world-facing baseline.
    const heading = cameraBaseHeading.current + orbit.yaw;
    const horizontalDistance = orbit.zoom * Math.cos(orbit.pitch);
    idealCameraPosition.current.set(
      localRef.current.position.x + Math.sin(heading) * horizontalDistance,
      localRef.current.position.y + 3.8 + Math.sin(orbit.pitch) * orbit.zoom * 0.54,
      localRef.current.position.z + Math.cos(heading) * horizontalDistance,
    );
    cameraFocus.current.lerp(localRef.current.position, 1 - Math.exp(-10 * delta));
    cameraLookTarget.current.copy(cameraFocus.current);
    cameraLookTarget.current.y += isCrouching ? 0.78 : 1.0;
    cameraSafePosition.current.copy(
      resolveCameraPosition(cameraLookTarget.current, idealCameraPosition.current, 0.2, zone),
    );
    const cameraBlend = 1 - Math.exp(-7 * delta);
    const safeDistance = cameraSafePosition.current.distanceTo(cameraLookTarget.current);
    const currentDistance = camera.position.distanceTo(cameraLookTarget.current);
    cameraCurrentSafePosition.current.copy(
      resolveCameraPosition(cameraLookTarget.current, camera.position, 0.2, zone),
    );
    const currentPositionIsSafe = cameraCurrentSafePosition.current.distanceToSquared(camera.position) < 0.0025;
    // Pull in immediately when a new obstruction appears so interpolation
    // never leaves the camera behind a wall. Ease back out once space clears.
    if (!currentPositionIsSafe) {
      camera.position.copy(cameraCurrentSafePosition.current);
    } else if (safeDistance + 0.05 < currentDistance) {
      camera.position.copy(cameraSafePosition.current);
    } else {
      camera.position.lerp(cameraSafePosition.current, cameraBlend);
    }
    camera.lookAt(cameraLookTarget.current);
  });

  return (
    <group ref={localRef} position={playerPosition}>
      <group position={[0, isRiding ? 0.3 : 0, 0]}>
        <CharacterModel
          bodyColor="#f47b43"
          accentColor="#ffc857"
          hairColor="#713f32"
          hairStyle="cap"
          mood="excited"
          isCrouching={isCrouching && !isRiding}
          imaginationMode={isImaginationMode}
          motionSeed={1.3}
          idleEnergy={1.05}
        />
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
