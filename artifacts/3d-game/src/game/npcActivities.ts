import * as THREE from 'three';

export type ChildActivity =
  | 'blocks'
  | 'drawing'
  | 'coloring'
  | 'picture-books'
  | 'toy-play'
  | 'singing'
  | 'dancing'
  | 'pretend-play'
  | 'circle-time'
  | 'snacking'
  | 'conversation'
  | 'parallel-play'
  | 'following'
  | 'reacting';

export type ChildActivityMode =
  | 'sitting'
  | 'playing'
  | 'gathering'
  | 'coloring'
  | 'toy-play'
  | 'conversation'
  | 'reading'
  | 'singing'
  | 'dancing'
  | 'pretend-play'
  | 'circle-time'
  | 'snacking'
  | 'following'
  | 'reacting';

export interface ChildActivityPlan {
  activity: ChildActivity;
  mode: ChildActivityMode;
  position: [number, number, number];
  focus: [number, number, number];
  duration: number;
  soloFallback: boolean;
}

type Station = Omit<ChildActivityPlan, 'duration' | 'soloFallback'> & {
  duration: number;
};

const CHILD_ORDER = ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli', 'Noah', 'Lily', 'Finn', 'Ruby', 'Max'];

const HUB_STATIONS: Record<string, Station[]> = {
  'morning-play': [
    { activity: 'blocks', mode: 'toy-play', position: [-2.8, 0, 1.4], focus: [-1.8, 0, 1.4], duration: 6.2 },
    { activity: 'picture-books', mode: 'reading', position: [4.05, 0, -5.05], focus: [4.8, 0, -5.5], duration: 6 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [2.8, 0, 2.6], focus: [1.7, 0, 2.3], duration: 5.7 },
    { activity: 'singing', mode: 'singing', position: [-3.4, 0, -0.8], focus: [-2.3, 0, -0.8], duration: 5.4 },
    { activity: 'toy-play', mode: 'toy-play', position: [3.2, 0, 0.6], focus: [2.2, 0, 0.6], duration: 5.9 },
    { activity: 'parallel-play', mode: 'playing', position: [0.4, 0, 3.4], focus: [0.4, 0, 2.4], duration: 5.6 },
    { activity: 'conversation', mode: 'conversation', position: [-0.2, 0, -1.8], focus: [0.7, 0, -1.8], duration: 5.2 },
    { activity: 'circle-time', mode: 'circle-time', position: [0, 0, 2.3], focus: [0, 0, 1.2], duration: 6.4 },
    { activity: 'conversation', mode: 'conversation', position: [5.2, 0, 3.8], focus: [4.2, 0, 3.3], duration: 5.4 },
    { activity: 'parallel-play', mode: 'playing', position: [-5.2, 0, 4.2], focus: [-4.2, 0, 3.8], duration: 5.8 },
  ],
  'art-time': [
    { activity: 'coloring', mode: 'coloring', position: [-14.5, 0, -10.5], focus: [-13.5, 0, -10.5], duration: 6.2 },
    { activity: 'drawing', mode: 'coloring', position: [-14.1, 0, -11.5], focus: [-13.3, 0, -11.5], duration: 6.4 },
    { activity: 'parallel-play', mode: 'playing', position: [-14.5, 0, -11.6], focus: [-13.6, 0, -11.6], duration: 5.7 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [-14.4, 0, -15], focus: [-13.5, 0, -14.6], duration: 5.5 },
    { activity: 'picture-books', mode: 'reading', position: [-9.35, 0, -10.6], focus: [-10.2, 0, -10.6], duration: 5.8 },
    { activity: 'drawing', mode: 'coloring', position: [-9.35, 0, -11.8], focus: [-10.25, 0, -11.8], duration: 6.1 },
    { activity: 'parallel-play', mode: 'playing', position: [-9.5, 0, -13], focus: [-10.4, 0, -13], duration: 5.6 },
    { activity: 'singing', mode: 'singing', position: [-9.5, 0, -14.2], focus: [-10.4, 0, -14.2], duration: 5.2 },
    { activity: 'conversation', mode: 'conversation', position: [-12.8, 0, -14.7], focus: [-11.8, 0, -14.5], duration: 5.3 },
    { activity: 'picture-books', mode: 'reading', position: [-11.2, 0, -14.7], focus: [-12.1, 0, -14.45], duration: 5.9 },
  ],
  'juice-club': [
    { activity: 'snacking', mode: 'snacking', position: [5.2, 0, -3.8], focus: [4.4, 0, -3.2], duration: 4.6 },
    { activity: 'conversation', mode: 'conversation', position: [4.8, 0, -0.7], focus: [3.8, 0, -0.7], duration: 4.2 },
    { activity: 'picture-books', mode: 'reading', position: [1.1, 0, 1.9], focus: [1.1, 0, 0.9], duration: 4.5 },
    { activity: 'parallel-play', mode: 'playing', position: [-2, 0, -1], focus: [-1, 0, -1], duration: 4.3 },
    { activity: 'following', mode: 'following', position: [0.8, 0, 2.7], focus: [0.8, 0, 1.7], duration: 4 },
    { activity: 'singing', mode: 'singing', position: [-2.2, 0, 0.5], focus: [-1.2, 0, 0.5], duration: 4.1 },
    { activity: 'conversation', mode: 'conversation', position: [-4.6, 0, 4.2], focus: [-3.7, 0, 3.8], duration: 4.4 },
    { activity: 'parallel-play', mode: 'playing', position: [4.8, 0, 4], focus: [3.8, 0, 3.8], duration: 4.5 },
    { activity: 'picture-books', mode: 'reading', position: [-4.8, 0, -4.6], focus: [-3.8, 0, -4.6], duration: 4.6 },
    { activity: 'toy-play', mode: 'toy-play', position: [1.6, 0, -5.7], focus: [1.6, 0, -4.7], duration: 4.5 },
  ],
  'outdoor-play': [
    { activity: 'toy-play', mode: 'toy-play', position: [10.3, 0, -10.7], focus: [11.2, 0, -10.7], duration: 5.8 },
    { activity: 'dancing', mode: 'dancing', position: [13.6, 0, -8.2], focus: [12.7, 0, -8.2], duration: 5.3 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [10.6, 0, -1.6], focus: [11.5, 0, -1.6], duration: 5.5 },
    { activity: 'following', mode: 'following', position: [14.1, 0, 1.1], focus: [13.1, 0, 1.1], duration: 4.8 },
    { activity: 'reacting', mode: 'reacting', position: [13.6, 0, 8.4], focus: [12.6, 0, 8.4], duration: 5.1 },
    { activity: 'parallel-play', mode: 'playing', position: [9.5, 0, 10.5], focus: [10.5, 0, 10.5], duration: 5.6 },
    { activity: 'following', mode: 'following', position: [9.4, 0, 5.4], focus: [10.4, 0, 5.4], duration: 4.9 },
    { activity: 'conversation', mode: 'conversation', position: [14.6, 0, 5.2], focus: [13.6, 0, 5.2], duration: 5.3 },
    { activity: 'toy-play', mode: 'toy-play', position: [10.1, 0, -5.3], focus: [11.1, 0, -5.3], duration: 5.7 },
    { activity: 'dancing', mode: 'dancing', position: [14, 0, -4.8], focus: [13, 0, -4.8], duration: 5.4 },
  ],
  pickup: [
    { activity: 'picture-books', mode: 'reading', position: [-9.2, 0, -5.2], focus: [-10.2, 0, -5.2], duration: 5.8 },
    { activity: 'circle-time', mode: 'circle-time', position: [-9.2, 0, -1.2], focus: [-10.2, 0, -1.2], duration: 5.9 },
    { activity: 'conversation', mode: 'conversation', position: [-9.2, 0, 3.2], focus: [-10.2, 0, 3.2], duration: 5.2 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [-9.2, 0, 1.2], focus: [-10.2, 0, 1.2], duration: 5.4 },
    { activity: 'parallel-play', mode: 'playing', position: [-9.2, 0, 5.2], focus: [-10.2, 0, 5.2], duration: 5.6 },
    { activity: 'singing', mode: 'singing', position: [-9.2, 0, -3.2], focus: [-10.2, 0, -3.2], duration: 5.2 },
    { activity: 'picture-books', mode: 'reading', position: [-12.8, 0, -6], focus: [-11.8, 0, -6], duration: 5.8 },
    { activity: 'conversation', mode: 'conversation', position: [-12.8, 0, -2], focus: [-11.8, 0, -2], duration: 5.3 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [-12.8, 0, 2], focus: [-11.8, 0, 2], duration: 5.4 },
    { activity: 'parallel-play', mode: 'playing', position: [-12.8, 0, 6], focus: [-11.8, 0, 6], duration: 5.6 },
  ],
};

