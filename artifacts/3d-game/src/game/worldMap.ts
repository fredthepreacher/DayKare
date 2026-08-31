/**
 * Map geometry, derived from the same world data the game actually simulates.
 *
 * The previous map was four absolutely-positioned divs reading "Art", "Storage"
 * and "Playground" at invented percentages. It omitted the classroom and the
 * hallway - the two largest rooms - drew Art and Storage side by side when they
 * are mirrored across the hallway, and had no player marker, so it could not be
 * used to find anything. Worse, being hand-authored, it could never stay true:
 * moving a wall in world.ts would not move it.
 *
 * Everything here reads WORLD_WALKABLE_REGIONS, WORLD_PORTALS, WORLD_ANCHORS,
 * WORLD_SOLIDS and HUB_ROUTES, so the map is a projection of the world rather
 * than a picture of it.
 *
 * Deliberately NOT included: fast travel. Zone travel stays diegetic, through
 * the existing portals and interactables.
 */

import {
  WORLD_ANCHORS,
  WORLD_PORTALS,
  WORLD_SOLIDS,
  WORLD_WALKABLE_REGIONS,
  ZONE_LABELS,
  type GameZone,
} from './world';
import { HUB_ROUTES, isRouteUnlocked, requirementProgressLabel, type ProgressionState } from './progression';

