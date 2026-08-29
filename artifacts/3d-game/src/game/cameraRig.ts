import * as THREE from 'three';

export interface CameraBlocker {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  shape?: 'box' | 'circle';
  radius?: number;
}

export interface CameraRigState {
  sideId: string | null;
  pendingSideId: string | null;
  pendingSeconds: number;
  switches: number;
  initialized: boolean;
}

export interface CameraRigResult {
  position: THREE.Vector3;
  sideId: string;
  sightlineClear: boolean;
  transitionClear: boolean;
}

const SIDE_ANGLES = [0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI];
const CLEARANCE_MARGIN = 0.035;
const SWITCH_SCORE_MARGIN = 0.3;
const SWITCH_HOLD_SECONDS = 0.2;

// Returns the travelled fraction before the first swept-sphere contact. Boxes
// use an expanded slab intersection; round posts use an expanded XZ circle and
// expanded vertical interval. Both are continuous tests, rather than samples.
function blockerEntry(from: THREE.Vector3, to: THREE.Vector3, radius: number, blocker: CameraBlocker) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const minY = (blocker.minY ?? 0) - radius;
  const maxY = (blocker.maxY ?? 3) + radius;
  let enter = 0;
  let exit = 1;
  const clip = (origin: number, delta: number, min: number, max: number) => {
    if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
    const a = (min - origin) / delta;
    const b = (max - origin) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    return enter <= exit;
  };
  if (!clip(from.y, dy, minY, maxY)) return null;
  if (blocker.shape !== 'circle' || blocker.radius === undefined) {
    if (!clip(from.x, dx, blocker.minX - radius, blocker.maxX + radius)
      || !clip(from.z, dz, blocker.minZ - radius, blocker.maxZ + radius)) return null;
    return enter >= 0 && enter <= 1 ? enter : null;
  }
  const cx = (blocker.minX + blocker.maxX) / 2;
  const cz = (blocker.minZ + blocker.maxZ) / 2;
  const x = from.x - cx;
  const z = from.z - cz;
  const expanded = blocker.radius + radius;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return x * x + z * z <= expanded * expanded && enter <= exit ? enter : null;
  const b = 2 * (x * dx + z * dz);
  const c = x * x + z * z - expanded * expanded;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  enter = Math.max(enter, (-b - root) / (2 * a));
  exit = Math.min(exit, (-b + root) / (2 * a));
  return enter <= exit && enter >= 0 && enter <= 1 ? enter : null;
}

export function sweptSphereClearance(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  blockers: readonly CameraBlocker[],
) {
  const length = from.distanceTo(to);
  if (length < 1e-8) return blockers.some((blocker) => blockerEntry(from, to, radius, blocker) !== null) ? 0 : length;
  let entry = 1;
  for (const blocker of blockers) {
    const hit = blockerEntry(from, to, radius, blocker);
    if (hit !== null) entry = Math.min(entry, hit);
  }
  return length * entry;
}

export function isSweptSphereClear(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  blockers: readonly CameraBlocker[],
) {
  const distance = from.distanceTo(to);
  if (distance < 1e-8) {
    return !blockers.some((blocker) => blockerEntry(from, to, radius, blocker) !== null);
  }
  return sweptSphereClearance(from, to, radius, blockers) >= distance - 1e-5;
}

export function advanceCameraPosition(
  current: THREE.Vector3,
  target: THREE.Vector3,
  goal: THREE.Vector3,
  maxDistance: number,
  radius: number,
  blockers: readonly CameraBlocker[],
) {
  const next = current.clone();
  const remaining = next.distanceTo(goal);
  if (remaining < 1e-6) return next;
  next.lerp(goal, Math.min(1, Math.max(0, maxDistance) / remaining));
  const currentSightlineClear = isSweptSphereClear(target, current, radius, blockers);
  return isSweptSphereClear(current, next, radius, blockers)
    && (!currentSightlineClear || isSweptSphereClear(target, next, radius, blockers))
    ? next
    : current.clone();
}

export class CameraRig {
  readonly state: CameraRigState = {
    sideId: null,
    pendingSideId: null,
    pendingSeconds: 0,
    switches: 0,
    initialized: false,
  };
  private recoveryGoal: THREE.Vector3 | null = null;
  private recoverySideId: string | null = null;

  reset(hard = true) {
    this.state.sideId = null;
    this.state.pendingSideId = null;
    this.state.pendingSeconds = 0;
    if (hard) this.state.initialized = false;
    this.recoveryGoal = null;
    this.recoverySideId = null;
  }