const RAINY_OUTDOOR_STATIONS: Station[] = [
  { activity: 'circle-time', mode: 'circle-time', position: [3.6, 0, -6.7], focus: [2.6, 0, -6.7], duration: 6.1 },
  { activity: 'picture-books', mode: 'reading', position: [3.4, 0, -5.1], focus: [2.4, 0, -5.1], duration: 5.9 },
  { activity: 'blocks', mode: 'toy-play', position: [1.8, 0, -6.2], focus: [0.8, 0, -6.2], duration: 6 },
  { activity: 'singing', mode: 'singing', position: [1.1, 0, -4.8], focus: [0.1, 0, -4.8], duration: 5.3 },
  { activity: 'pretend-play', mode: 'pretend-play', position: [-1.6, 0, -5.6], focus: [-0.6, 0, -5.6], duration: 5.5 },
  { activity: 'parallel-play', mode: 'playing', position: [-3.4, 0, -5.2], focus: [-2.4, 0, -5.2], duration: 5.7 },
  { activity: 'picture-books', mode: 'reading', position: [5.5, 0, -5.2], focus: [4.5, 0, -5.2], duration: 5.9 },
  { activity: 'conversation', mode: 'conversation', position: [5, 0, -4.2], focus: [4, 0, -4.2], duration: 5.3 },
  { activity: 'blocks', mode: 'toy-play', position: [-4.6, 0, -5.85], focus: [-3.6, 0, -5.85], duration: 6 },
  { activity: 'singing', mode: 'singing', position: [-4.8, 0, -3.8], focus: [-3.8, 0, -3.8], duration: 5.3 },
];

