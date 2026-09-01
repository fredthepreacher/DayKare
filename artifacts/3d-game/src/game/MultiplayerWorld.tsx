import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CharacterModel } from './CharacterModel';
import { useModeStore } from './modeStore';
import { connectMultiplayer, disconnectMultiplayer, MULTIPLAYER_NETWORK_HZ, sendPlayerTransform, useMultiplayerStore, type NetworkTransform } from './multiplayer';
import { useGameStore } from './store';
import { useStorybookLaneStore } from './storybookLaneStore';

function RemotePlayer({ player }: { player: NetworkTransform }) {
  const ref = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3(...player.position));
  useEffect(() => { target.current.set(...player.position); }, [player.position]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.position.lerp(target.current, 1 - Math.exp(-12 * delta));
    ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, player.rotationY, 1 - Math.exp(-10 * delta));
  });
  return (
    <group ref={ref} position={player.position} rotation={[0, player.rotationY, 0]}>
      <CharacterModel bodyColor={player.color} accentColor="#ffd166" hairColor="#5b3a2e" hairStyle="cap" activityMode={player.animation === 'flopped' ? 'napping' : 'standing'} motionSeed={player.id.length} />
      {player.hasDog && (
        <group position={[-0.9, 0.28, 0.55]}>
          <mesh castShadow><boxGeometry args={[0.65, 0.48, 0.9]} /><meshStandardMaterial color="#b9783f" /></mesh>
          <mesh castShadow position={[0, 0.12, -0.55]}><boxGeometry args={[0.5, 0.5, 0.45]} /><meshStandardMaterial color="#c98a4e" /></mesh>
          <mesh castShadow position={[-0.22, 0.36, -0.55]} rotation={[0, 0, -0.25]}><coneGeometry args={[0.13, 0.38, 4]} /><meshStandardMaterial color="#6f452b" /></mesh>
          <mesh castShadow position={[0.22, 0.36, -0.55]} rotation={[0, 0, 0.25]}><coneGeometry args={[0.13, 0.38, 4]} /><meshStandardMaterial color="#6f452b" /></mesh>
        </group>
      )}
      <Html position={[0, 2, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <span className="rounded-full bg-[#fff8e8]/90 px-2 py-1 text-[10px] font-black text-[#5c3a21] shadow whitespace-nowrap">{player.name}</span>
      </Html>
    </group>
  );
}

export function MultiplayerWorld({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const activeMode = useModeStore((state) => state.activeMode);
  const online = useModeStore((state) => state.online);
  const zone = useGameStore((state) => state.zone);
  const players = useMultiplayerStore((state) => state.players);
  const lastSent = useRef(0);
  const previous = useRef(new THREE.Vector3());

  useEffect(() => {
    // The lobby owns its connection attempt. Disconnecting here while the
    // lobby is rendering can race a successful Join click and tear down the
    // channel just as the multiplayer world mounts.
    if (activeMode !== 'multiplayer') return undefined;
    void connectMultiplayer(online.roomId, online.displayName);
    return () => { void disconnectMultiplayer(); };
  }, [activeMode, online.roomId, online.displayName]);

  useFrame((state) => {
    if (activeMode !== 'multiplayer' || !playerRef.current || state.clock.elapsedTime - lastSent.current < 1 / MULTIPLAYER_NETWORK_HZ) return;
    const current = playerRef.current.position;
    const distance = current.distanceTo(previous.current);
    const elapsed = Math.max(0.001, state.clock.elapsedTime - lastSent.current);
    const speed = distance / elapsed;
    previous.current.copy(current);
    lastSent.current = state.clock.elapsedTime;
    const recovering = useStorybookLaneStore.getState().recoveringUntil > Date.now();
    const ownedItems = useStorybookLaneStore.getState().ownedItems;
    void sendPlayerTransform({
      name: online.displayName,
      color: ['#ffad33', '#33cccc', '#ff66b3', '#8ed081'][online.selectedOutfit] ?? '#ffad33',
      zone,
      position: current.toArray(),
      rotationY: playerRef.current.rotation.y,
      animation: recovering ? 'flopped' : speed > 6 ? 'running' : speed > 0.25 ? 'walking' : 'idle',
      hasDog: ownedItems.includes('dog'),
      vehicle: ownedItems.includes('mini-ride-on') ? 'mini-ride-on' : ownedItems.includes('tricycle') ? 'tricycle' : 'none',
    });
  });

  if (activeMode !== 'multiplayer') return null;
  return <>{Object.values(players).filter((player) => player.zone === zone).map((player) => <RemotePlayer key={player.id} player={player} />)}</>;
}
