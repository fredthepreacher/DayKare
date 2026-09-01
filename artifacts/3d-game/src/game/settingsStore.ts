import { create } from 'zustand';
import {
  ACCOUNT_SETTINGS_KEY,
  DEVICE_SETTINGS_KEY,
  accountSettingsFromLegacyOnlineSave,
  defaultAccountSettings,
  defaultDeviceSettings,
  deviceSettingsFromLegacyOnlineSave,
  normalizeAccountSettings,
  normalizeDeviceSettings,
  type AccountSettings,
  type DeviceSettings,
} from '@workspace/cloud-sync';
import { ONLINE_STORAGE_KEY } from './modeStore';

/**
 * Settings, split by what they belong to.
 *
 * Accessibility preferences follow the PLAYER and will sync to their account.
 * Graphics, sensitivities and the mute toggle follow the HARDWARE and never
 * leave the device.
 *
 * Neither belongs in a progression save. Until now the four accessibility
 * flags lived inside the Online preview store, which meant a Story-only
 * player's accessibility choices were filed under "online" and would have
 * ridden along with Online progression into the cloud.
 *
 * This store is deliberately NOT part of store.ts or modeStore.ts. Those hold
 * progress; this holds preferences, and mixing them is what created the
 * problem being fixed here.
 */

const readJson = (key: string): unknown => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private browsing and embedded webviews can expose localStorage and then
    // throw on use. Defaults are a fine outcome; a crash is not.
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Settings that cannot be persisted still work for this session.
  }
};

/**
 * One-time lift of the accessibility flags out of the legacy Online save.
 *
 * Reads only. The Online save is not modified here — `modeStore` simply stops
 * writing those fields, and any that remain in an old payload are ignored by
 * its merge. That ordering means a failure in this function can never damage
 * a player's Online save.
 */
function loadInitialSettings(): { account: AccountSettings; device: DeviceSettings } {
  const storedAccount = readJson(ACCOUNT_SETTINGS_KEY);
  const storedDevice = readJson(DEVICE_SETTINGS_KEY);

  if (storedAccount || storedDevice) {
    return {
      account: normalizeAccountSettings(storedAccount),
      device: normalizeDeviceSettings(storedDevice),
    };
  }

  const legacy = readJson(ONLINE_STORAGE_KEY);
  const legacyState = legacy && typeof legacy === 'object'
    ? (legacy as { state?: unknown }).state ?? legacy
    : null;

  if (legacyState) {
    const account = accountSettingsFromLegacyOnlineSave(legacyState);
    const device = deviceSettingsFromLegacyOnlineSave(legacyState);
    writeJson(ACCOUNT_SETTINGS_KEY, account);
    writeJson(DEVICE_SETTINGS_KEY, device);
    return { account, device };
  }

  return { account: defaultAccountSettings(), device: defaultDeviceSettings() };
}

export interface SettingsStore {
  account: AccountSettings;
  device: DeviceSettings;
  toggleReducedMotion: () => void;
  toggleHighContrast: () => void;
  toggleLargerText: () => void;
  toggleCaptions: () => void;
  toggleAudioEnabled: () => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setVoiceVolume: (volume: number) => void;
  setQuality: (quality: DeviceSettings['quality']) => void;
  /** Applied when the account's cloud copy is newer than this device's. */
  applyAccountSettings: (settings: AccountSettings) => void;
}

const initial = loadInitialSettings();

export const useSettingsStore = create<SettingsStore>()((set, get) => {
  const persistAccount = (account: AccountSettings) => {
    writeJson(ACCOUNT_SETTINGS_KEY, account);
    return account;
  };
  const persistDevice = (device: DeviceSettings) => {
    writeJson(DEVICE_SETTINGS_KEY, device);
    return device;
  };

  return {
    account: initial.account,
    device: initial.device,

    toggleReducedMotion: () => set((state) => ({
      account: persistAccount({ ...state.account, reducedMotion: !state.account.reducedMotion }),
    })),
    toggleHighContrast: () => set((state) => ({
      account: persistAccount({ ...state.account, highContrast: !state.account.highContrast }),
    })),
    toggleLargerText: () => set((state) => ({
      account: persistAccount({ ...state.account, largerText: !state.account.largerText }),
    })),
    toggleCaptions: () => set((state) => ({
      account: persistAccount({ ...state.account, captionsEnabled: !state.account.captionsEnabled }),
    })),
    toggleAudioEnabled: () => set((state) => ({
      device: persistDevice({ ...state.device, audioEnabled: !state.device.audioEnabled }),
    })),
    setMusicVolume: (musicVolume) => set((state) => ({
      device: persistDevice(normalizeDeviceSettings({ ...state.device, musicVolume })),
    })),
    setSfxVolume: (sfxVolume) => set((state) => ({
      device: persistDevice(normalizeDeviceSettings({ ...state.device, sfxVolume })),
    })),
    setVoiceVolume: (voiceVolume) => set((state) => ({
      device: persistDevice(normalizeDeviceSettings({ ...state.device, voiceVolume })),
    })),
    setQuality: (quality) => set((state) => ({
      device: persistDevice({ ...state.device, quality }),
    })),
    applyAccountSettings: (settings) => {
      const normalized = normalizeAccountSettings(settings);
      if (JSON.stringify(normalized) === JSON.stringify(get().account)) return;
      set({ account: persistAccount(normalized) });
    },
  };
});
