/**
 * The Stony Brook dog whistle.
 *
 * A single pending flag rather than a store: the whistle is consumed on the
 * next frame by the one dog that exists, so there is nothing to subscribe to
 * and no way for two listeners to each act on the same whistle.
 */
let pending = false;

/** How far the dog has to be before a whistle repositions it at all. */
export const DOG_RECALL_RESCUE_DISTANCE = 22;

export function requestDogRecall() {
  pending = true;
}

export function consumeDogRecall() {
  if (!pending) return false;
  pending = false;
  return true;
}

export function resetDogRecall() {
  pending = false;
}
