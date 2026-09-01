import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { getEscapeRetrievalSnapshot } from "./escapeRetrieval";
import { COLLECTIBLE_DEFINITIONS, type CollectibleId, type RequiredActivityId } from "./gameplayExpansion";
import { registerInteractionCandidate, updateInteractionCandidate } from "./interactionFocus";
import { playerFollowsSchedule } from "./schedulePolicy";
import { useGameStore } from "./store";

function useStaticCandidate(id: string, position: [number, number, number], valid: boolean, priority = 60, range = 2.15) {
  const vector = useMemo(() => new THREE.Vector3(...position), [position]);
  const candidate = useMemo(() => ({ id, position: vector, valid, priority, range }), [id, priority, range, valid, vector]);
  useEffect(() => registerInteractionCandidate(candidate), [candidate]);
  useFrame(() => updateInteractionCandidate(id, { position: vector, valid, priority, range }));
}

function Marker({ id, position, color, label, valid = true }: { id: string; position: [number, number, number]; color: string; label: string; valid?: boolean }) {
  const active = useGameStore((state) => state.activeInteractable === id);
  useStaticCandidate(id, position, valid);
  if (!valid) return null;
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]} castShadow><boxGeometry args={[1.3, 0.65, 0.82]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      <mesh position={[0, 0.9, 0]} rotation={[-0.12, 0, 0]}><boxGeometry args={[1.55, 0.45, 0.08]} /><meshStandardMaterial color="#fff7de" /></mesh>
      <mesh position={[0, 0.91, -0.05]}><planeGeometry args={[1.18, 0.23]} /><meshBasicMaterial color={color} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}><torusGeometry args={[0.92, 0.04, 8, 24]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.92 : 0.22} /></mesh>
      <Text position={[0, 0.92, -0.1]} rotation={[0, Math.PI, 0]} fontSize={0.13} color="#4f3424" anchorX="center" anchorY="middle" maxWidth={1.2}>{label}</Text>
    </group>
  );
}

function Collectible({ id }: { id: CollectibleId }) {
  const definition = COLLECTIBLE_DEFINITIONS.find((entry) => entry.id === id)!;
  const active = useGameStore((state) => state.activeInteractable === `expansion-collectible-${id}`);
  useStaticCandidate(`expansion-collectible-${id}`, [...definition.position], true, 74, 1.8);
  return (
    <group position={definition.position}>
      <mesh position={[0, active ? 0.38 : 0.3, 0]} rotation={[0.12, id.length * 0.2, 0]} castShadow>
        <dodecahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={definition.zone === "garden" ? "#ffd166" : "#a56de2"} emissive="#5a3610" emissiveIntensity={active ? 0.35 : 0.12} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}><torusGeometry args={[0.52, 0.035, 8, 20]} /><meshBasicMaterial color="#fff08a" transparent opacity={active ? 0.95 : 0.26} /></mesh>
    </group>
  );
}

function LostFoundItem() {
  const job = useGameStore((state) => state.expansion.lostFoundJob);
  const zone = useGameStore((state) => state.zone);
  const visible = Boolean(job && job.status === "accepted" && job.zone === zone);
  const position = job?.position ?? [0, 0.2, 0];
  useStaticCandidate("lost-found-item", position, visible, 95, 1.8);
  if (!visible || !job) return null;
  return (
    <group position={position}>
      <mesh castShadow><boxGeometry args={[0.48, 0.42, 0.4]} /><meshStandardMaterial color="#58a8da" emissive="#1d5f85" emissiveIntensity={0.22} /></mesh>
      <mesh position={[0, 0.62, 0]}><octahedronGeometry args={[0.13, 0]} /><meshBasicMaterial color="#fff08a" /></mesh>
    </group>
  );
}

export function GameplayExpansionWorld() {
  const zone = useGameStore((state) => state.zone);
  const expansion = useGameStore((state) => state.expansion);
  const visibleCollectibles = expansion.activeCollectibles.filter((id) => {
    const definition = COLLECTIBLE_DEFINITIONS.find((entry) => entry.id === id);
    return definition?.zone === zone && !expansion.foundCollectibles.includes(id);
  });
  return (
    <group>
      {zone === "hub" && (
        <>
          <Marker id="lost-found-desk" position={[-6.8, 0, -4.7]} color="#e88b57" label="Lost & Found Job Board" />
          <Marker id="art-mini-activity" position={[-12.2, 0, -11.7]} color="#e76f8c" label="Art Activity" />
          <Marker id="show-and-tell-spot" position={[0, 0, 2.3]} color="#8a63c7" label="Show & Tell" />
          <Marker id="tech-market" position={[11.8, 0, 11.7]} color="#38b6c8" label="Tech Market" />
          <Marker id="snack-window" position={[4.8, 0, -3]} color="#f2b85b" label="Juice & Crackers" />
        </>
      )}
      {visibleCollectibles.map((id) => <Collectible key={id} id={id} />)}
      <LostFoundItem />
    </group>
  );
}

export function GameplayExpansionDirector() {
  const day = useGameStore((state) => state.dayNumber);
  const schedule = useGameStore((state) => state.schedule);
  const zone = useGameStore((state) => state.zone);
  const rotateExpansionContent = useGameStore((state) => state.rotateExpansionContent);
  const recordAttendance = useGameStore((state) => state.recordAttendance);

  useEffect(() => {
    rotateExpansionContent();
    const timer = window.setInterval(rotateExpansionContent, 1000);
    return () => window.clearInterval(timer);
  }, [day, rotateExpansionContent]);

  useEffect(() => {
    if (schedule !== "show-and-tell" && schedule !== "art-time") return;
    const activity = schedule as RequiredActivityId;
    const timer = window.setInterval(() => {
      const state = useGameStore.getState();
      if (playerFollowsSchedule(activity, state.zone, state.playerPosition)) recordAttendance(activity, 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [schedule, zone, recordAttendance]);

  useEffect(() => {
    // Touching this snapshot here keeps escape statistics available to the
    // end-of-day report without changing the retrieval controller itself.
    getEscapeRetrievalSnapshot();
  }, [day]);

  return null;
}
