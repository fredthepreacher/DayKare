import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';
import {
  getPerformanceTelemetry,
  getRecommendedPixelRatio,
  type FramePerformanceSnapshot,
  type FrameTelemetryContext,
  type AdaptiveRenderMode,
  shouldUseRendererShadows,
} from './performanceTelemetry';

function rendererContext(gl: THREE.WebGLRenderer) {
  const context = gl.getContext();
  const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
  return {
    renderer: debugInfo
      ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : 'unknown',
    vendor: debugInfo
      ? String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
      : String(context.getParameter(context.VENDOR) ?? 'unknown'),
    api: typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext
      ? 'WebGL2'
      : 'WebGL1',
  };
}

function PerformanceTelemetry() {
  const { gl, scene, size, setDpr } = useThree();
  const zone = useGameStore((state) => state.zone);
  const quality = useGameStore((state) => state.quality);
  const previousFrameAt = useRef(0);
  const adaptiveModeRef = useRef<AdaptiveRenderMode>('full');
  const [adaptiveRenderMode, setAdaptiveRenderMode] = useState<AdaptiveRenderMode>('full');
  const renderer = useMemo(() => rendererContext(gl), [gl]);
  const telemetry = getPerformanceTelemetry();
  const frameContext = useRef<FrameTelemetryContext>({
    ...renderer,
    devicePixelRatio: 1,
    viewportWidth: 0,
    viewportHeight: 0,
    renderCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    sceneChildren: 0,
    zone,
    npcCount: zone === 'hub' ? 12 : 4,
    quality,
    renderCostMs: 0,
  });

  useEffect(() => {
    const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
    setDpr(getRecommendedPixelRatio(quality, devicePixelRatio, adaptiveRenderMode));
    gl.shadowMap.enabled = shouldUseRendererShadows(quality, adaptiveRenderMode);
    gl.shadowMap.needsUpdate = true;
  }, [adaptiveRenderMode, gl, quality, setDpr]);

  useFrame(() => {
    const now = performance.now();
    const frameTimeMs = previousFrameAt.current > 0
      ? now - previousFrameAt.current
      : 0;
    previousFrameAt.current = now;
    const renderInfo = gl.info.render;
    const context = frameContext.current;
    context.renderer = renderer.renderer;
    context.vendor = renderer.vendor;
    context.api = renderer.api;
    context.devicePixelRatio = gl.getPixelRatio();
    context.viewportWidth = size.width;
    context.viewportHeight = size.height;
    context.renderCalls = renderInfo.calls;
    context.triangles = renderInfo.triangles;
    context.geometries = gl.info.memory.geometries;
    context.textures = gl.info.memory.textures;
    context.sceneChildren = scene.children.length;
    context.zone = zone;
    context.npcCount = zone === 'hub' ? 12 : 4;
    context.quality = quality;
    context.renderCostMs = frameTimeMs;
    const snapshot = telemetry.recordFrame(frameTimeMs, now, context);
    if (snapshot.adaptiveRenderMode !== adaptiveModeRef.current) {
      adaptiveModeRef.current = snapshot.adaptiveRenderMode;
      setAdaptiveRenderMode(snapshot.adaptiveRenderMode);
    }
    if (import.meta.env.DEV) {
      (globalThis as typeof globalThis & {
        __daykarePerformanceProbe?: typeof snapshot;
      }).__daykarePerformanceProbe = snapshot;
    }
  });

  return null;
}

export function PerformanceTelemetryPanel() {
  const [snapshot, setSnapshot] = useState<FramePerformanceSnapshot | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('perf')) return;
    const interval = window.setInterval(() => {
      setSnapshot(getPerformanceTelemetry().getSnapshot());
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  if (!snapshot) return null;
  const renderer = snapshot.renderer.length > 48
    ? `${snapshot.renderer.slice(0, 45)}…`
    : snapshot.renderer;
  return (
    <aside className="daykare-performance-panel" aria-label="Development performance telemetry">
      <strong>Performance</strong>
      <span>{snapshot.fps.toFixed(1)} FPS · p95 {snapshot.p95FrameMs.toFixed(1)}ms</span>
      <span>{snapshot.droppedFrames} dropped · {snapshot.renderCalls} calls · {snapshot.triangles} tris</span>
      <span>{snapshot.zone} · {snapshot.devicePixelRatio.toFixed(2)} DPR · {renderer}</span>
      <span>{snapshot.adaptiveSafeguardActive ? 'Adaptive renderer safeguard active' : 'Adaptive renderer at full quality'}</span>
    </aside>
  );
}

export { PerformanceTelemetry };