/**
 * Time-of-day lighting, derived from the canonical clock.
 *
 * The clock has been running since 4A but nothing looked at it: the sun was the
 * literal vector [10, 20, 10] and the only thing that changed the lighting was
 * the Imagination Mode toggle. So a full 9:00-to-17:30 day looked identical at
 * 9am and 5pm.
 *
 * This table is keyed by MINUTE rather than by schedule block, deliberately. The
 * blocks carry a coarse per-block lighting intent reserved for a later phase;
 * driving the sun from it would step the light five times a day instead of
 * moving it continuously, and dusk would arrive as a jump cut. Those reserved
 * fields stay inert, and the guard in clock.test.ts still holds.
 *
 * The approach is a keyframe table interpolated by minute, NOT a simulated sun.
 * A physically modelled sky costs frames on a phone to buy accuracy nobody asked
 * of this art style; a handful of lerps between authored colours costs nothing
 * and is directly art-directable. Everything here is pure, so the whole day can
 * be asserted in a unit test rather than eyeballed.
 */

import { DAY_END_MINUTE, DAY_START_MINUTE } from './gameClock';
import type { WeatherKind } from './weather';

export interface SkyState {
  /** Direction of the key light. Length is arbitrary; only direction matters. */
  sunPosition: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  ambientIntensity: number;
  ambientColor: string;
  /** drei <Sky> tuning. Higher rayleigh = more scattering = redder horizon. */
  rayleigh: number;
  mieCoefficient: number;
  /** null means no fog at all - the common case, and the cheapest. */
  fog: { color: string; near: number; far: number } | null;
  /** Warm glow through windows, used by the indoor fill light. */
  windowLight: string;
  windowIntensity: number;
}

interface Keyframe extends SkyState {
  minute: number;
}

const hm = (hour: number, minute = 0) => hour * 60 + minute;

/**
 * The authored day. Sun elevation rises to noon and falls to a low, long
 * late-afternoon angle; colour walks from cool morning through neutral midday to
 * warm gold. Night exists as real keyframes so Story sequences and after-hours
 * events can ask for it, but the ordinary daycare day ends at 17:30 and never
 * reaches them on its own.
 */