  resolve(
    target: THREE.Vector3,
    desired: THREE.Vector3,
    current: THREE.Vector3,
    radius: number,
    minDistance: number,
    blockers: readonly CameraBlocker[],
    delta = 1 / 60,
  ): CameraRigResult {
    const wasInitialized = this.state.initialized;
    const offset = desired.clone().sub(target);
    const wantedDistance = offset.length();
    if (wantedDistance < 1e-6) return { position: desired.clone(), sideId: '0', sightlineClear: true, transitionClear: true };
    const currentSightlineClear = isSweptSphereClear(target, current, radius, blockers);

    if (this.recoveryGoal) {
      const recoveryReachable = isSweptSphereClear(current, this.recoveryGoal, radius, blockers);
      const recoveryComplete = current.distanceTo(this.recoveryGoal) < 0.08;
      if (!currentSightlineClear && recoveryReachable && !recoveryComplete) {
        return {
          position: this.recoveryGoal.clone(),
          sideId: this.recoverySideId ?? 'recovery',
          sightlineClear: isSweptSphereClear(target, this.recoveryGoal, radius, blockers),
          transitionClear: true,
        };
      }
      this.recoveryGoal = null;
      this.recoverySideId = null;
    }

    const horizontal = new THREE.Vector2(offset.x, offset.z);
    const vertical = offset.y;
    const candidates = SIDE_ANGLES.map((angle, index) => {
      const rotated = horizontal.clone().rotateAround(new THREE.Vector2(), angle);
      const direction = new THREE.Vector3(rotated.x, vertical, rotated.y).normalize();
      const clearance = sweptSphereClearance(target, target.clone().addScaledVector(direction, wantedDistance), radius, blockers);
      const retained = Math.max(0, Math.min(wantedDistance, clearance - CLEARANCE_MARGIN));
      const position = target.clone().addScaledVector(direction, retained);
      const sightlineClear = isSweptSphereClear(target, position, radius, blockers);
      const transitionClear = isSweptSphereClear(current, position, radius, blockers);
      return {
        id: `${index}`,
        position,
        clearance,
        retained,
        framingValid: retained >= minDistance,
        sightlineClear,
        transitionClear,
        score: retained / wantedDistance * 4 - Math.abs(angle) / Math.PI * 0.72,
      };
    });
    const visible = candidates.filter((candidate) => candidate.sightlineClear && candidate.retained > 0.001);
    // The first frame follows a spawn/zone cut, so there is no visible camera
    // travel to validate. Later frames must preserve continuous clearance.
    const transitionSafe = wasInitialized
      ? visible.filter((candidate) => candidate.transitionClear)
      : visible;
    const framed = transitionSafe.filter((candidate) => candidate.framingValid);
    const pool = framed.length > 0 ? framed : transitionSafe;
    const best = [...pool].sort((a, b) => b.score - a.score)[0];
    const retained = candidates.find((candidate) => candidate.id === this.state.sideId);

    if (!best) {
      if (!currentSightlineClear) {
        // Move through a persistent, physically clear recovery leg rather than
        // snapping through a wall or holding an occluded camera forever. A
        // high ring waypoint usually clears the wall in one leg; a vertical
        // lift is the safe first leg when the ring is not directly reachable.
        const recoveryY = Math.max(
          desired.y,
          ...blockers.map((blocker) => blocker.maxY ?? 3),
        ) + radius + 0.55;
        const horizontal = new THREE.Vector2(offset.x, offset.z);
        if (horizontal.lengthSq() < 1e-8) horizontal.set(0, 1);
        horizontal.normalize();
        const recoveryDistance = Math.max(minDistance, Math.min(6, Math.hypot(offset.x, offset.z)));
        const recoveryCandidates = Array.from({ length: 16 }, (_, index) => {
          const angle = index * Math.PI / 8;
          const direction = horizontal.clone().rotateAround(new THREE.Vector2(), angle);
          const position = new THREE.Vector3(
            target.x + direction.x * recoveryDistance,
            recoveryY,
            target.z + direction.y * recoveryDistance,
          );
          return {
            id: `recovery-${index}`,
            position,
            sightlineClear: isSweptSphereClear(target, position, radius, blockers),
            transitionClear: isSweptSphereClear(current, position, radius, blockers),
            score: -position.distanceToSquared(desired) - Math.min(angle, Math.PI * 2 - angle),
          };
        });
        const recovery = recoveryCandidates
          .filter((candidate) => candidate.sightlineClear && candidate.transitionClear)
          .sort((a, b) => b.score - a.score)[0];
        const lift = current.clone().setY(Math.max(current.y, recoveryY));
        const liftReachable = lift.distanceToSquared(current) > 1e-6
          && isSweptSphereClear(current, lift, radius, blockers);
        const goal = recovery?.position ?? (liftReachable ? lift : null);
        if (goal) {
          this.recoveryGoal = goal.clone();
          this.recoverySideId = recovery?.id ?? 'recovery-lift';
          return {
            position: goal,
            sideId: this.recoverySideId,
            sightlineClear: isSweptSphereClear(target, goal, radius, blockers),
            transitionClear: true,
          };
        }
      }
      // There is no safe movement this frame. Holding the current clear
      // physical position is still safer than fabricating clearance.
      return {
        position: current.clone(),
        sideId: this.state.sideId ?? 'hold',
        sightlineClear: currentSightlineClear,
        transitionClear: true,
      };
    }

    let chosen = best;
    const retainedUsable = retained?.sightlineClear
      && retained.transitionClear
      && retained.retained > 0.001;
    if (retainedUsable && retained) {
      const improvement = best.score - retained.score;
      if (best.id === retained.id || improvement < SWITCH_SCORE_MARGIN) {
        chosen = retained;
        this.state.pendingSideId = null;
        this.state.pendingSeconds = 0;
      } else {
        if (this.state.pendingSideId === best.id) {
          // Ignore only extreme tab-resume hitches; ordinary low frame rates
          // accumulate real elapsed time and switch on the same dwell budget.
          this.state.pendingSeconds += Math.min(delta, 0.25);
        } else {
          this.state.pendingSideId = best.id;
          this.state.pendingSeconds = 0;
        }
        if (this.state.pendingSeconds < SWITCH_HOLD_SECONDS) chosen = retained;
      }
    } else {
      this.state.pendingSideId = null;
      this.state.pendingSeconds = 0;
    }

    if (this.state.sideId !== null && chosen.id !== this.state.sideId) this.state.switches += 1;
    this.state.sideId = chosen.id;
    this.state.initialized = true;
    return {
      position: chosen.position,
      sideId: chosen.id,
      sightlineClear: chosen.sightlineClear,
      transitionClear: chosen.transitionClear,
    };
  }
}