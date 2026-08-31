import { useMemo } from 'react';
import { useGameStore } from './store';
import { weatherAt, isWet, type WeatherKind } from './weather';
import { lightingMinute, skyFor, type SkyState } from './timeOfDay';
import { RainEffect } from './RainEffect';
import { WORLD_WALKABLE_REGIONS, type GameZone } from './world';

/**
 * The bridge between the clock, the weather forecast and what gets rendered.
 *
 * Kept as one hook plus one component so the sky, the fog and the rain can never
 * disagree about what the weather is - which is exactly what would happen if
 * each read the store separately and quantised the minute differently.
 */

/** Where the player is standing, for the one thing that cares: rain has a roof. */
function isOutdoors(zone: GameZone, x: number, z: number): boolean {
  if (zone === 'garden') return true;
  const playground = WORLD_WALKABLE_REGIONS.find((region) => region.id === 'playground');
  if (!playground) return false;
  return x >= playground.minX && x <= playground.maxX && z >= playground.minZ && z <= playground.maxZ;
}

export interface WeatherSnapshot {
  weather: WeatherKind;
  label: string;
  blend: number;
  sky: SkyState;
  wet: boolean;
  outdoors: boolean;
}

export function useWeather(): WeatherSnapshot {
  const minute = useGameStore((state) => state.clock.minute);
  const dayNumber = useGameStore((state) => state.dayNumber);
  const weatherSeed = useGameStore((state) => state.weatherSeed);
  const isRainy = useGameStore((state) => state.isRainy);
  const zone = useGameStore((state) => state.zone);
  const playerPosition = useGameStore((state) => state.playerPosition);

  // The clock ticks 4x a second. Quantising here means the lighting is rebuilt
  // once every couple of game minutes instead of on every tick, which keeps this
  // off React's hot path entirely.
  const quantised = lightingMinute(minute);

  return useMemo(() => {
    // The existing HUD rain button stays authoritative when the player uses it:
    // it is how outdoor behaviour gets tested on demand.
    const view = weatherAt(dayNumber, quantised, weatherSeed, isRainy ? 'rain' : null);
    return {
      weather: view.weather,
      label: view.label,
      blend: view.blend,
      sky: skyFor(quantised, view.weather, view.blend),
      wet: isWet(view.weather),
      outdoors: isOutdoors(zone, playerPosition[0], playerPosition[2]),
    };
  }, [dayNumber, quantised, weatherSeed, isRainy, zone, playerPosition]);
}

/**
 * Precipitation. Mounted only when the player can actually see sky - the hub has
 * a roof over everything but the playground, so rain indoors would be a bug.
 */
export function WeatherEffects() {
  const { weather, wet, outdoors, blend } = useWeather();
  if (!wet || !outdoors) return null;
  return <RainEffect weather={weather} intensity={blend} />;
}

/**
 * Is it wet right now, for gameplay?
 *
 * NPC stations and teacher patrol routes already branched on `isRainy`; this is
 * the same question with the forecast folded in, so a rainy day moves children
 * to the indoor stations without the player having to press the HUD toggle. The
 * toggle still forces rain on demand, which is how outdoor behaviour gets tested.
 */
export function useIsRainy(): boolean {
  const minute = useGameStore((state) => state.clock.minute);
  const dayNumber = useGameStore((state) => state.dayNumber);
  const weatherSeed = useGameStore((state) => state.weatherSeed);
  const manual = useGameStore((state) => state.isRainy);
  const quantised = lightingMinute(minute);
  return useMemo(
    () => manual || isWet(weatherAt(dayNumber, quantised, weatherSeed, null).weather),
    [manual, dayNumber, quantised, weatherSeed],
  );
}

/** The label for the HUD weather chip. */
export function useWeatherLabel(): string {
  const minute = useGameStore((state) => state.clock.minute);
  const dayNumber = useGameStore((state) => state.dayNumber);
  const weatherSeed = useGameStore((state) => state.weatherSeed);
  const manual = useGameStore((state) => state.isRainy);
  const quantised = lightingMinute(minute);
  return useMemo(
    () => weatherAt(dayNumber, quantised, weatherSeed, manual ? 'rain' : null).label,
    [manual, dayNumber, quantised, weatherSeed],
  );
}
