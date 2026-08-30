import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shown when WebGL cannot start, or when the graphics context is lost and does
 * not come back. Deliberately styled like the rest of the DayKare front end
 * rather than an error page: this is a state the player can be in on a phone
 * through no fault of their own.
 *
 * Rules this screen follows:
 * - it never implies gameplay is available
 * - it never shows driver strings, stack traces, or internal error text
 * - it is real, focusable, readable text - not an image or colour-only signal
 */
export function GraphicsUnavailable({
  variant = 'unavailable',
  onRetry,
}: {
  variant?: 'unavailable' | 'lost';
  onRetry?: () => void;
}) {
  const lost = variant === 'lost';

  return (
    <div className="daykare-front-panel-shell" data-testid="overlay-graphics-unavailable">
      <section
        className="daykare-front-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="graphics-unavailable-title"
        aria-describedby="graphics-unavailable-body"
      >
        <div className="daykare-front-panel-content">
          <div className="daykare-feature-card daykare-feature-card-pink">
            <AlertTriangle aria-hidden="true" />
            <div>
              <p className="daykare-eyebrow">DayKare</p>
              <h2 id="graphics-unavailable-title">
                {lost ? 'The playground paused' : "3D graphics couldn't start"}
              </h2>
              <p id="graphics-unavailable-body">
                {lost
                  ? 'Your device stopped drawing the daycare for a moment. This usually happens after the tab has been in the background, or when the phone is low on memory.'
                  : 'This browser or device could not start the 3D graphics DayKare needs, so the daycare cannot be shown right now.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="daykare-front-action is-primary"
            onClick={onRetry ?? (() => window.location.reload())}
            data-testid="button-graphics-retry"
          >
            <RefreshCw aria-hidden="true" />
            <span>
              <strong>Try again</strong>
              <small>Reload and start the daycare over</small>
            </span>
            <span aria-hidden="true">Go</span>
          </button>

          <div className="daykare-lockup-card">
            <div>
              <strong>If it keeps happening</strong>
              <p>
                Close some other tabs or apps and try again. On a phone, giving it a moment to cool
                down helps. If DayKare still will not start, another browser - or a desktop - will
                usually work.
              </p>
            </div>
          </div>

          <p className="daykare-eyebrow">Your saved progress is safe and untouched.</p>
        </div>
      </section>
    </div>
  );
}
