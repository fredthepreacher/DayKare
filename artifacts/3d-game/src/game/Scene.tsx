import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, KeyboardControls } from '@react-three/drei';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Player } from './Player';
import { Environment } from './Environment';
import { NPCs } from './NPCs';
import { Interactables } from './Interactables';
import { HubDetails } from './HubDetails';
import { HubProgression } from './HubProgression';
import { keyMap } from './Controls';
import { UI } from './UI';
import * as THREE from 'three';
import { useGameStore } from './store';
import { resolveInteractionCandidate } from './interactionFocus';
import { isGameplayBlocked } from './gameplayGate';
import { ClockDriver } from './ClockDriver';
import { PerformanceTelemetry, PerformanceTelemetryPanel } from './PerformanceTelemetryPanel';
import { GameFrontEnd } from './GameFrontEnd';
import { useModeStore } from './modeStore';
import { GraphicsUnavailable } from './GraphicsUnavailable';
import { probeWebGL, watchContextLoss, type WebGLStatus } from './webglSupport';
import { startCloudSync } from './cloudSync';

const Garden = lazy(() => import('./Garden').then(({ Garden }) => ({ default: Garden })));

function InteractionFocusSystem({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const forward = useRef(new THREE.Vector3());
  const cameraForward = useRef(new THREE.Vector3());
  const { camera } = useThree();
  useFrame(() => {
    if (!playerRef.current) return;
    forward.current.set(0, 0, -1).applyQuaternion(playerRef.current.quaternion);
    camera.getWorldDirection(cameraForward.current);
    const store = useGameStore.getState();
    if (isGameplayBlocked({
      journalOpen: store.journalOpen,
      activeDialogue: store.activeDialogue,
      zoneTransitioning: store.zoneTransitioning,
      frontEndBlocked: useModeStore.getState().menuOpen || useModeStore.getState().activeMode === 'online-preview',
    })) {
      if (store.activeInteractable !== null) store.setActiveInteractable(null);
      return;
    }
    const candidate = resolveInteractionCandidate(playerRef.current.position, forward.current, cameraForward.current);
    if (store.activeInteractable !== (candidate?.id ?? null)) {
      store.setActiveInteractable(candidate?.id ?? null);
    }
  });
  return null;
}

function GameScene() {
  const playerRef = useRef<THREE.Group>(null);
  const isRainy = useGameStore(s => s.isRainy);
  const isImaginationMode = useGameStore(s => s.isImaginationMode);
  const zone = useGameStore(s => s.zone);
  const zoneTransitioning = useGameStore(s => s.zoneTransitioning);
  const completeZoneTransition = useGameStore(s => s.completeZoneTransition);

  useEffect(() => {
    if (!zoneTransitioning) return;
    const timer = window.setTimeout(completeZoneTransition, 700);
    return () => window.clearTimeout(timer);
  }, [zoneTransitioning, completeZoneTransition]);

  return (
    <>
      <Sky 
        distance={450000} 
        sunPosition={isImaginationMode ? [0, -1, 0] : (isRainy ? [0, 1, 0] : [10, 20, 10])} 
        inclination={0} 
        azimuth={0.25} 
        mieCoefficient={isImaginationMode ? 0.05 : (isRainy ? 0.01 : 0.005)}
        rayleigh={isImaginationMode ? 2 : (isRainy ? 4 : 0.5)}
      />
      {(isRainy || isImaginationMode) && (
        <fog attach="fog" args={[isImaginationMode ? '#2b1055' : '#8899a6', 5, 30]} />
      )}
      <PerformanceTelemetry />
      
      {zone === 'hub' ? (
        <>
          <Environment />
          <HubDetails />
          <HubProgression playerRef={playerRef} />
          <Interactables playerRef={playerRef} />
          <NPCs playerRef={playerRef} />
        </>
      ) : (
        <Suspense fallback={null}>
          <Garden />
        </Suspense>
      )}
      <Player ref={playerRef} />
      <InteractionFocusSystem playerRef={playerRef} />
    </>
  );
}

export function DayKareApp() {
  const quality = useGameStore(s => s.quality);
  const initialDpr = quality === 'low'
    ? 1
    : typeof window === 'undefined'
      ? 1
      : window.devicePixelRatio;

  // Ask the browser for a throwaway WebGL context before mounting the real
  // renderer. Without this the Canvas mounts regardless and a failure surfaces
  // as a raw crash instead of something a player can act on.
  const [webglStatus, setWebglStatus] = useState<WebGLStatus>('checking');
  const [contextLost, setContextLost] = useState(false);
  const unwatchRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const result = probeWebGL();
    if (!result.available) {
      console.error(`DayKare: WebGL is unavailable (${result.reason ?? 'unknown'}).`);
    }
    setWebglStatus(result.available ? 'available' : 'unavailable');
  }, []);

  useEffect(() => () => {
    unwatchRef.current?.();
    unwatchRef.current = null;
  }, []);

  // Deliberately after first paint and deliberately not awaited. Cloud sync is
  // never allowed to delay the menu, and a failure inside it never reaches the
  // game: with no configuration or no network, DayKare simply plays locally.
  useEffect(() => {
    const idle = window.setTimeout(() => {
      void startCloudSync(import.meta.env as unknown as Record<string, unknown>);
    }, 0);
    return () => window.clearTimeout(idle);
  }, []);

  const handleCanvasCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    unwatchRef.current?.();
    unwatchRef.current = watchContextLoss(gl.domElement, {
      onLost: () => {
        console.error('DayKare: the WebGL context was lost.');
        setContextLost(true);
      },
      onRestored: () => {
        console.warn('DayKare: the WebGL context was restored.');
        setContextLost(false);
      },
    });
  }, []);

  if (webglStatus === 'checking') return null;
  if (webglStatus === 'unavailable') return <GraphicsUnavailable />;

  return (
    <KeyboardControls map={keyMap}>
      <div className="daykare-app-shell w-full relative bg-black overflow-hidden">
        <Canvas
          dpr={initialDpr}
          shadows={quality === 'high'}
          camera={{ position: [0, 5, 8], fov: 60 }}
          onCreated={handleCanvasCreated}
        >
          <GameScene />
        </Canvas>
        <UI />
        {/* Outside the Canvas on purpose: the day advances on wall-clock time,
            not on the render loop. */}
        <ClockDriver />
        <PerformanceTelemetryPanel />
        <GameFrontEnd />
        {/* The canvas stays mounted so the browser can restore the context. */}
        {contextLost && <GraphicsUnavailable variant="lost" />}
      </div>
    </KeyboardControls>
  );
}
