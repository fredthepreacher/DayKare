import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LocateFixed } from 'lucide-react';
import { clearTouchMove, resetTouchInput, setTouchCrouch, setTouchMove, toggleTouchRun, TouchPointerOwnership } from './touchInput';
import { addCameraOrbit, recenterCamera } from './cameraInput';

const HOLD_DELAY_MS = 520;
const DOUBLE_TAP_WINDOW_MS = 360;
const TAP_MOVEMENT_LIMIT = 18;
const LOOK_BLOCKING_SELECTOR = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="dialog"]',
  '[role="application"]',
  '.daykare-hud-left',
  '.daykare-hud-right',
  '.daykare-center-notices',
  '.daykare-dialogue',
  '.daykare-touch-movement',
  '.daykare-touch-interact',
  '.daykare-touch-recenter',
].join(',');

export function isTouchTap(holdTriggered: boolean, maxTravel: number) {
  return !holdTriggered && maxTravel <= TAP_MOVEMENT_LIMIT;
}

export function isTouchDoubleTap(lastTapAt: number, now: number) {
  return lastTapAt > 0 && now - lastTapAt <= DOUBLE_TAP_WINDOW_MS;
}

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
  const touchUiRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerOwnership = useRef(new TouchPointerOwnership());
  const lookPoint = useRef({ x: 0, y: 0 });
  const startPoint = useRef({ x: 0, y: 0 });
  const maxTravel = useRef(0);
  const lastTapAt = useRef(0);
  const holdTriggered = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [runEnabled, setRunEnabled] = useState(false);
  const [crouchEnabled, setCrouchEnabled] = useState(false);

  useLayoutEffect(() => {
    const touchUi = touchUiRef.current;
    if (!touchUi) return;

    const updateViewportLayout = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const visibleBottom = offsetTop + height;
      const hudRects = ['.daykare-hud-left', '.daykare-hud-right']
        .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect));
      const hudBottom = hudRects.reduce(
        (bottom, rect) => Math.max(bottom, rect.bottom),
        offsetTop,
      );
      const recenterSize = 46;
      const preferredTop = Math.max(offsetTop + 8, hudBottom + 8);
      const latestVisibleTop = Math.max(offsetTop + 8, visibleBottom - recenterSize - 8);

      const root = document.documentElement;
      const values = {
        '--daykare-visual-left': `${offsetLeft}px`,
        '--daykare-visual-top': `${offsetTop}px`,
        '--daykare-visual-width': `${width}px`,
        '--daykare-visual-height': `${height}px`,
        '--daykare-visual-right': `${offsetLeft + width}px`,
        '--daykare-hud-bottom': `${hudBottom}px`,
        '--daykare-touch-recenter-top': `${Math.min(preferredTop, latestVisibleTop)}px`,
      };
      for (const [property, value] of Object.entries(values)) {
        if (root.style.getPropertyValue(property) !== value) {
          root.style.setProperty(property, value);
        }
      }
      return `${width}:${height}:${offsetLeft}:${offsetTop}:${hudBottom}`;
    };

    let viewportFrame = 0;
    let viewportTimer: ReturnType<typeof setTimeout> | null = null;
    let settlePass = 0;
    let lastLayoutSignature = '';
    const settleViewportLayout = () => {
      const signature = updateViewportLayout();
      const changed = signature !== lastLayoutSignature;
      lastLayoutSignature = signature;
      settlePass += 1;
      if ((changed || settlePass < 3) && settlePass < 7) {
        viewportTimer = setTimeout(settleViewportLayout, 70);
      }
    };
    const scheduleViewportLayout = () => {
      updateViewportLayout();
      cancelAnimationFrame(viewportFrame);
      viewportFrame = requestAnimationFrame(updateViewportLayout);
      if (viewportTimer) clearTimeout(viewportTimer);
      settlePass = 0;
      lastLayoutSignature = '';
      viewportTimer = setTimeout(settleViewportLayout, 70);
    };

    scheduleViewportLayout();
    const resizeObserver = new ResizeObserver(scheduleViewportLayout);
    resizeObserver.observe(document.documentElement);
    const appShell = document.querySelector<HTMLElement>('.daykare-app-shell');
    if (appShell) resizeObserver.observe(appShell);
    for (const selector of ['.daykare-hud-left', '.daykare-hud-right']) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) continue;
      resizeObserver.observe(element);
    }

    const viewport = window.visualViewport;
    window.addEventListener('resize', scheduleViewportLayout);
    window.addEventListener('orientationchange', scheduleViewportLayout);
    viewport?.addEventListener('resize', scheduleViewportLayout);
    viewport?.addEventListener('scroll', scheduleViewportLayout);
    document.fonts?.ready.then(scheduleViewportLayout).catch(() => undefined);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(viewportFrame);
      if (viewportTimer) clearTimeout(viewportTimer);
      window.removeEventListener('resize', scheduleViewportLayout);
      window.removeEventListener('orientationchange', scheduleViewportLayout);
      viewport?.removeEventListener('resize', scheduleViewportLayout);
      viewport?.removeEventListener('scroll', scheduleViewportLayout);
    };
  }, []);

  useEffect(() => {
    if (!movementEnabled) {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      pointerOwnership.current.reset();
      resetTouchInput();
      holdTriggered.current = false;
      lastTapAt.current = 0;
      setKnob({ x: 0, y: 0 });
      setRunEnabled(false);
      setCrouchEnabled(false);
    }
  }, [movementEnabled]);

  useEffect(() => {
    if (!movementEnabled) return;
    const canvas = document.querySelector<HTMLCanvasElement>('.daykare-app-shell canvas');
    if (!canvas) return;

    const releaseLook = (pointerId: number) => {
      if (pointerOwnership.current.lookPointer !== pointerId) return;
      try {
        if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already be gone after a browser-level cancellation.
      }
      pointerOwnership.current.releaseLook(pointerId);
    };
    const isGameplayPoint = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY);
      if (!(hit instanceof Element) || hit.closest(LOOK_BLOCKING_SELECTOR)) return false;
      return hit === canvas || hit.closest('.daykare-app-shell') !== null;
    };
    const onLookStart = (event: PointerEvent) => {
      if (
        (event.pointerType !== 'touch' && event.pointerType !== 'pen')
        || event.button !== 0
        || !isGameplayPoint(event)
        || !pointerOwnership.current.claimLook(event.pointerId)
      ) return;
      event.preventDefault();
      lookPoint.current = { x: event.clientX, y: event.clientY };
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch {
        // Some webviews reject capture for synthetic or already-cancelled pointers.
      }
    };
    const onLookMove = (event: PointerEvent) => {
      if (pointerOwnership.current.lookPointer !== event.pointerId) return;
      event.preventDefault();
      addCameraOrbit(event.clientX - lookPoint.current.x, event.clientY - lookPoint.current.y);
      lookPoint.current = { x: event.clientX, y: event.clientY };
    };
    const onLookEnd = (event: PointerEvent) => {
      releaseLook(event.pointerId);
    };
    const onLostPointerCapture = (event: PointerEvent) => releaseLook(event.pointerId);
    const onPageInterruption = () => {
      const pointerId = pointerOwnership.current.lookPointer;
      if (pointerId !== null) releaseLook(pointerId);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') onPageInterruption();
    };
    window.addEventListener('pointerdown', onLookStart, { passive: false, capture: true });
    window.addEventListener('pointermove', onLookMove, { passive: false });
    window.addEventListener('pointerup', onLookEnd);
    window.addEventListener('pointercancel', onLookEnd);
    canvas.addEventListener('lostpointercapture', onLostPointerCapture);
    window.addEventListener('pagehide', onPageInterruption);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      const pointerId = pointerOwnership.current.lookPointer;
      if (pointerId !== null) releaseLook(pointerId);
      window.removeEventListener('pointerdown', onLookStart, { capture: true });
      window.removeEventListener('pointermove', onLookMove);
      window.removeEventListener('pointerup', onLookEnd);
      window.removeEventListener('pointercancel', onLookEnd);
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture);
      window.removeEventListener('pagehide', onPageInterruption);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [movementEnabled]);

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      resetTouchInput();
      pointerOwnership.current.reset();
    };
  }, []);

  useEffect(() => {
    const resetAfterBlur = () => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      pointerOwnership.current.reset();
      holdTriggered.current = false;
      lastTapAt.current = 0;
      resetTouchInput();
      setKnob({ x: 0, y: 0 });
      setRunEnabled(false);
      setCrouchEnabled(false);
    };
    window.addEventListener('blur', resetAfterBlur);
    window.addEventListener('pagehide', resetAfterBlur);
    const resetAfterVisibilityLoss = () => {
      if (document.visibilityState !== 'visible') resetAfterBlur();
    };
    document.addEventListener('visibilitychange', resetAfterVisibilityLoss);
    return () => {
      window.removeEventListener('blur', resetAfterBlur);
      window.removeEventListener('pagehide', resetAfterBlur);
      document.removeEventListener('visibilitychange', resetAfterVisibilityLoss);
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
    if (!movementEnabled || !pointerOwnership.current.claimMovement(event.pointerId)) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic checks and a few webviews can reject capture while still
      // delivering a valid pointer stream to the owning control.
    }
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
    if (event.pointerId !== pointerOwnership.current.movementPointer) return;
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
    if (event.pointerId !== pointerOwnership.current.movementPointer) return;
    event.preventDefault();
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    pointerOwnership.current.releaseMovement(event.pointerId);
    const wasHold = holdTriggered.current;
    clearTouchMove();
    setKnob({ x: 0, y: 0 });

    if (isTouchTap(wasHold, maxTravel.current)) {
      const now = performance.now();
      if (isTouchDoubleTap(lastTapAt.current, now)) {
        const next = toggleTouchRun();
        setRunEnabled(next);
        lastTapAt.current = 0;
        if ('vibrate' in navigator) navigator.vibrate([20, 30, 20]);
      } else {
        lastTapAt.current = now;
      }
    }
    holdTriggered.current = false;
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointerOwnership.current.movementPointer) return;
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    pointerOwnership.current.releaseMovement(event.pointerId);
    holdTriggered.current = false;
    lastTapAt.current = 0;
    resetTouchInput();
    setKnob({ x: 0, y: 0 });
    setRunEnabled(false);
    setCrouchEnabled(false);
  };

  return (
    <div ref={touchUiRef} className="daykare-touch-ui" aria-label="Touch game controls">
      {movementEnabled && (
        <>
          <div className="daykare-touch-look" aria-hidden="true" />
          <button
            type="button"
            className="daykare-touch-recenter"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={recenterCamera}
            aria-label="Center camera"
            title="Center camera"
          >
            <LocateFixed aria-hidden="true" size={21} strokeWidth={2.5} />
            <span className="sr-only">Center camera</span>
          </button>
        </>
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
            onLostPointerCapture={cancelPointer}
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