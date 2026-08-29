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
  const yVelocity = useRef(0);
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
    
    if (activeDialogue) return;

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
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    velocity.current.set(0, 0, 0);

    if (keys.forward) velocity.current.add(forward.clone().multiplyScalar(speed));
    if (keys.back) velocity.current.add(forward.clone().multiplyScalar(-speed));
    if (keys.left) velocity.current.add(right.clone().multiplyScalar(-speed));
    if (keys.right) velocity.current.add(right.clone().multiplyScalar(speed));
    if (Math.abs(touch.x) > 0.05 || Math.abs(touch.y) > 0.05) {
      velocity.current.add(right.clone().multiplyScalar(touch.x * speed));
      velocity.current.add(forward.clone().multiplyScalar(-touch.y * speed));
    }

    if (velocity.current.length() > 0) {
      velocity.current.normalize().multiplyScalar(speed);
      
      const targetAngle = Math.atan2(-velocity.current.x, -velocity.current.z);
      const currentRotation = localRef.current.rotation.y;
      
      let diff = targetAngle - currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      
      localRef.current.rotation.y += diff * turnSpeed * delta;
    }

    // Apply XZ movement
    const nextPos = localRef.current.position.clone().addScaledVector(velocity.current, delta);

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

    // Update Camera
    // Always follow player, allowing some smooth lag
    const idealCameraPos = localRef.current.position.clone().add(cameraOffset);
    // If we want player to control camera rotation, we'd need mouse look. 
    // The prompt just says "camera-responsive movement", which we did above (movement is relative to camera forward/right).
    // Let's keep camera tracking behind player smoothly.
    camera.position.lerp(idealCameraPos, 0.1);
    camera.lookAt(localRef.current.position.clone().add(new THREE.Vector3(0, 1, 0)));
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
