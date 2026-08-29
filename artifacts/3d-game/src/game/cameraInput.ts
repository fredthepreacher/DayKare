export interface CameraInputState {
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  recenterRequested: boolean;
}

export interface CameraProfile {
  distance: number;
  fov: number;
  height: number;
  lookAhead: number;
}

// One stable frame keeps the hub readable on desktop and touch devices.
// Portrait screens get a wider lens and a little more distance, not a user zoom.
export const CAMERA_DISTANCE = 12.6;

export function getCameraProfile(width: number, height: number): CameraProfile {
  const portrait = height > width * 1.08;
  return portrait
    ? { distance: 13.6, fov: 70, height: 4.7, lookAhead: 0.9 }
    : { distance: CAMERA_DISTANCE, fov: 66, height: 4.25, lookAhead: 0.62 };
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