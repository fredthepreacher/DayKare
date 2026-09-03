import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  RALLY_CONFIGS, RALLY_MAX_MISSES, createRally, moveRallyPaddle, rallyCleared, stepRally,
  type RallyId, type RallyState,
} from './rallyGame';
import { useFinalMasterStore } from './finalMasterStore';
import { playGameSound } from './audio';

/**
 * Ping pong and tennis share this overlay, because they share their model.
 *
 * The rally is stepped on requestAnimationFrame and mirrored into refs, so
 * the ball moves at frame rate while React re-renders only when the score
 * changes. Keyboard, touch drag and gamepad all feed the same -1..1 axis.
 */
export function RallyGameOverlay({ id, onClose }: { id: RallyId; onClose: () => void }) {
  const config = RALLY_CONFIGS[id];
  const recordRallyResult = useFinalMasterStore((state) => state.recordRallyResult);
  const best = useFinalMasterStore((state) => state.rallyBest[id] ?? 0);
  const stateRef = useRef<RallyState>(createRally());
  const axisRef = useRef(0);
  const ballRef = useRef<HTMLDivElement>(null);
  const paddleRef = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(() => ({ rally: 0, misses: 0, over: false, bestRally: 0 }));
  const bankedRef = useRef(false);

  useEffect(() => {
    useFinalMasterStore.getState().setRallyGameOpen(true);
    return () => useFinalMasterStore.getState().setRallyGameOpen(false);
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      let next = moveRallyPaddle(stateRef.current, axisRef.current, delta);
      next = stepRally(next, config, delta);
      if (next.returnedThisStep) playGameSound('pickup', 'interaction');
      if (next.missedThisStep) playGameSound('door', 'interaction');
      stateRef.current = next;
      if (ballRef.current) {
        ballRef.current.style.left = `${(next.ballX * 0.5 + 0.5) * 100}%`;
        ballRef.current.style.bottom = `${next.ballY * 88 + 6}%`;
      }
      if (paddleRef.current) paddleRef.current.style.left = `${(next.paddleX * 0.5 + 0.5) * 100}%`;
      setDisplay((previous) => (
        previous.rally === next.rally && previous.misses === next.misses && previous.over === next.over
          ? previous
          : { rally: next.rally, misses: next.misses, over: next.over, bestRally: next.bestRally }
      ));
      if (next.over && !bankedRef.current) {
        bankedRef.current = true;
        recordRallyResult(id, next.bestRally, rallyCleared(next, config) ? config.xpReward : 0);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [config, id, recordRallyResult]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') axisRef.current = -1;
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') axisRef.current = 1;
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) axisRef.current = 0;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    let pad = 0;
    const pollPad = () => {
      const gamepad = typeof navigator !== 'undefined'
        ? Array.from(navigator.getGamepads?.() ?? []).find(Boolean)
        : null;
      if (gamepad) {
        const stick = gamepad.axes[0] ?? 0;
        if (Math.abs(stick) > 0.2) axisRef.current = stick;
        else if (gamepad.buttons[14]?.pressed) axisRef.current = -1;
        else if (gamepad.buttons[15]?.pressed) axisRef.current = 1;
      }
      pad = requestAnimationFrame(pollPad);
    };
    pad = requestAnimationFrame(pollPad);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      cancelAnimationFrame(pad);
    };
  }, [onClose]);

  const dragFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const wanted = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    axisRef.current = (wanted - stateRef.current.paddleX) * 8;
  };

  const restart = () => {
    stateRef.current = createRally();
    bankedRef.current = false;
    setDisplay({ rally: 0, misses: 0, over: false, bestRally: 0 });
  };

  return (
    <div className="final-modal-backdrop" data-testid="rally-overlay">
      <section className="daykare-rally" role="dialog" aria-modal="true" aria-label={config.label}>
        <header>
          <div>
            <small>{config.label}</small>
            <h2>Rally {display.rally}</h2>
            <p>Best {Math.max(best, display.bestRally)} · target {config.targetRally} · {RALLY_MAX_MISSES - display.misses} lives</p>
          </div>
          <button type="button" onClick={onClose} aria-label={`Leave ${config.label}`}><X /></button>
        </header>
        <div
          className="daykare-rally-court"
          onPointerMove={dragFromPointer}
          onPointerDown={dragFromPointer}
          onPointerUp={() => { axisRef.current = 0; }}
          onPointerLeave={() => { axisRef.current = 0; }}
        >
          <span className="daykare-rally-net" />
          <div className="daykare-rally-ball" ref={ballRef} />
          <div className="daykare-rally-paddle" ref={paddleRef} />
        </div>
        <footer>
          {display.over ? (
            <>
              <strong>
                {display.bestRally >= config.targetRally
                  ? `Rally of ${display.bestRally} — nice!`
                  : `Rally of ${display.bestRally}. ${config.targetRally} banks the XP.`}
              </strong>
              <button type="button" onClick={restart}>Play again</button>
              <button type="button" onClick={onClose}>Done</button>
            </>
          ) : (
            <span>Slide left and right to line up with the ball. Arrow keys, drag, or the stick.</span>
          )}
        </footer>
      </section>
    </div>
  );
}
