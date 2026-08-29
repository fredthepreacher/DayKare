import { forwardRef, useRef, useImperativeHandle, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './Controls';
import { useGameStore } from './store';
import { getTouchInput } from './touchInput';
import { CharacterModel } from './CharacterModel';

export const Player = forwardRef<THREE.Group>((props, ref) => {
  const localRef = useRef<THREE.Group>(null);
  useImperativeHandle(ref, () => localRef.current as THREE.Group);

  const [, getKeys] = useKeyboardControls<Controls>();
  const { camera } = useThree();
  const isImaginationMode = useGameStore((s) => s.isImaginationMode);
  const isRiding = useGameStore((s) => s.isRiding);
  const tricycleColorIndex = useGameStore((s) => s.tricycleColorIndex);
  const teleportTrigger = useGameStore((s) => s.teleportTrigger);
  const activeDialogue = useGameStore((s) => s.activeDialogue);
  
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
  const turnVelocity = useRef(0);
  const [isCrouching, setIsCrouching] = useState(false);
  const lastTeleport = useRef(teleportTrigger);
  
  const colors = ["#d62828", "#3a86ff", "#ff006e", "#06d6a0"];
  
  // Camera responsive rotation
  const cameraOffset = new THREE.Vector3(0, 5, 8);

  useFrame((state, delta) => {
    if (!localRef.current) return;
    
    if (teleportTrigger !== lastTeleport.current) {
      localRef.current.position.set(0, 0, 0);
      lastTeleport.current = teleportTrigger;
    }
    
    if (activeDialogue) {
      velocity.current.set(0, 0, 0);
      return;
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

    if (keys.forward) desiredVelocity.current.addScaledVector(forward.current, speed);
    if (keys.back) desiredVelocity.current.addScaledVector(forward.current, -speed);
    if (keys.left) desiredVelocity.current.addScaledVector(right.current, -speed);
    if (keys.right) desiredVelocity.current.addScaledVector(right.current, speed);
    if (Math.abs(touch.x) > 0.05 || Math.abs(touch.y) > 0.05) {
      desiredVelocity.current.addScaledVector(right.current, touch.x * speed);
      desiredVelocity.current.addScaledVector(forward.current, -touch.y * speed);
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

    // Collision Check (AABB)
    // Outer walls: -15.5 to 15.5
    nextPos.x = THREE.MathUtils.clamp(nextPos.x, -15.5, 15.5);
    nextPos.z = THREE.MathUtils.clamp(nextPos.z, -15.5, 15.5);

    // Dividers at x = 8 and x = -8, doorway between z = -2 and z = 2
    const checkDivider = (xVal: number) => {
      if (Math.abs(nextPos.x - xVal) < 0.8) { // Near the wall
        if (nextPos.z < -2 || nextPos.z > 2) {
          // Push back out
          if (localRef.current!.position.x < xVal) nextPos.x = xVal - 0.8;
          else nextPos.x = xVal + 0.8;
        }
      }
    };
    checkDivider(-8);
    checkDivider(8);

    localRef.current.position.x = nextPos.x;
    localRef.current.position.z = nextPos.z;

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

    // Follow with frame-rate-independent damping. Keep the camera inside the
    // daycare shell so the outer walls never swallow the view.
    idealCameraPosition.current.copy(localRef.current.position).add(cameraOffset);
    idealCameraPosition.current.x = THREE.MathUtils.clamp(idealCameraPosition.current.x, -14.4, 14.4);
    idealCameraPosition.current.z = THREE.MathUtils.clamp(idealCameraPosition.current.z, -14.4, 14.4);
    idealCameraPosition.current.y = Math.max(2.8, idealCameraPosition.current.y);
    const cameraBlend = 1 - Math.exp(-7 * delta);
    camera.position.lerp(idealCameraPosition.current, cameraBlend);

    cameraFocus.current.lerp(localRef.current.position, 1 - Math.exp(-10 * delta));
    cameraLookTarget.current.copy(cameraFocus.current);
    cameraLookTarget.current.y += isCrouching ? 0.78 : 1.0;
    camera.lookAt(cameraLookTarget.current);
  });

  return (
    <group ref={localRef} position={[0, 0, 0]}>
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
