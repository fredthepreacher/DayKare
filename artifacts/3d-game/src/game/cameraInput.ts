export interface CameraInputState {
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  recenterRequested: boolean;
}

// One stable frame keeps the hub readable on both desktop and touch devices.
// Obstruction handling in world.ts can still pull this frame forward safely.
export const CAMERA_DISTANCE = 8.8;

const cameraInput: CameraInputState = {
  yaw: 0,
  pitch: 0.22,
  yawVelocity: 0,
  pitchVelocity: 0,
  recenterRequested: false,
};

export function getCameraInput() {
  return cameraInput;
}

export function addCameraOrbit(deltaX: number, deltaY: number) {
  // Pointer movement is already frame-rate independent. Applying it directly
  // prevents a fast mouse or touch drag from building up an unpredictable swing.
  cameraInput.yaw += deltaX * 0.008;
  cameraInput.pitch = Math.max(-0.05, Math.min(0.62, cameraInput.pitch + deltaY * 0.006));
}

export function recenterCamera() {
  cameraInput.yaw = 0;
  cameraInput.pitch = 0.22;
  cameraInput.yawVelocity = 0;
  cameraInput.pitchVelocity = 0;
  cameraInput.recenterRequested = true;
}

export function consumeCameraRecenterRequest() {
  const requested = cameraInput.recenterRequested;
  cameraInput.recenterRequested = false;
  return requested;
}

export function stepCameraInput(_delta: number) {
  cameraInput.pitch = Math.max(-0.05, Math.min(0.62, cameraInput.pitch));
}