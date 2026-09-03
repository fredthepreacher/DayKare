import {
  advanceSlideRide, createNpcSlideSchedule, createSlideRide, npcSlideAllowed, releaseNpcSlideRider,
  slideRidePosition, slideRideTumble, stepNpcSlideSchedule, type NpcSlideSchedule, type SlideRide,
} from './slide';

/**
 * Runs the children's turns on the Wavy slide.
 *
 * A module singleton rather than a store: this is ticked once per frame
 * by the NPC coordinator and read by whichever child is riding, so a
 * React subscription would cost every child a re-render for a value only
 * one of them uses.
 */
let schedule: NpcSlideSchedule = createNpcSlideSchedule(1);
let ride: SlideRide | null = null;
let start: [number, number, number] = [12, 0, -1.9];
let seed = 1;
let shoutRequested = false;

export function resetNpcSlide() {
  schedule = createNpcSlideSchedule(1);
  ride = null;
  seed = 1;
  shoutRequested = false;
}

export function npcSlideRider() {
  return schedule.rider;
}

/**
 * @param eligible children who may be pulled onto the slide right now.
 *        The caller filters out anyone the ride must not interrupt.
 */
export function tickNpcSlide(
  delta: number,
  eligible: readonly string[],
  scheduleId: string,
  heistActive: boolean,
  cutsceneActive: boolean,
  riderPosition: readonly [number, number, number] | null,
) {
  if (!npcSlideAllowed(scheduleId, heistActive, cutsceneActive)) {
    // A blocking activity started mid-ride: the child is released rather
    // than left tumbling through nap time.
    if (schedule.rider) {
      seed += 1;
      schedule = releaseNpcSlideRider(schedule, seed);
      ride = null;
    }
    return;
  }
  if (schedule.rider && ride) {
    const next = advanceSlideRide(ride, delta);
    if (next.shoutedThisStep) shoutRequested = true;
    if (next.phase === 'done') {
      seed += 1;
      schedule = releaseNpcSlideRider(schedule, seed);
      ride = null;
      return;
    }
    ride = next;
    return;
  }
  const before = schedule.rider;
  schedule = stepNpcSlideSchedule(schedule, delta, eligible, seed);
  if (schedule.rider && schedule.rider !== before) {
    ride = createSlideRide();
    start = riderPosition ? [...riderPosition] as [number, number, number] : [12, 0, -1.9];
  }
}

/** Consumes the pending "Wavy!" cue, so it plays exactly once per ride. */
export function consumeNpcSlideShout() {
  if (!shoutRequested) return false;
  shoutRequested = false;
  return true;
}

export function npcSlideTransform(name: string) {
  if (!ride || schedule.rider !== name) return null;
  return { position: slideRidePosition(ride, start), tumble: slideRideTumble(ride), phase: ride.phase };
}
