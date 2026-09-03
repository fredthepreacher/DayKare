/**
 * Colour themes for the two interiors the player owns.
 *
 * A theme is a small palette applied to walls, trim and a few furnishings —
 * not a room editor. That keeps the whole feature to one selector and a
 * lookup, and it costs nothing at runtime because the colours are constants
 * the meshes read directly.
 */

export interface InteriorPalette {
  id: string;
  label: string;
  /** Wall colour per floor band, and the trim that ties them together. */
  wallGround: string;
  wallUpper: string;
  wallBasement: string;
  trim: string;
  /** Floor slabs. */
  floorGround: string;
  floorUpper: string;
  floorBasement: string;
  /** A soft accent used on soft furnishings. */
  accent: string;
}

export const HOME_THEMES: readonly InteriorPalette[] = [
  {
    id: 'cozy-warm',
    label: 'Cozy Warm Neutral',
    wallGround: '#f6d9a8',
    wallUpper: '#e8cfe4',
    wallBasement: '#c3b6a4',
    trim: '#b98d63',
    floorGround: '#d8b98c',
    floorUpper: '#cfa9c6',
    floorBasement: '#9d9182',
    accent: '#c98fae',
  },
  {
    id: 'cool-pastel',
    label: 'Cool Playful Pastel',
    wallGround: '#dfeaf3',
    wallUpper: '#e3e8f7',
    wallBasement: '#c2ccd4',
    trim: '#8fb6c9',
    floorGround: '#c7d8e2',
    floorUpper: '#cdd6ee',
    floorBasement: '#93a0a8',
    accent: '#8fd4c4',
  },
];

export interface GaragePalette {
  id: string;
  label: string;
  wall: string;
  floor: string;
  /** Painted bay markings. */
  marking: string;
  /** Racks, shelving and hooks. */
  fixture: string;
  signage: string;
}

export const GARAGE_THEMES: readonly GaragePalette[] = [
  {
    id: 'warm-family',
    label: 'Warm Family',
    wall: '#e4d6bf',
    floor: '#a9a396',
    marking: '#d8b26a',
    fixture: '#9a7d5c',
    signage: '#8a5a44',
  },
  {
    id: 'cool-modern',
    label: 'Cool Modern Gray',
    wall: '#d3d6d9',
    floor: '#8e9296',
    marking: '#c2ccd2',
    fixture: '#5f6a72',
    signage: '#3f484e',
  },
  {
    id: 'playful-pastel',
    label: 'Playful Pastel',
    wall: '#f4e2ef',
    floor: '#c9b7c4',
    marking: '#8fd4c4',
    fixture: '#c98fae',
    signage: '#7c4dff',
  },
];

const wrap = (index: number, length: number) => ((Math.floor(index) % length) + length) % length;

/** Themes are stored as an index; a corrupted save falls back to the first. */
export function homeTheme(index: number): InteriorPalette {
  return HOME_THEMES[Number.isFinite(index) ? wrap(index, HOME_THEMES.length) : 0];
}

export function garageTheme(index: number): GaragePalette {
  return GARAGE_THEMES[Number.isFinite(index) ? wrap(index, GARAGE_THEMES.length) : 0];
}

export const nextHomeTheme = (index: number) => wrap(index + 1, HOME_THEMES.length);
export const nextGarageTheme = (index: number) => wrap(index + 1, GARAGE_THEMES.length);
