/**
 * The quality presets, as data.
 *
 * One rule governs every value below: LOWERING QUALITY NEVER REMOVES A
 * MECHANIC. A phone on Low sees fewer decorative props, shorter shadows and
 * slower distant animation - it does not lose a quest, an interactable, an NPC
 * who was going to talk to it, or a Juice Club customer. Anything a player can
 * act on is off-limits to this file, and `assertPreservesGameplay` below exists
 * so that stays true when someone adds a preset in a hurry.
 *
 * The presets are declarative because the alternative - `if (quality === 'low')`
 * scattered across a dozen components - is how "Low quality" quietly becomes
 * "Low quality, and also the Garden is broken".
 */

export type QualityPreset = 'auto' | 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_PRESETS: readonly QualityPreset[] = ['auto', 'low', 'medium', 'high', 'ultra'];

export const isQualityPreset = (value: unknown): value is QualityPreset =>
  typeof value === 'string' && (QUALITY_PRESETS as readonly string[]).includes(value);

/**
 * Everything a preset is allowed to control. Every field is a cost knob:
 * fidelity, frequency or distance. None of them is a gameplay switch.
 */
export interface QualitySettings {
  /** Renderer pixel ratio ceiling. The device's own ratio still caps it. */
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  /** Beyond this many world units an NPC casts no shadow. */
  shadowDistance: number;
  /** Fraction of decorative, non-interactive props to draw. 1 = all. */
  decorativeProps: number;
  particles: boolean;
  /** Post-processing and expensive material features. */
  richMaterials: boolean;
  /** Distance at which an NPC drops to reduced-frequency animation. */
  npcAnimationDistance: number;
  /** Milliseconds between updates for NPCs past that distance. */
  distantNpcIntervalMs: number;
  /** Distance past which an NPC simulates logically only. */
  npcSimulationDistance: number;
  /** Hard ceiling on fully simulated NPCs, whatever the distances say. */
  maxFullySimulatedNpcs: number;
}

const PRESETS: Record<Exclude<QualityPreset, 'auto'>, QualitySettings> = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 256,
    shadowDistance: 0,
    decorativeProps: 0.5,
    particles: false,
    richMaterials: false,
    npcAnimationDistance: 12,
    distantNpcIntervalMs: 200,
    npcSimulationDistance: 26,
    maxFullySimulatedNpcs: 6,
  },
  medium: {
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 512,
    shadowDistance: 18,
    decorativeProps: 0.8,
    particles: true,
    richMaterials: false,
    npcAnimationDistance: 18,
    distantNpcIntervalMs: 120,
    npcSimulationDistance: 36,
    maxFullySimulatedNpcs: 9,
  },
  high: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 1024,
    shadowDistance: 28,
    decorativeProps: 1,
    particles: true,
    richMaterials: true,
    npcAnimationDistance: 26,
    distantNpcIntervalMs: 80,
    npcSimulationDistance: 50,
    maxFullySimulatedNpcs: 14,
  },
  ultra: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    shadowDistance: 40,
    decorativeProps: 1,
    particles: true,
    richMaterials: true,
    npcAnimationDistance: 40,
    distantNpcIntervalMs: 60,
    npcSimulationDistance: 80,
    maxFullySimulatedNpcs: 32,
  },
};

export interface DeviceHints {
  /** window.devicePixelRatio. */
  pixelRatio: number;
  /** navigator.hardwareConcurrency, when the browser admits to one. */
  cores: number | null;
  /** navigator.deviceMemory in GB, where supported. */
  memoryGb: number | null;
  /** Coarse pointer / small viewport - treated as a phone or tablet. */
  touch: boolean;
  /** Longest viewport edge in CSS pixels. */
  maxViewportEdge: number;
}

/**
 * The starting preset for a device we know nothing about yet.
 *
 * Deliberately cautious on mobile. Guessing High on a phone and dropping to Low
 * three seconds later is a worse first impression than starting at Medium and
 * climbing, and the climb is what the adaptive pass below is for.
 */
export function recommendPreset(hints: DeviceHints): Exclude<QualityPreset, 'auto'> {
  const { cores, memoryGb, touch, maxViewportEdge } = hints;

  if (touch) {
    // iPhone memory is the constraint that bites first, and it bites as a
    // crash rather than a stutter, so a phone starts no higher than Medium.
    if ((memoryGb !== null && memoryGb <= 3) || (cores !== null && cores <= 4)) return 'low';
    return 'medium';
  }
  if (cores !== null && cores <= 2) return 'low';
  if (memoryGb !== null && memoryGb <= 4) return 'medium';
  if ((cores ?? 0) >= 8 && maxViewportEdge >= 2000) return 'ultra';
  return 'high';
}

export const settingsForPreset = (
  preset: QualityPreset,
  hints?: DeviceHints,
): QualitySettings => {
  const resolved: Exclude<QualityPreset, 'auto'> = preset === 'auto'
    ? (hints ? recommendPreset(hints) : 'medium')
    : preset;
  return PRESETS[resolved];
};

/** Which concrete preset an 'auto' selection resolves to right now. */
export const resolvePreset = (
  preset: QualityPreset,
  hints?: DeviceHints,
): Exclude<QualityPreset, 'auto'> =>
  preset === 'auto' ? (hints ? recommendPreset(hints) : 'medium') : preset;

/**
 * The adaptive step down, applied on top of a chosen preset when frames are
 * being missed. It never changes the player's selection - it changes what we
 * do with it, and it is reversible.
 */
export function applyAdaptiveDegradation(settings: QualitySettings, reduced: boolean): QualitySettings {
  if (!reduced) return settings;
  return {
    ...settings,
    maxPixelRatio: Math.min(settings.maxPixelRatio, 1),
    shadows: false,
    shadowDistance: 0,
    decorativeProps: Math.min(settings.decorativeProps, 0.6),
    particles: false,
    npcAnimationDistance: Math.min(settings.npcAnimationDistance, 12),
    distantNpcIntervalMs: Math.max(settings.distantNpcIntervalMs, 200),
    maxFullySimulatedNpcs: Math.min(settings.maxFullySimulatedNpcs, 6),
  };
}

/** The effective pixel ratio, respecting both the preset and the display. */
export const effectivePixelRatio = (settings: QualitySettings, devicePixelRatio: number): number =>
  Math.max(1, Math.min(settings.maxPixelRatio, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));

/**
 * The guarantee, enforced rather than promised.
 *
 * Every preset must still simulate at least one NPC, must still let distant
 * NPCs update on some interval rather than never, and must keep a simulation
 * radius large enough to cover the room the player is standing in. A preset
 * that violates any of these has removed gameplay, not fidelity.
 */
export function assertPreservesGameplay(settings: QualitySettings): string[] {
  const problems: string[] = [];
  if (settings.maxFullySimulatedNpcs < 1) problems.push('a preset must fully simulate at least one NPC');
  if (settings.distantNpcIntervalMs <= 0) problems.push('distant NPCs must still update on some interval, never zero');
  if (!Number.isFinite(settings.distantNpcIntervalMs) || settings.distantNpcIntervalMs > 1000) {
    problems.push('distant NPCs must update at least once a second or they read as frozen');
  }
  if (settings.npcSimulationDistance < 20) problems.push('the simulation radius must cover the room the player is in');
  if (settings.npcAnimationDistance <= 0) problems.push('nearby NPCs must always animate');
  if (settings.maxPixelRatio < 1) problems.push('render resolution must never drop below 1x');
  return problems;
}

export const allPresetSettings = (): Record<Exclude<QualityPreset, 'auto'>, QualitySettings> => ({ ...PRESETS });
