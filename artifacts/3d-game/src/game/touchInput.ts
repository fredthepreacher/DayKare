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

export function toggleTouchRun() {
  touchInput.run = !touchInput.run;
  return touchInput.run;
}

export function setTouchCrouch(active: boolean) {
  touchInput.crouch = active;
}