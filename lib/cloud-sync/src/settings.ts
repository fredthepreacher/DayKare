/**
 * The settings split.
 *
 * Accessibility preferences follow the PLAYER; device configuration follows the
 * HARDWARE. Neither belongs in a progression save, which is where the
 * accessibility flags previously lived (inside the Online preview store, so a
 * Story-only player's accessibility choices were filed under "online").
 */

/** Synced to the account, so they follow the player to a new device. */
export interface AccountSettings {
  version: number;
  reducedMotion: boolean;
  highContrast: boolean;
  largerText: boolean;
  captionsEnabled: boolean;
}

/** Never synced. Meaningless or harmful on different hardware. */
export interface DeviceSettings {
  version: number;
  /** 'auto' lets the quality manager decide at runtime (Phase 4A). */
  quality: 'auto' | 'low' | 'medium' | 'high' | 'ultra';
  renderScale: number;
  cameraSensitivity: number;
  touchSensitivity: number;
  /** The existing in-game mute toggle. Device-local: it is about this room, not this account. */
  audioEnabled: boolean;
  hudSafeAreaOffset: number;
}

export const ACCOUNT_SETTINGS_KEY = 'daykare-account-settings';
export const DEVICE_SETTINGS_KEY = 'daykare-device-settings';

export const defaultAccountSettings = (): AccountSettings => ({
  version: 1,
  reducedMotion: false,
  highContrast: false,
  largerText: false,
  captionsEnabled: false,
});

export const defaultDeviceSettings = (): DeviceSettings => ({
  version: 1,
  quality: 'auto',
  renderScale: 1,
  cameraSensitivity: 1,
  touchSensitivity: 1,
  audioEnabled: true,
  hudSafeAreaOffset: 0,
});

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

const clampNumber = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

export function normalizeAccountSettings(raw: unknown): AccountSettings {
  const base = defaultAccountSettings();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<AccountSettings>;
  return {
    version: 1,
    reducedMotion: bool(value.reducedMotion, base.reducedMotion),
    highContrast: bool(value.highContrast, base.highContrast),
    largerText: bool(value.largerText, base.largerText),
    captionsEnabled: bool(value.captionsEnabled, base.captionsEnabled),
  };
}

export function normalizeDeviceSettings(raw: unknown): DeviceSettings {
  const base = defaultDeviceSettings();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<DeviceSettings>;
  const qualities = new Set(['auto', 'low', 'medium', 'high', 'ultra']);
  return {
    version: 1,
    quality: qualities.has(value.quality as string) ? (value.quality as DeviceSettings['quality']) : base.quality,
    renderScale: clampNumber(value.renderScale, 0.5, 2, base.renderScale),
    cameraSensitivity: clampNumber(value.cameraSensitivity, 0.25, 3, base.cameraSensitivity),
    touchSensitivity: clampNumber(value.touchSensitivity, 0.25, 3, base.touchSensitivity),
    audioEnabled: bool(value.audioEnabled, base.audioEnabled),
    hudSafeAreaOffset: clampNumber(value.hudSafeAreaOffset, 0, 200, base.hudSafeAreaOffset),
  };
}

/**
 * One-time lift of the four accessibility flags out of the legacy Online
 * preview save. The Online save is left untouched by this function - callers
 * strip the flags separately - so a failure here can never damage it.
 */
export function accountSettingsFromLegacyOnlineSave(raw: unknown): AccountSettings {
  const base = defaultAccountSettings();
  if (!raw || typeof raw !== 'object') return base;
  const legacy = raw as Record<string, unknown>;
  return {
    version: 1,
    reducedMotion: bool(legacy.reducedMotion, base.reducedMotion),
    highContrast: bool(legacy.highContrast, base.highContrast),
    largerText: bool(legacy.largerText, base.largerText),
    // audioEnabled was a mute toggle, not an accessibility preference, so it
    // is lifted into DEVICE settings instead - see deviceSettingsFromLegacyOnlineSave.
    captionsEnabled: base.captionsEnabled,
  };
}

/** The mute toggle follows the device, not the account. */
export function deviceSettingsFromLegacyOnlineSave(raw: unknown): DeviceSettings {
  const base = defaultDeviceSettings();
  if (!raw || typeof raw !== 'object') return base;
  const legacy = raw as Record<string, unknown>;
  return { ...base, audioEnabled: bool(legacy.audioEnabled, base.audioEnabled) };
}
