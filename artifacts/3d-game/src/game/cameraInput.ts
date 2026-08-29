export interface CameraInputState {
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  zoom: number;
  targetZoom: number;
  recenterRequested: boolean;
}

export const CAMERA_ZOOM_MIN = 5.6;
export const CAMERA_ZOOM_MAX = 11.5;
export const CAMERA_ZOOM_STEP = 0.7;

const CAMERA_ZOOM_STORAGE_KEY = 'daykare.cameraZoom';
const DESKTOP_CAMERA_ZOOM = 7.4;
const TOUCH_CAMERA_ZOOM = 10.2;
const TOUCH_CAMERA_REOPEN_MIN = 9.2;

function isTouchOrPortraitDevice() {
  if (typeof window === 'undefined') return false;
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const hasTouch = navigator.maxTouchPoints > 0;
  const isPortraitViewport = window.innerWidth <= 767;
  return hasCoarsePointer || hasTouch || isPortraitViewport;
}

function getDefaultCameraZoom() {
  return isTouchOrPortraitDevice() ? TOUCH_CAMERA_ZOOM : DESKTOP_CAMERA_ZOOM;
}

function readSavedCameraZoom() {
  if (typeof window === 'undefined') return null;

  try {
    const storedValue = window.sessionStorage.getItem(CAMERA_ZOOM_STORAGE_KEY);
    if (storedValue === null) return null;
    const saved = Number(storedValue);
    const minimumReopenZoom = isTouchOrPortraitDevice()
      ? TOUCH_CAMERA_REOPEN_MIN
      : CAMERA_ZOOM_MIN;
    return Number.isFinite(saved)
      ? Math.max(minimumReopenZoom, Math.min(CAMERA_ZOOM_MAX, saved))
      : null;
  } catch {
    return null;
  }
}

function saveCameraZoom(zoom: number) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(CAMERA_ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    // Camera preference is non-essential when storage is unavailable.
  }
}

const initialZoom = readSavedCameraZoom() ?? getDefaultCameraZoom();

const cameraInput: CameraInputState = {
  yaw: 0,
  pitch: 0.22,
  yawVelocity: 0,
  pitchVelocity: 0,
  zoom: initialZoom,
  targetZoom: initialZoom,
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

/**
 * Adjust the camera boom distance. Positive values move farther away;
 * negative values move closer to the player.
 */
export function adjustCameraZoom(distanceDelta: number) {
  if (!Number.isFinite(distanceDelta) || distanceDelta === 0) return cameraInput.targetZoom;

  cameraInput.targetZoom = Math.max(
    CAMERA_ZOOM_MIN,
    Math.min(CAMERA_ZOOM_MAX, cameraInput.targetZoom + distanceDelta),
  );
  saveCameraZoom(cameraInput.targetZoom);
  return cameraInput.targetZoom;
}

export function consumeCameraRecenterRequest() {
  const requested = cameraInput.recenterRequested;
  cameraInput.recenterRequested = false;
  return requested;
}

export function stepCameraInput(delta: number) {
  // Keep direct orbit input stable at 30/60/120 FPS while camera distance
  // eases toward its target so pinch, wheel, and button changes never snap.
  cameraInput.pitch = Math.max(-0.05, Math.min(0.62, cameraInput.pitch));
  const blend = 1 - Math.exp(-12 * Math.max(0, delta));
  cameraInput.zoom += (cameraInput.targetZoom - cameraInput.zoom) * blend;
}