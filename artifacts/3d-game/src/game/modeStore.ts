import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type GameMode = 'story' | 'online-preview';
export type FrontEndPanel = 'menu' | 'customize' | 'progress' | 'settings' | 'accessibility';
export type OnlineVisibility = 'public' | 'friends' | 'invite';

export const ONLINE_STORAGE_KEY = 'daykare-online-preview';
export const ONLINE_MAX_PLAYERS = 10;
const STORY_SESSION_KEY = 'daykare-story-session-active';

function storySessionIsActive() {
  return typeof window !== 'undefined' && window.sessionStorage.getItem(STORY_SESSION_KEY) === 'true';
}

function setStorySessionActive(active: boolean) {
  if (typeof window === 'undefined') return;
  if (active) window.sessionStorage.setItem(STORY_SESSION_KEY, 'true');
  else window.sessionStorage.removeItem(STORY_SESSION_KEY);
}

export interface OnlineSeat {
  id: string;
  name: string;
  role: 'you' | 'toddler' | 'staff';
  status: 'ready' | 'local-preview';
  color: string;
}

export interface OnlinePreviewState {
  visibility: OnlineVisibility;
  inviteCode: string;
  seats: OnlineSeat[];
  selectedOutfit: number;
  selectedAccessory: number;
}

export interface ModeStore {
  activeMode: GameMode;
  menuOpen: boolean;
  panel: FrontEndPanel;
  online: OnlinePreviewState;
  reducedMotion: boolean;
  highContrast: boolean;
  largerText: boolean;
  audioEnabled: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  enterStory: () => void;
  enterOnlinePreview: () => void;
  openPanel: (panel: Exclude<FrontEndPanel, 'menu'>) => void;
  backToMenu: () => void;
  setOnlineVisibility: (visibility: OnlineVisibility) => void;
  cycleOnlineOutfit: () => void;
  cycleOnlineAccessory: () => void;
  toggleReducedMotion: () => void;
  toggleHighContrast: () => void;
  toggleLargerText: () => void;
  toggleAudioEnabled: () => void;
}

export const createInitialOnlinePreview = (): OnlinePreviewState => ({
  visibility: 'public',
  inviteCode: 'DAYKARE',
  seats: [
    { id: 'you', name: 'You', role: 'you', status: 'ready', color: '#ffad33' },
    { id: 'sprout', name: 'Sprout', role: 'toddler', status: 'local-preview', color: '#33cccc' },
    { id: 'poppy', name: 'Poppy', role: 'toddler', status: 'local-preview', color: '#ff66b3' },
    { id: 'rio', name: 'Rio', role: 'toddler', status: 'local-preview', color: '#8ed081' },
    { id: 'juniper', name: 'Juniper', role: 'toddler', status: 'local-preview', color: '#ff8566' },
    { id: 'milo', name: 'Milo', role: 'toddler', status: 'local-preview', color: '#a98be8' },
    { id: 'nurse-ivy', name: 'Ivy', role: 'staff', status: 'local-preview', color: '#6f7bf7' },
    { id: 'coach-sol', name: 'Sol', role: 'staff', status: 'local-preview', color: '#e8bd45' },
  ],
  selectedOutfit: 0,
  selectedAccessory: 0,
});

const visibilitySet = new Set<OnlineVisibility>(['public', 'friends', 'invite']);

export function normalizeOnlinePreview(value: unknown): OnlinePreviewState {
  const initial = createInitialOnlinePreview();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return initial;
  const candidate = value as Partial<OnlinePreviewState>;
  const visibility = visibilitySet.has(candidate.visibility as OnlineVisibility)
    ? candidate.visibility as OnlineVisibility
    : initial.visibility;
  const selectedOutfit = typeof candidate.selectedOutfit === 'number' && Number.isFinite(candidate.selectedOutfit)
    ? Math.max(0, Math.min(3, Math.floor(candidate.selectedOutfit)))
    : initial.selectedOutfit;
  const selectedAccessory = typeof candidate.selectedAccessory === 'number' && Number.isFinite(candidate.selectedAccessory)
    ? Math.max(0, Math.min(3, Math.floor(candidate.selectedAccessory)))
    : initial.selectedAccessory;
  return {
    ...initial,
    visibility,
    selectedOutfit,
    selectedAccessory,
  };
}

export const serializeOnlinePreview = (state: OnlinePreviewState) => ({
  visibility: state.visibility,
  inviteCode: state.inviteCode,
  selectedOutfit: state.selectedOutfit,
  selectedAccessory: state.selectedAccessory,
});

export const useModeStore = create<ModeStore>()(
  persist(
    (set) => ({
      activeMode: 'story',
      menuOpen: !storySessionIsActive(),
      panel: 'menu',
      online: createInitialOnlinePreview(),
      reducedMotion: false,
      highContrast: false,
      largerText: false,
      audioEnabled: true,
      openMenu: () => {
        setStorySessionActive(false);
        set({ menuOpen: true, panel: 'menu' });
      },
      closeMenu: () => {
        setStorySessionActive(true);
        set({ menuOpen: false, panel: 'menu' });
      },
      enterStory: () => {
        setStorySessionActive(true);
        set({ activeMode: 'story', menuOpen: false, panel: 'menu' });
      },
      enterOnlinePreview: () => {
        setStorySessionActive(false);
        set({ activeMode: 'online-preview', menuOpen: false, panel: 'menu' });
      },
      openPanel: (panel) => set({ menuOpen: true, panel }),
      backToMenu: () => {
        setStorySessionActive(false);
        set({ activeMode: 'story', menuOpen: true, panel: 'menu' });
      },
      setOnlineVisibility: (visibility) => set((state) => ({
        online: { ...state.online, visibility: visibilitySet.has(visibility) ? visibility : 'public' },
      })),
      cycleOnlineOutfit: () => set((state) => ({
        online: { ...state.online, selectedOutfit: (state.online.selectedOutfit + 1) % 4 },
      })),
      cycleOnlineAccessory: () => set((state) => ({
        online: { ...state.online, selectedAccessory: (state.online.selectedAccessory + 1) % 4 },
      })),
      toggleReducedMotion: () => set((state) => ({ reducedMotion: !state.reducedMotion })),
      toggleHighContrast: () => set((state) => ({ highContrast: !state.highContrast })),
      toggleLargerText: () => set((state) => ({ largerText: !state.largerText })),
      toggleAudioEnabled: () => set((state) => ({ audioEnabled: !state.audioEnabled })),
    }),
    {
      name: ONLINE_STORAGE_KEY,
      storage: createJSONStorage(() => (
        typeof window === 'undefined'
          ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
          : window.localStorage
      )),
      partialize: (state) => ({
        online: serializeOnlinePreview(state.online),
        reducedMotion: state.reducedMotion,
        highContrast: state.highContrast,
        largerText: state.largerText,
        audioEnabled: state.audioEnabled,
      }),
      merge: (persisted, current) => ({
        ...current,
        online: normalizeOnlinePreview((persisted as Partial<ModeStore> | null)?.online),
        reducedMotion: (persisted as Partial<ModeStore> | null)?.reducedMotion === true,
        highContrast: (persisted as Partial<ModeStore> | null)?.highContrast === true,
        largerText: (persisted as Partial<ModeStore> | null)?.largerText === true,
        audioEnabled: (persisted as Partial<ModeStore> | null)?.audioEnabled !== false,
      }),
    },
  ),
);