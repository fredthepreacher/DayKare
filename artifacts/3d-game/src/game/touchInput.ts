export interface TouchInputState {
  x: number;
  y: number;
  run: boolean;
  crouch: boolean;
}

const touchInput: TouchInputState = {
  x: 0,
  y: 0,
  run: false,
  crouch: false,
};

export class TouchPointerOwnership {
  movementPointer: number | null = null;
  lookPointer: number | null = null;

  claimMovement(pointerId: number) {
    if (this.movementPointer !== null || pointerId === this.lookPointer) return false;
    this.movementPointer = pointerId;
    return true;
  }

  claimLook(pointerId: number) {
    if (this.lookPointer !== null || pointerId === this.movementPointer) return false;
    this.lookPointer = pointerId;
    return true;
  }

  releaseMovement(pointerId: number) {
    if (this.movementPointer !== pointerId) return false;
    this.movementPointer = null;
    return true;
  }

  releaseLook(pointerId: number) {
    if (this.lookPointer !== pointerId) return false;
    this.lookPointer = null;
    return true;
  }

  reset() {
    this.movementPointer = null;
    this.lookPointer = null;
  }
}

export function getTouchInput() {
  return touchInput;
}

export function setTouchMove(x: number, y: number) {
  touchInput.x = Math.max(-1, Math.min(1, x));
  touchInput.y = Math.max(-1, Math.min(1, y));
}

export function clearTouchMove() {
  touchInput.x = 0;
  touchInput.y = 0;
}

export function resetTouchInput() {
  clearTouchMove();
  touchInput.run = false;
  touchInput.crouch = false;
}

export function toggleTouchRun() {
  touchInput.run = !touchInput.run;
  return touchInput.run;
}

export function setTouchCrouch(active: boolean) {
  touchInput.crouch = active;
}