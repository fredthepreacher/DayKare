export const GUMMY_GROWTH_MINUTES = 5 * 60;
export const GUMMY_HARVEST_SIZE = 10;
export const GUMMY_FULL_CROP_CASH = 30;
export const GUMMY_UNIT_CASH = GUMMY_FULL_CROP_CASH / GUMMY_HARVEST_SIZE;

export interface GummyCropState {
  plantedAt: number | null;
  gummyDrops: number;
  harvests: number;
}

export const createGummyCrop = (): GummyCropState => ({
  plantedAt: null,
  gummyDrops: 0,
  harvests: 0,
});

export function absoluteGameMinute(day: number, minute: number) {
  return Math.max(0, Math.trunc(day) - 1) * 1440 + Math.max(0, minute);
}

export function cropProgress(crop: GummyCropState, now: number) {
  if (crop.plantedAt === null) return 0;
  return Math.min(1, Math.max(0, (now - crop.plantedAt) / GUMMY_GROWTH_MINUTES));
}

export function cropIsReady(crop: GummyCropState, now: number) {
  return crop.plantedAt !== null && cropProgress(crop, now) >= 1;
}

export function normalizeGummyCrop(value: unknown): GummyCropState {
  if (!value || typeof value !== 'object') return createGummyCrop();
  const raw = value as Partial<GummyCropState>;
  return {
    plantedAt: typeof raw.plantedAt === 'number' && Number.isFinite(raw.plantedAt) ? Math.max(0, raw.plantedAt) : null,
    gummyDrops: typeof raw.gummyDrops === 'number' && Number.isFinite(raw.gummyDrops) ? Math.min(999, Math.max(0, Math.floor(raw.gummyDrops))) : 0,
    harvests: typeof raw.harvests === 'number' && Number.isFinite(raw.harvests) ? Math.min(99_999, Math.max(0, Math.floor(raw.harvests))) : 0,
  };
}
