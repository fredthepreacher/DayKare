import type { QualityPreset } from './qualityManager';
import type { GameZone } from './world';

export interface FrameTelemetryContext {
  renderer: string;
  vendor: string;
  api: string;
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  renderCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  sceneChildren: number;
  zone: GameZone;
  npcCount: number;
  quality: QualityPreset;
  renderCostMs?: number;
}

export type AdaptiveRenderMode = 'full' | 'reduced';

export interface FramePerformanceSnapshot extends FrameTelemetryContext {
  frameCount: number;
  sampleCount: number;
  fps: number;
  lastFrameMs: number;
  averageFrameMs: number;
  p50FrameMs: number;
  p95FrameMs: number;
  droppedFrames: number;
  droppedFrameRatio: number;
  degradationDetected: boolean;
  adaptiveSafeguardActive: boolean;
  adaptiveRenderMode: AdaptiveRenderMode;
  adaptiveAnimationIntervalMs: number;
  updatedAt: number;
  degradationReason: 'frame-time' | 'dropped-frames' | null;
}

const FRAME_BUDGET_MS = 1000 / 60;
const SAMPLE_LIMIT = 120;
const DEGRADED_P95_MS = 45;
const DEGRADED_DROP_RATIO = 0.2;
const RECOVERY_P95_MS = 34;
const RECOVERY_DROP_RATIO = 0.1;
const DEGRADED_HOLD_MS = 3500;
const RECOVERY_HOLD_MS = 5000;
const ADAPTIVE_ANIMATION_INTERVAL_MS = 100;

/**
 * Renderer cost is intentionally changed only for the explicit low-quality
 * setting or after the existing sustained-degradation safeguard activates.
 * High-quality mode keeps the device's native DPR; reduced mode bounds pixel
 * work at 1x and lets the renderer skip shadow-map work.
 */
export function getRecommendedPixelRatio(
  quality: FrameTelemetryContext['quality'],
  devicePixelRatio: number,
  mode: AdaptiveRenderMode = 'full',
) {
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1;
  if (quality === 'low' || mode === 'reduced') return 1;
  return safeDevicePixelRatio;
}

export function shouldUseRendererShadows(
  quality: FrameTelemetryContext['quality'],
  mode: AdaptiveRenderMode = 'full',
) {
  return quality !== 'low' && mode === 'full';
}

const EMPTY_CONTEXT: FrameTelemetryContext = {
  renderer: 'unknown',
  vendor: 'unknown',
  api: 'unknown',
  devicePixelRatio: 1,
  viewportWidth: 0,
  viewportHeight: 0,
  renderCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  sceneChildren: 0,
  zone: 'hub',
  npcCount: 0,
  quality: 'high',
};

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.floor((values.length - 1) * fraction));
  return values[index];
}

/**
 * A small rolling frame monitor intended for development profiling on real
 * devices. Once a poor frame window persists, callers may use the
 * conservative renderer mode and interval to reduce optional work; recovery
 * requires a separate, longer healthy window.
 */
export class FramePerformanceTelemetry {
  private samples = new Float32Array(SAMPLE_LIMIT);
  private sampleCount = 0;
  private sampleCursor = 0;
  private frameCount = 0;
  private lastSummaryAt = Number.NEGATIVE_INFINITY;
  private degradedSince: number | null = null;
  private recoverySince: number | null = null;
  private adaptiveSafeguardActive = false;
  private snapshot: FramePerformanceSnapshot = {
    ...EMPTY_CONTEXT,
    frameCount: 0,
    sampleCount: 0,
    fps: 0,
    lastFrameMs: 0,
    averageFrameMs: 0,
    p50FrameMs: 0,
    p95FrameMs: 0,
    droppedFrames: 0,
    droppedFrameRatio: 0,
    degradationDetected: false,
    adaptiveSafeguardActive: false,
    adaptiveRenderMode: 'full',
    adaptiveAnimationIntervalMs: 0,
    updatedAt: 0,
    degradationReason: null,
  };

