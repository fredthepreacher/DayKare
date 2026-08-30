// WebGL availability probe and context-loss reporting.
//
// Before this existed, DayKare mounted the Three.js canvas unconditionally. If
// the browser could not give us a WebGL context the renderer threw during
// render, which took the whole app down and showed the player a raw crash
// screen. Phones lose contexts for reasons that have nothing to do with our
// code - backgrounding a tab, memory pressure, thermal throttling, a driver
// hiccup - so this needs a real answer, not an exception.

export type WebGLStatus = 'checking' | 'available' | 'unavailable';

export interface WebGLProbeResult {
  available: boolean;
  /** Short, player-safe reason. Never contains driver strings or stack traces. */
  reason?: string;
}

/**
 * Attempts to create a throwaway WebGL context. Returns availability rather
 * than throwing, so callers can render a fallback instead of crashing.
 *
 * The probe context is explicitly released: browsers cap the number of live
 * WebGL contexts (often around 16), and leaking one probe per mount would
 * eventually starve the real renderer.
 */
export function probeWebGL(): WebGLProbeResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { available: false, reason: 'no-document' };
  }

  if (typeof WebGLRenderingContext === 'undefined') {
    return { available: false, reason: 'not-supported' };
  }

  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const attributes: WebGLContextAttributes = {
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
    };
    const context = (canvas.getContext('webgl2', attributes)
      ?? canvas.getContext('webgl', attributes)
      ?? canvas.getContext('experimental-webgl', attributes)) as WebGLRenderingContext | null;

    if (!context) {
      return { available: false, reason: 'context-creation-failed' };
    }

    // Release the probe context immediately so it does not count against the
    // browser's live-context budget.
    const loseContext = context.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();

    return { available: true };
  } catch {
    return { available: false, reason: 'context-creation-threw' };
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/**
 * Subscribes to context loss and restoration on a canvas.
 *
 * `webglcontextlost` must have its default prevented, otherwise the browser
 * will not fire `webglcontextrestored` and the canvas stays dead forever.
 */
export function watchContextLoss(
  canvas: HTMLCanvasElement,
  handlers: { onLost: () => void; onRestored: () => void },
) {
  const handleLost = (event: Event) => {
    event.preventDefault();
    handlers.onLost();
  };
  const handleRestored = () => handlers.onRestored();

  canvas.addEventListener('webglcontextlost', handleLost as EventListener, false);
  canvas.addEventListener('webglcontextrestored', handleRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost as EventListener, false);
    canvas.removeEventListener('webglcontextrestored', handleRestored, false);
  };
}