const DAY_KEYFRAMES: Keyframe[] = [
  {
    minute: hm(5),
    sunPosition: [-18, 2, 6],
    sunIntensity: 0.25,
    sunColor: '#5a6f9c',
    ambientIntensity: 0.34,
    ambientColor: '#7c8bb5',
    rayleigh: 3.2,
    mieCoefficient: 0.012,
    fog: { color: '#8e9ec2', near: 12, far: 58 },
    windowLight: '#8fa0c8',
    windowIntensity: 0.18,
  },
  {
    minute: hm(7),
    sunPosition: [-16, 6, 8],
    sunIntensity: 0.72,
    sunColor: '#ffc48a',
    ambientIntensity: 0.5,
    ambientColor: '#cdd6ea',
    rayleigh: 1.9,
    mieCoefficient: 0.009,
    fog: { color: '#cfd8e8', near: 18, far: 72 },
    windowLight: '#ffd2a1',
    windowIntensity: 0.3,
  },
  {
    minute: hm(9),
    sunPosition: [-10, 14, 10],
    sunIntensity: 0.95,
    sunColor: '#fff0dc',
    ambientIntensity: 0.66,
    ambientColor: '#ffffff',
    rayleigh: 0.9,
    mieCoefficient: 0.006,
    fog: null,
    windowLight: '#ffe9cc',
    windowIntensity: 0.34,
  },
  {
    minute: hm(12),
    sunPosition: [1, 22, 3],
    sunIntensity: 1.08,
    sunColor: '#ffffff',
    ambientIntensity: 0.74,
    ambientColor: '#ffffff',
    rayleigh: 0.5,
    mieCoefficient: 0.005,
    fog: null,
    windowLight: '#fff6e8',
    windowIntensity: 0.28,
  },
  {
    minute: hm(15),
    sunPosition: [12, 15, -4],
    sunIntensity: 1,
    sunColor: '#ffeccd',
    ambientIntensity: 0.68,
    ambientColor: '#fff6ec',
    rayleigh: 0.9,
    mieCoefficient: 0.006,
    fog: null,
    windowLight: '#ffe3bd',
    windowIntensity: 0.34,
  },
  {
    minute: hm(17),
    // Golden hour: the sun is low and to the west, which is what makes the
    // pickup hour read as late afternoon rather than as noon with a filter.
    sunPosition: [19, 5.5, -9],
    sunIntensity: 0.86,
    sunColor: '#ffb46b',
    ambientIntensity: 0.56,
    ambientColor: '#ffe0c4',
    rayleigh: 2.4,
    mieCoefficient: 0.011,
    fog: { color: '#f0c69a', near: 22, far: 80 },
    windowLight: '#ffbe7a',
    windowIntensity: 0.46,
  },
  {
    minute: hm(18, 30),
    sunPosition: [21, 1.4, -12],
    sunIntensity: 0.5,
    sunColor: '#ff8b52',
    ambientIntensity: 0.44,
    ambientColor: '#e7b79c',
    rayleigh: 3.6,
    mieCoefficient: 0.016,
    fog: { color: '#d79a76', near: 16, far: 64 },
    windowLight: '#ff9d5c',
    windowIntensity: 0.6,
  },
  {
    minute: hm(20),
    sunPosition: [16, -1.2, -14],
    sunIntensity: 0.2,
    sunColor: '#6d6ea8',
    ambientIntensity: 0.32,
    ambientColor: '#7b7cae',
    rayleigh: 3.4,
    mieCoefficient: 0.02,
    fog: { color: '#5c5f8c', near: 12, far: 52 },
    windowLight: '#ffd08a',
    windowIntensity: 0.75,
  },
  {
    minute: hm(23, 59),
    sunPosition: [0, -8, -10],
    sunIntensity: 0.08,
    sunColor: '#3d4470',
    ambientIntensity: 0.26,
    ambientColor: '#4a5182',
    rayleigh: 2.2,
    mieCoefficient: 0.02,
    fog: { color: '#2f3557', near: 10, far: 46 },
    windowLight: '#ffcf87',
    windowIntensity: 0.85,
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const toHex = (value: number) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');

export function mixColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return `#${toHex(lerp(r1, r2, t))}${toHex(lerp(g1, g2, t))}${toHex(lerp(b1, b2, t))}`;
}

function lerpFog(a: Keyframe['fog'], b: Keyframe['fog'], t: number): SkyState['fog'] {
  if (!a && !b) return null;
  // Fading in or out: hold the colour and pull the fog wall away, so it arrives
  // gradually instead of popping on at a keyframe.
  if (!a && b) return { color: b.color, near: lerp(200, b.near, t), far: lerp(400, b.far, t) };
  if (a && !b) return { color: a.color, near: lerp(a.near, 200, t), far: lerp(a.far, 400, t) };
  return {
    color: mixColor(a!.color, b!.color, t),
    near: lerp(a!.near, b!.near, t),
    far: lerp(a!.far, b!.far, t),
  };
}

/** Lighting for a minute of the day, with no weather applied. */
export function skyAtMinute(minute: number): SkyState {
  const m = Math.min(hm(23, 59), Math.max(hm(5), minute));
  let before = DAY_KEYFRAMES[0];
  let after = DAY_KEYFRAMES[DAY_KEYFRAMES.length - 1];
  for (let index = 0; index < DAY_KEYFRAMES.length - 1; index += 1) {
    if (m >= DAY_KEYFRAMES[index].minute && m <= DAY_KEYFRAMES[index + 1].minute) {
      before = DAY_KEYFRAMES[index];
      after = DAY_KEYFRAMES[index + 1];
      break;
    }
  }
  const span = after.minute - before.minute;
  const t = span <= 0 ? 0 : (m - before.minute) / span;

  return {
    sunPosition: [
      lerp(before.sunPosition[0], after.sunPosition[0], t),
      lerp(before.sunPosition[1], after.sunPosition[1], t),
      lerp(before.sunPosition[2], after.sunPosition[2], t),
    ],
    sunIntensity: lerp(before.sunIntensity, after.sunIntensity, t),
    sunColor: mixColor(before.sunColor, after.sunColor, t),
    ambientIntensity: lerp(before.ambientIntensity, after.ambientIntensity, t),
    ambientColor: mixColor(before.ambientColor, after.ambientColor, t),
    rayleigh: lerp(before.rayleigh, after.rayleigh, t),
    mieCoefficient: lerp(before.mieCoefficient, after.mieCoefficient, t),
    fog: lerpFog(before.fog, after.fog, t),
    windowLight: mixColor(before.windowLight, after.windowLight, t),
    windowIntensity: lerp(before.windowIntensity, after.windowIntensity, t),
  };
}

/**
 * How much each weather state damps and greys the sky.
 *
 * Applied on top of the time keyframes rather than as its own table, so a rainy
 * golden hour is still recognisably golden hour. Indoor readability is the
 * constraint that sets the floors: ambient never drops below 0.42, because the
 * player has to be able to see the classroom.
 */
const WEATHER_GRADE: Record<WeatherKind, {
  sun: number; ambient: number; grey: number; rayleigh: number; mie: number; fog: number;
}> = {
  clear: { sun: 1, ambient: 1, grey: 0, rayleigh: 1, mie: 1, fog: 1 },
  cloudy: { sun: 0.68, ambient: 0.94, grey: 0.35, rayleigh: 1.5, mie: 1.8, fog: 0.85 },
  rain: { sun: 0.42, ambient: 0.86, grey: 0.6, rayleigh: 2.6, mie: 3, fog: 0.55 },
  'heavy-rain': { sun: 0.3, ambient: 0.8, grey: 0.72, rayleigh: 3.2, mie: 3.8, fog: 0.4 },
  storm: { sun: 0.24, ambient: 0.76, grey: 0.8, rayleigh: 3.6, mie: 4.2, fog: 0.32 },
};

const OVERCAST = '#9aa6b8';
const MIN_INDOOR_AMBIENT = 0.42;

export function applyWeatherToSky(sky: SkyState, weather: WeatherKind, blend = 1): SkyState {
  const grade = WEATHER_GRADE[weather] ?? WEATHER_GRADE.clear;
  const t = Math.min(1, Math.max(0, blend));
  const mix = (base: number, target: number) => lerp(base, target, t);

  const fog = sky.fog
    ? { color: mixColor(sky.fog.color, OVERCAST, grade.grey * t), near: mix(sky.fog.near, sky.fog.near * grade.fog), far: mix(sky.fog.far, sky.fog.far * grade.fog) }
    : grade.fog < 1
      // Overcast weather brings its own fog even on a clear-sky keyframe; it is
      // what makes rain read as weather rather than as a dimmer switch.
      ? { color: OVERCAST, near: lerp(200, 14, t), far: lerp(400, 70, t) }
      : null;

  return {
    ...sky,
    sunIntensity: mix(sky.sunIntensity, sky.sunIntensity * grade.sun),
    sunColor: mixColor(sky.sunColor, OVERCAST, grade.grey * 0.55 * t),
    ambientIntensity: Math.max(MIN_INDOOR_AMBIENT, mix(sky.ambientIntensity, sky.ambientIntensity * grade.ambient)),
    ambientColor: mixColor(sky.ambientColor, OVERCAST, grade.grey * 0.4 * t),
    rayleigh: mix(sky.rayleigh, sky.rayleigh * grade.rayleigh),
    mieCoefficient: mix(sky.mieCoefficient, sky.mieCoefficient * grade.mie),
    fog,
    // Indoors gets warmer and stronger as it darkens outside.
    windowIntensity: mix(sky.windowIntensity, sky.windowIntensity * (1 + grade.grey * 0.7)),
  };
}

export function skyFor(minute: number, weather: WeatherKind, blend = 1): SkyState {
  return applyWeatherToSky(skyAtMinute(minute), weather, blend);
}

/**
 * True while the ordinary daycare day is running.
 *
 * Deliberately does NOT clamp: clampToDay folds any time back inside 9:00-17:30,
 * which would make this answer "yes" for 10pm and defeat the whole question.
 * Night-time Story sequences need to be able to ask it honestly.
 */
export function isDaycareHours(minute: number): boolean {
  return Number.isFinite(minute) && minute >= DAY_START_MINUTE && minute <= DAY_END_MINUTE;
}

/**
 * Quantise the minute before rebuilding lighting. The clock ticks four times a
 * second; recomputing colours and pushing new props at 4 Hz would churn React
 * for changes no eye can see. Two game minutes is four real seconds at 1x.
 */
export const LIGHTING_QUANTUM_MINUTES = 2;

export function lightingMinute(minute: number): number {
  return Math.round(minute / LIGHTING_QUANTUM_MINUTES) * LIGHTING_QUANTUM_MINUTES;
}