  recordFrame(frameTimeMs: number, atMs: number, context: FrameTelemetryContext) {
    const safeFrameTime = Math.max(0, Math.min(frameTimeMs, 1000));
    this.frameCount += 1;
    if (safeFrameTime > 0) {
      this.samples[this.sampleCursor] = safeFrameTime;
      this.sampleCursor = (this.sampleCursor + 1) % SAMPLE_LIMIT;
      this.sampleCount = Math.min(this.sampleCount + 1, SAMPLE_LIMIT);
    }
    if (this.sampleCount === 0 || atMs - this.lastSummaryAt < 250) return this.snapshot;
    this.lastSummaryAt = atMs;

    const values = Array.from(this.samples.subarray(0, this.sampleCount));
    const sorted = [...values].sort((a, b) => a - b);
    const averageFrameMs = values.reduce((total, value) => total + value, 0) / values.length;
    const droppedFrameBudgets = values.reduce(
      (total, value) => total + Math.max(0, value / FRAME_BUDGET_MS - 1),
      0,
    );
    const droppedFrameRatio = droppedFrameBudgets / Math.max(values.length, 1);
    const p50FrameMs = percentile(sorted, 0.5);
    const p95FrameMs = percentile(sorted, 0.95);
    const frameTimeDegraded = averageFrameMs >= 24 || p95FrameMs >= DEGRADED_P95_MS;
    const droppedFramesDegraded = droppedFrameRatio >= DEGRADED_DROP_RATIO;
    const degradationDetected = frameTimeDegraded || droppedFramesDegraded;

    if (degradationDetected) {
      if (this.degradedSince === null) this.degradedSince = atMs;
      this.recoverySince = null;
      if (atMs - this.degradedSince >= DEGRADED_HOLD_MS) {
        this.adaptiveSafeguardActive = true;
      }
    } else {
      this.degradedSince = null;
      if (this.adaptiveSafeguardActive && p95FrameMs <= RECOVERY_P95_MS && droppedFrameRatio <= RECOVERY_DROP_RATIO) {
        if (this.recoverySince === null) this.recoverySince = atMs;
        if (atMs - this.recoverySince >= RECOVERY_HOLD_MS) {
          this.adaptiveSafeguardActive = false;
          this.recoverySince = null;
        }
      } else {
        this.recoverySince = null;
      }
    }

    this.snapshot = {
      ...context,
      frameCount: this.frameCount,
      sampleCount: this.sampleCount,
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      lastFrameMs: safeFrameTime,
      averageFrameMs,
      p50FrameMs,
      p95FrameMs,
      droppedFrames: Math.round(droppedFrameBudgets),
      droppedFrameRatio,
      degradationDetected,
      adaptiveSafeguardActive: this.adaptiveSafeguardActive,
      adaptiveRenderMode: this.adaptiveSafeguardActive ? 'reduced' : 'full',
      adaptiveAnimationIntervalMs: this.adaptiveSafeguardActive ? ADAPTIVE_ANIMATION_INTERVAL_MS : 0,
      updatedAt: atMs,
      degradationReason: frameTimeDegraded ? 'frame-time' : droppedFramesDegraded ? 'dropped-frames' : null,
    };
    return this.snapshot;
  }

  getSnapshot() {
    return this.snapshot;
  }
}

let telemetry: FramePerformanceTelemetry | null = null;

export function getPerformanceTelemetry() {
  if (!telemetry) telemetry = new FramePerformanceTelemetry();
  return telemetry;
}

export function shouldUpdateOptionalAnimation(lastUpdate: { current: number }, now: number) {
  const interval = getPerformanceTelemetry().getSnapshot().adaptiveAnimationIntervalMs;
  if (interval === 0 || now - lastUpdate.current >= interval) {
    lastUpdate.current = now;
    return true;
  }
  return false;
}
