/**
 * Ride-on toys for NPC children.
 *
 * Before this there was exactly one rideable in DayKare: `tricycle`, a single
 * entry in WORLD_INTERACTION_TARGETS that only the player could use, with no
 * collider, no registry and no data shape to add a second one to.
 *
 * This is that shape. It is deliberately a small claim-and-route state machine
 * rather than physics:
 *
 *   idle -> approaching -> mounting -> riding -> dismounting -> idle
 *
 * Three properties the brief asks for directly, and one it implies:
 *
 * - NO CHAOTIC PHYSICS. Riders follow an authored loop of waypoints. A tricycle
 *   with a rigid body would need tuning, would wedge itself on the sandbox, and
 *   would look worse than a child pedalling a circuit.
 * - NO PERMANENT HOARDING. A ride has a hard time limit, after which the child
 *   dismounts even mid-loop, and a child that just dismounted is barred from
 *   re-claiming for a while. Without both, the first child to reach the trike
 *   keeps it for the rest of the session.
 * - TIER AWARE. Claiming and routing are pure functions of state, so a distant
 *   Tier C rider advances along the same route logically without pathfinding.
 * - COLLISION AWARE. Routes are authored inside the playground and validated
 *   against the real walkable test in the unit suite, so a route can never be
 *   authored through the slide.
 */

export interface RideableRoute {
  /** Waypoints, looped. Authored in open playground space. */
  waypoints: [number, number][];
}

export interface RideableDefinition {
  id: string;
  kind: 'tricycle' | 'scooter' | 'wagon' | 'balance-bike';
  /** Where the toy rests when nobody is using it. */
  home: [number, number];
  /** Where a child stands to get on. */
  approach: [number, number];
  route: RideableRoute;
  /** World units per second while riding. */
  speed: number;
}

/**
 * Only tricycles ship now. The other kinds are in the union so adding a scooter
 * later is data plus a mesh, not a new system - which is what "future-compatible
 * with bikes, scooters, skateboards" has to mean if it is to mean anything.
 */
export const RIDEABLES: RideableDefinition[] = [
  {
    id: 'trike-playground-a',
    kind: 'tricycle',
    home: [13.4, -1.6],
    approach: [12.4, -1.6],
    speed: 1.9,
    route: {
      // A loop through the open northern half of the playground, clear of the
      // slide (z -6.2..-3.0) and the sandbox (x 10..14, z 3..7).
      waypoints: [
        [13.4, -1.6],
        [14.6, 1.2],
        [13.0, 2.2],
        [11.2, 1.0],
        [11.6, -1.4],
      ],
    },
  },
  {
    id: 'trike-playground-b',
    kind: 'tricycle',
    home: [9.6, 9.2],
    approach: [10.6, 9.2],
    speed: 1.75,
    route: {
      // Southern loop, clear of the sandbox's southern edge and the Maker
      // Market gate (x 13..15.4, z 12.2..14.3).
      waypoints: [
        [9.6, 9.2],
        [9.4, 12.4],
        [11.8, 13.4],
        [12.6, 10.8],
        [11.0, 9.0],
      ],
    },
  },
];

export type RideState = 'idle' | 'approaching' | 'mounting' | 'riding' | 'dismounting';

export interface RiderState {
  rideableId: string;
  phase: RideState;
  waypointIndex: number;
  /** Render-clock seconds at which the current phase ends. */
  phaseEndsAt: number;
  /** Render-clock seconds at which the whole ride must end. */
  rideEndsAt: number;
}

/** How long a child may hold a rideable, in seconds. */
export const MAX_RIDE_SECONDS = 34;
const MOUNT_SECONDS = 0.9;
const DISMOUNT_SECONDS = 0.7;
/** A child that just finished may not immediately re-claim. */
const RECLAIM_COOLDOWN = 55;

const claims = new Map<string, string>();       // rideableId -> child name
const riders = new Map<string, RiderState>();   // child name -> state
const lastRideEndedAt = new Map<string, number>();

export function resetRideables() {
  claims.clear();
  riders.clear();
  lastRideEndedAt.clear();
}

export function getRideable(id: string): RideableDefinition | undefined {
  return RIDEABLES.find((entry) => entry.id === id);
}

export function riderFor(name: string): RiderState | undefined {
  return riders.get(name);
}

/** Which child, if any, is on this toy - so the scene knows not to draw it idle. */
export function claimantOf(rideableId: string): string | null {
  return claims.get(rideableId) ?? null;
}