export interface MapRect {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MapDoor {
  id: string;
  /** Endpoints of the doorway line, in world units. */
  from: { x: number; z: number };
  to: { x: number; z: number };
}

export type MapPinKind = 'activity' | 'business' | 'route-open' | 'route-locked' | 'landmark' | 'player';

export interface MapPin {
  id: string;
  label: string;
  x: number;
  z: number;
  kind: MapPinKind;
  /** Shown under the label for locked routes. */
  detail?: string;
}

export interface MapView {
  zone: GameZone;
  zoneLabel: string;
  /** SVG viewBox in world units, with a small margin. */
  viewBox: { minX: number; minZ: number; width: number; height: number };
  rooms: MapRect[];
  walls: MapRect[];
  doors: MapDoor[];
  pins: MapPin[];
}

/**
 * Human names for the room ids. WORLD_WALKABLE_REGIONS carries no label field,
 * and "art-room" is not what a five-year-old's journal would call it.
 */
const ROOM_LABELS: Record<string, string> = {
  classroom: 'Classroom',
  hallway: 'Hallway',
  'art-room': 'Art Room',
  storage: 'Storage',
  playground: 'Playground',
  garden: 'Garden District',
};

/**
 * Names for the activity anchors. These double as the map's points of interest,
 * and each already carries the room and the schedule activity it belongs to.
 */
const ANCHOR_LABELS: Record<string, string> = {
  'classroom-circle': 'Circle Time',
  'art-table': 'Art Table',
  'storage-shelves': 'Storage Shelves',
  'juice-counter': 'Juice Club',
  'playground-loop': 'Playground',
  'pickup-line': 'Pickup',
  'tidy-station': 'Rainbow Tidy-Up',
};

/**
 * Anchors that would give away something the player should discover are left
 * off the map on purpose. Storage is where Binky is hidden; naming the shelves
 * before the quest sends you there removes the only search in the game.
 */
const SECRET_ANCHORS = new Set(['storage-shelves']);

const BUSINESS_ANCHORS = new Set(['juice-counter']);

const GARDEN_PINS: MapPin[] = [
  { id: 'garden-pond', label: 'Pond', x: 6.42, z: -0.2, kind: 'landmark' },
  { id: 'garden-gazebo', label: 'Gazebo', x: 0, z: 2.45, kind: 'landmark' },
  { id: 'garden-greenhouse', label: 'Greenhouse', x: -7.9, z: -8.5, kind: 'landmark' },
  { id: 'garden-bed-west', label: 'West Bed', x: -10.8, z: 2.8, kind: 'activity' },
  { id: 'garden-bed-east', label: 'East Bed', x: 10.8, z: 9.8, kind: 'activity' },
  { id: 'garden-return', label: 'Gate back to DayKare', x: 0, z: 16, kind: 'route-open' },
];

function portalDoor(portal: (typeof WORLD_PORTALS)[number]): MapDoor {
  const [x, , z] = portal.position;
  const half = portal.width / 2;
  return portal.axis === 'x'
    ? { id: portal.id, from: { x, z: z - half }, to: { x, z: z + half } }
    : { id: portal.id, from: { x: x - half, z }, to: { x: x + half, z } };
}

export interface MapInput {
  zone: GameZone;
  progression: ProgressionState;
  /** Live player position, for the "you are here" marker. */
  playerX: number;
  playerZ: number;
}

export function buildMapView(input: MapInput): MapView {
  const { zone, progression } = input;

  const rooms: MapRect[] = WORLD_WALKABLE_REGIONS
    .filter((region) => (zone === 'garden' ? region.id === 'garden' : region.id !== 'garden'))
    .map((region) => ({
      id: region.id,
      label: ROOM_LABELS[region.id] ?? region.id,
      minX: region.minX,
      maxX: region.maxX,
      minZ: region.minZ,
      maxZ: region.maxZ,
    }));

  const walls: MapRect[] = WORLD_SOLIDS
    .filter((solid) => solid.zone === zone && (solid.kind === 'wall' || solid.kind === 'boundary'))
    .map((solid) => ({
      id: solid.id,
      label: '',
      minX: solid.minX,
      maxX: solid.maxX,
      minZ: solid.minZ,
      maxZ: solid.maxZ,
    }));

  const doors: MapDoor[] = zone === 'hub' ? WORLD_PORTALS.map(portalDoor) : [];

  const pins: MapPin[] = [];

  if (zone === 'hub') {
    for (const anchor of WORLD_ANCHORS) {
      if (SECRET_ANCHORS.has(anchor.id)) continue;
      const label = ANCHOR_LABELS[anchor.id];
      if (!label) continue;
      pins.push({
        id: anchor.id,
        label,
        x: anchor.position[0],
        z: anchor.position[2],
        kind: BUSINESS_ANCHORS.has(anchor.id) ? 'business' : 'activity',
      });
    }

    for (const route of HUB_ROUTES) {
      const unlocked = isRouteUnlocked(route, progression);
      pins.push({
        id: route.id,
        label: route.label,
        x: route.position[0],
        z: route.position[2],
        kind: unlocked ? 'route-open' : 'route-locked',
        // A locked route shows what it needs. Hiding future districts entirely
        // would make the map feel smaller than the game.
        detail: unlocked ? undefined : requirementProgressLabel(route, progression),
      });
    }
  } else {
    pins.push(...GARDEN_PINS);
  }

  pins.push({
    id: 'player',
    label: 'You',
    x: input.playerX,
    z: input.playerZ,
    kind: 'player',
  });

  const bounds = rooms.reduce(
    (acc, room) => ({
      minX: Math.min(acc.minX, room.minX),
      maxX: Math.max(acc.maxX, room.maxX),
      minZ: Math.min(acc.minZ, room.minZ),
      maxZ: Math.max(acc.maxZ, room.maxZ),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );

  const margin = 1.5;
  return {
    zone,
    zoneLabel: ZONE_LABELS[zone],
    viewBox: {
      minX: bounds.minX - margin,
      minZ: bounds.minZ - margin,
      width: bounds.maxX - bounds.minX + margin * 2,
      height: bounds.maxZ - bounds.minZ + margin * 2,
    },
    rooms,
    walls,
    doors,
    pins,
  };
}

/** Clamp a zoom level to something a thumb can still control. */
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 4;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_MAP_ZOOM;
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, zoom));
}

/**
 * Keep the panned view over the map. Pan is expressed in world units and is
 * bounded by how much of the map is off-screen at the current zoom, so the
 * player can never lose the map off the edge of the panel.
 */
export function clampPan(pan: number, extent: number, zoom: number): number {
  const slack = (extent * (zoom - 1)) / (2 * zoom);
  if (!Number.isFinite(pan)) return 0;
  return Math.min(slack, Math.max(-slack, pan));
}

export function visibleViewBox(view: MapView, zoom: number, panX: number, panZ: number) {
  const width = view.viewBox.width / zoom;
  const height = view.viewBox.height / zoom;
  const centreX = view.viewBox.minX + view.viewBox.width / 2 + panX;
  const centreZ = view.viewBox.minZ + view.viewBox.height / 2 + panZ;
  return {
    minX: centreX - width / 2,
    minZ: centreZ - height / 2,
    width,
    height,
  };
}
