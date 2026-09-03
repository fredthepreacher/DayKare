import { create } from 'zustand';
import { advanceSlideRide, createSlideRide, type SlideRide } from './slide';

interface SlideState {
  ride: SlideRide | null;
  /** Set when the "Wavy!" audio could not play, so the UI shows the line instead. */
  shoutFallbackUntil: number;
  startPlayerSlide: () => boolean;
  stepPlayerSlide: (delta: number) => SlideRide | null;
  showShoutFallback: () => void;
  endPlayerSlide: () => void;
}

export const useSlideStore = create<SlideState>((set, get) => ({
  ride: null,
  shoutFallbackUntil: 0,
  startPlayerSlide: () => {
    if (get().ride) return false;
    set({ ride: createSlideRide() });
    return true;
  },
  stepPlayerSlide: (delta) => {
    const current = get().ride;
    if (!current) return null;
    const next = advanceSlideRide(current, delta);
    if (next.phase === 'done') {
      set({ ride: null });
      return next;
    }
    set({ ride: next });
    return next;
  },
  showShoutFallback: () => set({ shoutFallbackUntil: Date.now() + 1800 }),
  endPlayerSlide: () => set({ ride: null }),
}));
