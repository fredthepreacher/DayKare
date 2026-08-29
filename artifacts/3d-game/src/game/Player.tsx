import { forwardRef, useRef, useImperativeHandle, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import { Controls } from './Controls';
import { useGameStore } from './store';

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
    
    // Base speeds
    let speed = 4;
    if (keys.run) speed = 8;
    if (keys.crouch) speed = 2;
    if (isRiding) speed = 10;
    
    const turnSpeed = 10;
    
    // Crouching visually
    const targetScaleY = keys.crouch && !isRiding ? 0.6 : 1;
    localRef.current.scale.y = THREE.MathUtils.lerp(localRef.current.scale.y, targetScaleY, delta * 10);
    if (keys.crouch !== isCrouching) setIsCrouching(keys.crouch);

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
      if (keys.jump && !isCrouching && !isRiding) {
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

  const bodyColor = isImaginationMode ? "#00ffff" : "#ff7700";

  return (
    <group ref={localRef} position={[0, 0, 0]}>
      <group position={[0, isRiding ? 0.3 : 0, 0]}>
        {/* Body */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.8, 1, 0.8]} />
          <meshStandardMaterial color={bodyColor} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.3, 0]} castShadow>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color="#fcd5ce" />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.15, 1.4, -0.31]}>
          <boxGeometry args={[0.1, 0.1, 0.05]} />
          <meshBasicMaterial color="#333" />
        </mesh>
        <mesh position={[-0.15, 1.4, -0.31]}>
          <boxGeometry args={[0.1, 0.1, 0.05]} />
          <meshBasicMaterial color="#333" />
        </mesh>
        {/* Cap */}
        <mesh position={[0, 1.65, 0]}>
          <boxGeometry args={[0.62, 0.2, 0.62]} />
          <meshStandardMaterial color="#e76f51" />
        </mesh>
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
