import { useMemo } from 'react';
import { useGameStore } from './store';
import {
  type DeviceHints,
  type QualityPreset,
  type QualitySettings,
  applyAdaptiveDegradation,
  effectivePixelRatio,
  resolvePreset,
  settingsForPreset,
} from './qualityManager';

/**
 * The single place the game asks "what am I allowed to spend?".
 *
 * Before this, quality meant three scattered ternaries - `quality === 'high'`
 * in Scene, Environment and Garden - each deciding one thing. That is how
 * "Low quality" quietly becomes "Low quality, and also the Garden looks
 * different for a reason nobody remembers". Presets are data; this hook
 * resolves them.
 */

let cachedHints: DeviceHints | null = null;

/**
 * Read once. These do not change during a session, and `devicePixelRatio` in
 * particular is not free to query every frame.
 */
export function deviceHints(): DeviceHints {
  if (cachedHints) return cachedHints;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    cachedHints = { pixelRatio: 1, cores: null, memoryGb: null, touch: false, maxViewportEdge: 1024 };
    return cachedHints;
  }
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  cachedHints = {
    pixelRatio: window.devicePixelRatio || 1,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    touch: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    maxViewportEdge: Math.max(window.innerWidth, window.innerHeight),
  };
  return cachedHints;
}

/** Test seam. */
export const resetDeviceHintsForTests = () => { cachedHints = null; };

export interface ResolvedQuality {
  /** What the player picked, which may be 'auto'. */
  preset: QualityPreset;
  /** What 'auto' actually resolved to on this device. */
  resolved: Exclude<QualityPreset, 'auto'>;
  settings: QualitySettings;
  pixelRatio: number;
  /** True when the adaptive layer has stepped things down to protect frames. */
  degraded: boolean;
}

export function resolveQuality(preset: QualityPreset, degraded: boolean, hints: DeviceHints): ResolvedQuality {
  const resolved = resolvePreset(preset, hints);
  const settings = applyAdaptiveDegradation(settingsForPreset(preset, hints), degraded);
  return {
    preset,
    resolved,
    settings,
    pixelRatio: effectivePixelRatio(settings, hints.pixelRatio),
    degraded,
  };
}

export function useQualitySettings(degraded = false): ResolvedQuality {
  const preset = useGameStore((s) => s.quality);
  return useMemo(() => resolveQuality(preset, degraded, deviceHints()), [preset, degraded]);
}