function activityHash(name: string) {
  return [...name].reduce((total, character) => (total * 33 + character.charCodeAt(0)) >>> 0, 11);
}

function rotateStations(stations: Station[], name: string, cycle: number, phase: number) {
  const nameIndex = Math.max(0, CHILD_ORDER.indexOf(name));
  // Ten authored slots let the ten-child cast start a schedule without duplicate
  // destinations. The cycle rotates everyone while preserving deterministic order.
  const offset = nameIndex % stations.length;
  return stations[(offset + Math.max(0, cycle)) % stations.length];
}

export function getChildActivityPlan(
  name: string,
  schedule: string,
  rainy: boolean,
  cycle: number,
  phase: number,
): ChildActivityPlan {
  const stations = schedule === 'outdoor-play' && rainy
    ? RAINY_OUTDOOR_STATIONS
    : HUB_STATIONS[schedule] ?? HUB_STATIONS['morning-play'];
  const station = rotateStations(stations, name, cycle, phase);
  const position = [...station.position] as [number, number, number];
  const focus = [...station.focus] as [number, number, number];
  return {
    activity: station.activity,
    mode: station.mode,
    position,
    focus,
    duration: station.duration + (activityHash(name) % 3) * 0.18,
    soloFallback: true,
  };
}

export function childActivityPosition(plan: ChildActivityPlan) {
  return new THREE.Vector3(...plan.position);
}

export function activityIsSocial(activity: ChildActivity) {
  return activity === 'conversation'
    || activity === 'parallel-play'
    || activity === 'following'
    || activity === 'reacting';
}