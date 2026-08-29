import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clearTouchMove, setTouchCrouch, setTouchMove, toggleTouchRun } from './touchInput';
import { addCameraOrbit, recenterCamera } from './cameraInput';

const HOLD_DELAY_MS = 520;
const DOUBLE_TAP_WINDOW_MS = 360;
const TAP_MOVEMENT_LIMIT = 18;

interface TouchControlsProps {
  movementEnabled: boolean;
  interactionLabel: string | null;
  interactionDetail?: string | null;
  onInteract: () => void;
}

export function TouchControls({
  movementEnabled,
  interactionLabel,
  interactionDetail,
  onInteract,
}: TouchControlsProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const lookPoint = useRef({ x: 0, y: 0 });
  const startPoint = useRef({ x: 0, y: 0 });
  const maxTravel = useRef(0);
  const lastTapAt = useRef(0);
  const holdTriggered = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [runEnabled, setRunEnabled] = useState(false);
  const [crouchEnabled, setCrouchEnabled] = useState(false);

  useEffect(() => {
    if (!movementEnabled) {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      activePointer.current = null;
      clearTouchMove();
      setKnob({ x: 0, y: 0 });
    }
  }, [movementEnabled]);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      clearTouchMove();
      setTouchCrouch(false);
    };
  }, []);

  const updateMovement = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;

    const bounds = pad.getBoundingClientRect();
    const radius = bounds.width * 0.34;
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const rawX = clientX - centerX;
    const rawY = clientY - centerY;
    const length = Math.hypot(rawX, rawY);
    const scale = length > radius ? radius / length : 1;
    const x = rawX * scale;
    const y = rawY * scale;

    setKnob({ x, y });
    setTouchMove(x / radius, y / radius);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!movementEnabled || activePointer.current !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    startPoint.current = { x: event.clientX, y: event.clientY };
    maxTravel.current = 0;
    holdTriggered.current = false;
    updateMovement(event.clientX, event.clientY);

    holdTimer.current = setTimeout(() => {
      if (maxTravel.current <= TAP_MOVEMENT_LIMIT) {
        holdTriggered.current = true;
        setCrouchEnabled((previous) => {
          const next = !previous;
          setTouchCrouch(next);
          return next;
        });
        if ('vibrate' in navigator) navigator.vibrate(35);
      }
    }, HOLD_DELAY_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    event.preventDefault();
    const travel = Math.hypot(
      event.clientX - startPoint.current.x,
      event.clientY - startPoint.current.y,
    );
    maxTravel.current = Math.max(maxTravel.current, travel);
    if (maxTravel.current > TAP_MOVEMENT_LIMIT && holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    updateMovement(event.clientX, event.clientY);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    event.preventDefault();
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    activePointer.current = null;
    clearTouchMove();
    setKnob({ x: 0, y: 0 });

    if (!holdTriggered.current && maxTravel.current <= TAP_MOVEMENT_LIMIT) {
      const now = performance.now();
      if (now - lastTapAt.current <= DOUBLE_TAP_WINDOW_MS) {
        const next = toggleTouchRun();
        setRunEnabled(next);
        lastTapAt.current = 0;
        if ('vibrate' in navigator) navigator.vibrate([20, 30, 20]);
      } else {
        lastTapAt.current = now;
      }
    }
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== activePointer.current) return;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    activePointer.current = null;
    holdTriggered.current = false;
    clearTouchMove();
    setKnob({ x: 0, y: 0 });
  };

  const startLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current !== null) return;
    lookPointer.current = event.pointerId;
    lookPoint.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current !== event.pointerId) return;
    event.preventDefault();
    addCameraOrbit(event.clientX - lookPoint.current.x, event.clientY - lookPoint.current.y);
    lookPoint.current = { x: event.clientX, y: event.clientY };
  };

  const finishLook = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current === event.pointerId) lookPointer.current = null;
  };

  return (
    <div className="daykare-touch-ui" aria-label="Touch game controls">
      {movementEnabled && (
        <div
          className="daykare-touch-look"
          onPointerDown={startLook}
          onPointerMove={moveLook}
          onPointerUp={finishLook}
          onPointerCancel={finishLook}
          role="application"
          aria-label="Drag to orbit the camera"
        >
          <button
            type="button"
            className="daykare-touch-recenter"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={recenterCamera}
          >
            Center camera
          </button>
        </div>
      )}
      {movementEnabled && (
        <div className="daykare-touch-movement">
          <div
            ref={padRef}
            className="daykare-touch-pad"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={cancelPointer}
            role="application"
            aria-label="Drag to move. Double tap to toggle run. Tap and hold to toggle crouch."
          >
            <div className="daykare-touch-pad-ring" />
            <div
              className="daykare-touch-knob"
              style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
            />
          </div>
          <div className="daykare-touch-status" aria-live="polite">
            <span className={runEnabled ? 'is-active' : ''}>Run {runEnabled ? 'on' : 'off'}</span>
            <span className={crouchEnabled ? 'is-active' : ''}>Crouch {crouchEnabled ? 'on' : 'off'}</span>
          </div>
          <div className="daykare-touch-hint">Double-tap run · Hold crouch</div>
        </div>
      )}

      {interactionLabel && (
        <button
          type="button"
          className="daykare-touch-interact"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onInteract}
        >
          <span className="daykare-touch-interact-mark">ACT</span>
          <span className="daykare-touch-interact-copy">
            <strong>{interactionLabel}</strong>
            {interactionDetail && <small>{interactionDetail}</small>}
          </span>
        </button>
      )}
    </div>
  );
}