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
    { activity: 'blocks', mode: 'toy-play', position: [-2.8, 0, 1.4], focus: [-1.8, 0, 1.4], duration: 3.4 },
    { activity: 'picture-books', mode: 'reading', position: [4.05, 0, -5.05], focus: [4.8, 0, -5.5], duration: 3.2 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [2.8, 0, 2.6], focus: [1.7, 0, 2.3], duration: 3.1 },
    { activity: 'singing', mode: 'singing', position: [-3.4, 0, -0.8], focus: [-2.3, 0, -0.8], duration: 2.8 },
    { activity: 'toy-play', mode: 'toy-play', position: [3.2, 0, 0.6], focus: [2.2, 0, 0.6], duration: 3.3 },
    { activity: 'parallel-play', mode: 'playing', position: [0.4, 0, 3.4], focus: [0.4, 0, 2.4], duration: 3 },
    { activity: 'conversation', mode: 'conversation', position: [-0.2, 0, -1.8], focus: [0.7, 0, -1.8], duration: 2.7 },
    { activity: 'circle-time', mode: 'circle-time', position: [0, 0, 2.3], focus: [0, 0, 1.2], duration: 3.2 },
  ],
  'art-time': [
    { activity: 'drawing', mode: 'coloring', position: [-14.1, 0, -11.5], focus: [-13.3, 0, -11.5], duration: 3.6 },
    { activity: 'coloring', mode: 'coloring', position: [-14.5, 0, -10.5], focus: [-13.5, 0, -10.5], duration: 3.4 },
    { activity: 'picture-books', mode: 'reading', position: [-9.35, 0, -10.6], focus: [-10.2, 0, -10.6], duration: 3.1 },
    { activity: 'parallel-play', mode: 'playing', position: [-9.7, 0, -13.5], focus: [-10.6, 0, -13.5], duration: 3 },
    { activity: 'conversation', mode: 'conversation', position: [-12.2, 0, -14.6], focus: [-11.2, 0, -14.6], duration: 2.8 },
    { activity: 'singing', mode: 'singing', position: [-9.5, 0, -14.2], focus: [-10.4, 0, -14.2], duration: 2.7 },
  ],
  'juice-club': [
    { activity: 'snacking', mode: 'snacking', position: [5.2, 0, -3.8], focus: [4.4, 0, -3.2], duration: 3.2 },
    { activity: 'conversation', mode: 'conversation', position: [4.8, 0, -0.7], focus: [3.8, 0, -0.7], duration: 2.8 },
    { activity: 'picture-books', mode: 'reading', position: [1.1, 0, 1.9], focus: [1.1, 0, 0.9], duration: 3.1 },
    { activity: 'parallel-play', mode: 'playing', position: [-2, 0, -1], focus: [-1, 0, -1], duration: 3 },
    { activity: 'following', mode: 'following', position: [0.8, 0, 2.7], focus: [0.8, 0, 1.7], duration: 2.6 },
    { activity: 'singing', mode: 'singing', position: [-2.2, 0, 0.5], focus: [-1.2, 0, 0.5], duration: 2.7 },
  ],
  'outdoor-play': [
    { activity: 'toy-play', mode: 'toy-play', position: [10.3, 0, -10.7], focus: [11.2, 0, -10.7], duration: 3.2 },
    { activity: 'dancing', mode: 'dancing', position: [13.6, 0, -8.2], focus: [12.7, 0, -8.2], duration: 2.8 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [10.6, 0, -1.6], focus: [11.5, 0, -1.6], duration: 3 },
    { activity: 'following', mode: 'following', position: [14.1, 0, 1.1], focus: [13.1, 0, 1.1], duration: 2.7 },
    { activity: 'reacting', mode: 'reacting', position: [13.6, 0, 8.4], focus: [12.6, 0, 8.4], duration: 2.6 },
    { activity: 'parallel-play', mode: 'playing', position: [9.5, 0, 10.5], focus: [10.5, 0, 10.5], duration: 3.1 },
  ],
  pickup: [
    { activity: 'picture-books', mode: 'reading', position: [-9.2, 0, -5.2], focus: [-10.2, 0, -5.2], duration: 3.1 },
    { activity: 'circle-time', mode: 'circle-time', position: [-9.2, 0, -1.2], focus: [-10.2, 0, -1.2], duration: 3 },
    { activity: 'conversation', mode: 'conversation', position: [-9.2, 0, 3.2], focus: [-10.2, 0, 3.2], duration: 2.8 },
    { activity: 'pretend-play', mode: 'pretend-play', position: [-9.2, 0, 1.2], focus: [-10.2, 0, 1.2], duration: 2.9 },
    { activity: 'parallel-play', mode: 'playing', position: [-9.2, 0, 5.2], focus: [-10.2, 0, 5.2], duration: 3 },
    { activity: 'singing', mode: 'singing', position: [-9.2, 0, -3.2], focus: [-10.2, 0, -3.2], duration: 2.7 },
  ],
};

const RAINY_OUTDOOR_STATIONS: Station[] = [
  { activity: 'circle-time', mode: 'circle-time', position: [3.6, 0, -6.7], focus: [2.6, 0, -6.7], duration: 3.1 },
  { activity: 'picture-books', mode: 'reading', position: [3.4, 0, -5.1], focus: [2.4, 0, -5.1], duration: 3.2 },
  { activity: 'blocks', mode: 'toy-play', position: [1.8, 0, -6.2], focus: [0.8, 0, -6.2], duration: 3.3 },
  { activity: 'singing', mode: 'singing', position: [1.1, 0, -4.8], focus: [0.1, 0, -4.8], duration: 2.7 },
  { activity: 'pretend-play', mode: 'pretend-play', position: [-1.6, 0, -5.6], focus: [-0.6, 0, -5.6], duration: 3 },
  { activity: 'parallel-play', mode: 'playing', position: [-3.4, 0, -5.2], focus: [-2.4, 0, -5.2], duration: 3.1 },
];

function activityHash(name: string) {
  return [...name].reduce((total, character) => (total * 33 + character.charCodeAt(0)) >>> 0, 11);
}

function rotateStations(stations: Station[], name: string, cycle: number, phase: number) {
  const nameIndex = Math.max(0, CHILD_ORDER.indexOf(name));
  const offset = (activityHash(name) + nameIndex + Math.floor(phase * 3)) % stations.length;
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