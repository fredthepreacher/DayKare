import { create } from 'zustand';

export const TOAST_VISIBLE_MS = 1_500;
export const TOAST_FADE_MS = 300;
export const TOAST_DEDUPE_MS = 4_000;
export const TOAST_QUEUE_LIMIT = 5;

export interface GameToast { id: string; title: string; detail?: string; kind?: 'ordinary' | 'success' | 'rank'; }
interface ToastState {
  active: GameToast | null;
  queue: GameToast[];
  fading: boolean;
  recent: Record<string, number>;
  enqueue: (toast: Omit<GameToast, 'id'> & { id?: string }, now?: number) => boolean;
  beginFade: () => void;
  dismiss: () => void;
  reset: () => void;
}

let serial = 0;
export const useToastStore = create<ToastState>((set, get) => ({
  active: null, queue: [], fading: false, recent: {},
  enqueue: (toast, now = Date.now()) => {
    const key = `${toast.title}|${toast.detail ?? ''}`;
    if (now - (get().recent[key] ?? -Infinity) < TOAST_DEDUPE_MS) return false;
    const item = { ...toast, id: toast.id ?? `toast-${now}-${serial += 1}` } as GameToast;
    set((state) => ({
      recent: { ...Object.fromEntries(Object.entries(state.recent).filter(([, at]) => now - at < TOAST_DEDUPE_MS)), [key]: now },
      ...(state.active ? { queue: [...state.queue, item].slice(0, TOAST_QUEUE_LIMIT) } : { active: item, fading: false }),
    }));
    return true;
  },
  beginFade: () => set({ fading: true }),
  dismiss: () => set((state) => ({ active: state.queue[0] ?? null, queue: state.queue.slice(1), fading: false })),
  reset: () => set({ active: null, queue: [], fading: false, recent: {} }),
}));