export function isRiding(name: string): boolean {
  const state = riders.get(name);
  return state?.phase === 'riding' || state?.phase === 'mounting';
}

/**
 * Try to claim a free rideable. Returns the claimed state, or null.
 *
 * The eligibility rules are the anti-hoarding ones: a child on cooldown cannot
 * claim, and a toy already claimed cannot be taken. Both are checked here rather
 * than at the call site so no caller can skip them.
 */
export function tryClaimRideable(
  name: string,
  position: [number, number],
  now: number,
  options: { maxDistance?: number } = {},
): RiderState | null {
  if (riders.has(name)) return null;
  if (now < (lastRideEndedAt.get(name) ?? 0)) return null;

  const maxDistance = options.maxDistance ?? 9;
  let best: { definition: RideableDefinition; distance: number } | null = null;

  for (const definition of RIDEABLES) {
    if (claims.has(definition.id)) continue;
    const distance = Math.hypot(definition.approach[0] - position[0], definition.approach[1] - position[1]);
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) best = { definition, distance };
  }

  if (!best) return null;

  const state: RiderState = {
    rideableId: best.definition.id,
    phase: 'approaching',
    waypointIndex: 0,
    phaseEndsAt: now + 12,
    rideEndsAt: now + MAX_RIDE_SECONDS + 12,
  };
  claims.set(best.definition.id, name);
  riders.set(name, state);
  return state;
}

export function releaseRideable(name: string, now: number) {
  const state = riders.get(name);
  if (!state) return;
  if (claims.get(state.rideableId) === name) claims.delete(state.rideableId);
  riders.delete(name);
  lastRideEndedAt.set(name, now + RECLAIM_COOLDOWN);
}

export interface RideTarget {
  /** Where the child should be heading right now. */
  position: [number, number];
  /** How fast, in world units per second. */
  speed: number;
  /** True once the child is actually on the toy, for rendering. */
  mounted: boolean;
}

/**
 * Advance the ride machine and report where the child should move to.
 *
 * `arrived` is supplied by the caller rather than measured here, because only
 * the caller knows the child's real position after collision resolution -
 * deciding arrival from the requested target would let a child that is stuck
 * against the slide "arrive" forever.
 */
export function advanceRide(
  name: string,
  now: number,
  arrived: boolean,
  walkSpeed: number,
): RideTarget | null {
  const state = riders.get(name);
  if (!state) return null;
  const definition = getRideable(state.rideableId);
  if (!definition) {
    releaseRideable(name, now);
    return null;
  }

  // The hard time limit. It fires wherever the child is in the loop, which is
  // what stops one child owning a trike for a whole session.
  if (state.phase === 'riding' && now >= state.rideEndsAt) {
    state.phase = 'dismounting';
    state.phaseEndsAt = now + DISMOUNT_SECONDS;
  }

  switch (state.phase) {
    case 'approaching': {
      if (arrived) {
        state.phase = 'mounting';
        state.phaseEndsAt = now + MOUNT_SECONDS;
      } else if (now >= state.phaseEndsAt) {
        // Could not reach it in twelve seconds - something is in the way. Give
        // the toy back rather than blocking it for everyone else.
        releaseRideable(name, now);
        return null;
      }
      return { position: definition.approach, speed: walkSpeed, mounted: false };
    }
    case 'mounting': {
      if (now >= state.phaseEndsAt) {
        state.phase = 'riding';
        state.waypointIndex = 0;
        state.rideEndsAt = now + MAX_RIDE_SECONDS;
        // Return the RIDING target in the same call. Returning the mounting
        // target after the phase has already changed left the child stationary
        // for one extra frame with speed 0, which reads as a stutter the moment
        // they get on.
        return {
          position: definition.route.waypoints[0],
          speed: definition.speed,
          mounted: true,
        };
      }
      return { position: definition.approach, speed: 0, mounted: true };
    }
    case 'riding': {
      const waypoints = definition.route.waypoints;
      if (arrived) {
        state.waypointIndex = (state.waypointIndex + 1) % waypoints.length;
      }
      return { position: waypoints[state.waypointIndex], speed: definition.speed, mounted: true };
    }
    case 'dismounting': {
      if (now >= state.phaseEndsAt) {
        releaseRideable(name, now);
        return null;
      }
      return { position: definition.home, speed: 0, mounted: true };
    }
    default:
      return null;
  }
}

/** Snapshot for tests and telemetry. */
export function rideableSnapshot() {
  return {
    claimed: claims.size,
    riders: riders.size,
    total: RIDEABLES.length,
  };
}
