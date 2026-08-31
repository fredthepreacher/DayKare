/**
 * Weather.
 *
 * There was no weather system before this - only `isRainy`, a manual HUD toggle
 * that swapped two Sky parameters, changed which stations NPCs walked to, and
 * drew no precipitation at all.
 *
 * Three properties matter more than the simulation:
 *
 * 1. DETERMINISTIC. The forecast is a pure function of the day number and a save
 *    seed, so the same save always sees the same weather on the same day. Random
 *    weather would mean a quest that only works outdoors could roll rain forever
 *    on one player's save and never on another's, and neither could be
 *    reproduced from a bug report.
 * 2. SAVE-SAFE. Only the seed is persisted. Everything else is derived, so no
 *    migration can leave weather in an impossible state, and an old save simply
 *    starts forecasting from its day number.
 * 3. TRANSITIONAL. Weather changes across a blend window rather than popping, and
 *    the blend is computed from the clock rather than accumulated, so pausing,
 *    fast-forwarding and reloading all behave.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'heavy-rain' | 'storm';

/**
 * Only the first three ship now. 'heavy-rain' and 'storm' are authored through
 * the whole pipeline - grading, particle budget, NPC response - so enabling them
 * later is a change to this list, not a change to the system.
 */
export const ACTIVE_WEATHER: readonly WeatherKind[] = ['clear', 'cloudy', 'rain'] as const;

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain',
  'heavy-rain': 'Heavy Rain',
  storm: 'Storm',
};

/** Is this weather wet enough to draw precipitation and keep children inside? */
export function isWet(weather: WeatherKind): boolean {
  return weather === 'rain' || weather === 'heavy-rain' || weather === 'storm';
}

/**
 * Rain particle budget per quality preset. These are camera-local instances in a
 * single InstancedMesh, not physics bodies: the whole effect is one draw call
 * and one matrix write per instance per frame, and it degrades to nothing when
 * the quality manager turns particles off.
 */
export const RAIN_BUDGET: Record<WeatherKind, number> = {
  clear: 0,
  cloudy: 0,
  rain: 420,
  'heavy-rain': 900,
  storm: 1200,
};

/** FNV-1a. Same hash the save layer already uses, for the same reason: stable. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * The forecast. Weighted so most days are pleasant: a daycare that rains half
 * the time would spend half its playtime indoors.
 */
const FORECAST_TABLE: WeatherKind[] = [
  'clear', 'clear', 'clear', 'clear', 'clear',
  'cloudy', 'cloudy', 'cloudy',
  'rain', 'rain',
];

export function forecastFor(dayNumber: number, seed: number): WeatherKind {
  const day = Number.isFinite(dayNumber) ? Math.max(1, Math.floor(dayNumber)) : 1;
  const index = hash(`${seed >>> 0}:${day}`) % FORECAST_TABLE.length;
  const candidate = FORECAST_TABLE[index];
  return ACTIVE_WEATHER.includes(candidate) ? candidate : 'clear';
}

/**
 * Weather can turn once mid-afternoon, so a day is not one flat state. The turn
 * is derived from the same seed, so it too is reproducible.
 */
export const WEATHER_TURN_MINUTE = 13 * 60 + 30;

/** How long a change takes, in game minutes. 45 is about 90 real seconds at 1x. */
export const WEATHER_BLEND_MINUTES = 45;

export function secondForecastFor(dayNumber: number, seed: number): WeatherKind {
  const day = Number.isFinite(dayNumber) ? Math.max(1, Math.floor(dayNumber)) : 1;
  const roll = hash(`turn:${seed >>> 0}:${day}`) % 100;
  const morning = forecastFor(day, seed);
  // Most days do not turn at all. A turn that happens goes one step wetter or
  // one step drier, never clear-to-storm.
  if (roll < 62) return morning;
  const ladder: WeatherKind[] = ['clear', 'cloudy', 'rain'];
  const position = Math.max(0, ladder.indexOf(morning));
  const direction = roll % 2 === 0 ? 1 : -1;
  const next = ladder[Math.min(ladder.length - 1, Math.max(0, position + direction))];
  return ACTIVE_WEATHER.includes(next) ? next : morning;
}

export interface WeatherView {
  /** What it is now, for gameplay decisions. */
  weather: WeatherKind;
  /** What it is turning into, if a change is in progress. */
  incoming: WeatherKind;
  /** 0 to 1 through the change. 1 means settled. */
  blend: number;
  label: string;
}

/**
 * The whole weather state for a moment, derived rather than stored.
 *
 * `manualOverride` is the old `isRainy` HUD toggle, kept working: when the
 * player forces rain, the forecast steps aside. Removing that button would break
 * a control the owner uses to test outdoor behaviour on demand.
 */
export function weatherAt(
  dayNumber: number,
  minute: number,
  seed: number,
  manualOverride: WeatherKind | null = null,
): WeatherView {
  if (manualOverride) {
    return { weather: manualOverride, incoming: manualOverride, blend: 1, label: WEATHER_LABELS[manualOverride] };
  }

  const morning = forecastFor(dayNumber, seed);
  const afternoon = secondForecastFor(dayNumber, seed);

  if (morning === afternoon) {
    return { weather: morning, incoming: morning, blend: 1, label: WEATHER_LABELS[morning] };
  }

  if (minute < WEATHER_TURN_MINUTE) {
    return { weather: morning, incoming: morning, blend: 1, label: WEATHER_LABELS[morning] };
  }

  const through = (minute - WEATHER_TURN_MINUTE) / WEATHER_BLEND_MINUTES;
  if (through >= 1) {
    return { weather: afternoon, incoming: afternoon, blend: 1, label: WEATHER_LABELS[afternoon] };
  }

  // Mid-change. Gameplay reads the destination as soon as the change is more
  // than half done, so NPCs do not dither on the threshold.
  const settled = through >= 0.5 ? afternoon : morning;
  return {
    weather: settled,
    incoming: afternoon,
    blend: Math.min(1, Math.max(0, through)),
    label: `${WEATHER_LABELS[morning]} → ${WEATHER_LABELS[afternoon]}`,
  };
}

/** Seeds are persisted, so they must survive a hostile save. */
export function normalizeWeatherSeed(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(Math.abs(value)) % 0xffffffff;
  return 0x5eed;
}
