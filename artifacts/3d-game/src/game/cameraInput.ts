export interface CameraInputState {
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  recenterRequested: boolean;
}

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
  // prevents a fast mouse from building up an unpredictable swing after drag.
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
  // Keep the small per-frame safety clamp, but do not add inertia to direct
  // orbit input. This also keeps the result stable at 30/60/120 FPS.
  cameraInput.pitch = Math.max(-0.05, Math.min(0.62, cameraInput.pitch));
}