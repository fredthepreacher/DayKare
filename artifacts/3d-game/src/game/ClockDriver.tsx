import { useEffect, useRef } from 'react';
import { useGameStore } from './store';
import { useModeStore } from './modeStore';
import { isGameplayBlocked } from './gameplayGate';
import type { PauseReason } from './gameClock';

/**
 * Drives the canonical clock from real elapsed time.
 *
 * Deliberately NOT a `useFrame`. R3F's frame loop is a rendering concern, and
 * tying the passage of the daycare day to it would mean a phone dropping to 20
 * FPS also experiences a shorter morning. This runs on its own interval and
 * measures wall-clock deltas, so the day takes the same twenty minutes on every
 * device that can run the game at all.
 *
 * It also stops the day during any state where the player cannot act. Hours
 * passing behind a dialogue box, a journal, a menu or an account-migration
 * screen is not a feature: the player would come back to a Juice Club they
 * never got the chance to open.
 */

const TICK_MS = 250;

/** Nothing is allowed to advance more than this in one tick. */
const MAX_TICK_SECONDS = 1;

function currentPauseReason(): PauseReason | null {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return 'hidden';

  const game = useGameStore.getState();
  const mode = useModeStore.getState();
  const frontEndBlocked = mode.menuOpen || mode.activeMode === 'online-preview';

  if (!isGameplayBlocked({
    journalOpen: game.journalOpen,
    activeDialogue: game.activeDialogue,
    zoneTransitioning: game.zoneTransitioning,
    frontEndBlocked,
  })) {
    return null;
  }

  // Report WHY, in the order the player would describe it. A clock that is
  // stopped for an unnamed reason is indistinguishable from one that is broken.
  if (game.activeDialogue !== null) return 'dialogue';
  if (game.journalOpen) return 'journal';
  if (game.zoneTransitioning) return 'zone-transition';
  return frontEndBlocked ? 'front-end' : 'menu';
}

export function ClockDriver() {
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    lastTickRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const elapsedSeconds = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const reason = currentPauseReason();
      const store = useGameStore.getState();

      if (reason !== null) {
        if (!store.clock.paused || store.clock.pauseReason !== reason) {
          store.setClockPaused(true, reason);
        }
        return;
      }

      if (store.clock.paused) {
        store.setClockPaused(false);
        // Resume on the NEXT tick. Crediting the gap between pausing and
        // resuming would be exactly the catch-up we promised not to do.
        return;
      }

      store.tickClock(Math.min(elapsedSeconds, MAX_TICK_SECONDS));
    };

    const interval = window.setInterval(tick, TICK_MS);

    // A backgrounded tab is not a fast-forward. Returning to one resets the
    // baseline so the day resumes from now, not from an hour of debt.
    const onVisibility = () => { lastTickRef.current = performance.now(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
