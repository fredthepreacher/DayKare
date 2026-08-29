export interface CameraInputState {
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
}

const cameraInput: CameraInputState = {
  yaw: 0,
  pitch: 0.22,
  yawVelocity: 0,
  pitchVelocity: 0,
};

export function getCameraInput() {
  return cameraInput;
}

export function addCameraOrbit(deltaX: number, deltaY: number) {
  cameraInput.yawVelocity += deltaX * 0.035;
  cameraInput.pitchVelocity += deltaY * 0.025;
}

export function recenterCamera() {
  cameraInput.yaw = 0;
  cameraInput.pitch = 0.22;
  cameraInput.yawVelocity = 0;
  cameraInput.pitchVelocity = 0;
}

export function stepCameraInput(delta: number) {
  cameraInput.yaw += cameraInput.yawVelocity * delta;
  cameraInput.pitch = Math.max(-0.05, Math.min(0.62, cameraInput.pitch + cameraInput.pitchVelocity * delta));
  const damping = Math.exp(-10 * delta);
  cameraInput.yawVelocity *= damping;
  cameraInput.pitchVelocity *= damping;
}