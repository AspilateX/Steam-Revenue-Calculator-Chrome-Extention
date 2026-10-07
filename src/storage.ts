import { DEFAULT_MODEL, isModel } from './estimator';
import { isCount, isMetadata, isRecord, type Fact, type Metadata, type ModelConfig } from './types';

export interface LocalStore {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}
export const SETTINGS_KEY = 'revenue:model';
export const CACHE_PREFIX = 'revenue:facts:v1:US:USD:all:steam:offtopic:';
export const FRESH_MS = 24 * 60 * 60 * 1000;
export const STALE_MS = 7 * FRESH_MS;
export interface CacheEntry { updatedAt: number; metadata?: Fact<Metadata>; reviews?: Fact<number> }

export async function readModel(store: LocalStore): Promise<ModelConfig> {
  try {
    const saved = (await store.get(SETTINGS_KEY))[SETTINGS_KEY];
    if (isModel(saved)) return { ...saved };
    if (isRecord(saved) && saved.version === 'boxleiter-v1') {
      const previous = { version: 'boxleiter-v1', low: 20, base: 35, high: 60, discountRate: .30, regionalFactor: .80, refundRate: .08, indirectTaxDeduction: .10, steamFee: .30 };
      if (Object.entries(previous).every(([key, value]) => saved[key] === value)) return { ...DEFAULT_MODEL };
      // Preserve the net calculation of a customized v1 profile under additive deductions.
      const migrated = { ...saved, version: 'boxleiter-v2',
        discountRate: Number(saved.discountRate) * Number(saved.regionalFactor),
        refundRate: Number(saved.refundRate) * Number(saved.regionalFactor) * (1 - Number(saved.discountRate)),
        steamFee: Number(saved.steamFee) * (1 - Number(saved.indirectTaxDeduction)),
      };
      if (isModel(migrated)) return migrated;
    }
  } catch { /* Defaults also work when storage is unavailable. */ }
  return { ...DEFAULT_MODEL };
}

export async function saveModel(store: LocalStore, model: ModelConfig): Promise<boolean> {
  if (!isModel(model)) return false;
  try { await store.set({ [SETTINGS_KEY]: model }); return true; } catch { return false; }
}

function isCachedFact<T>(v: unknown, validate: (v: unknown) => v is T): v is Fact<T> {
  return isRecord(v) && validate(v.value) && isCount(v.fetchedAt) && v.source === 'steam-api' && v.stale === false;
}

export async function readCache(store: LocalStore, id: number): Promise<CacheEntry> {
  try {
    const value = (await store.get(CACHE_PREFIX + id))[CACHE_PREFIX + id];
    if (isRecord(value) && isCount(value.updatedAt)) {
      return {
        updatedAt: value.updatedAt,
        ...(isCachedFact(value.metadata, isMetadata) ? { metadata: value.metadata } : {}),
        ...(isCachedFact(value.reviews, isCount) ? { reviews: value.reviews } : {}),
      };
    }
  } catch { /* Cache is optional. */ }
  return { updatedAt: 0 };
}

export function cachedFact<T>(fact: Fact<T> | undefined, now: number): Fact<T> | undefined {
  if (!fact || fact.fetchedAt > now || now - fact.fetchedAt > STALE_MS) return;
  return { ...fact, source: 'cache', stale: now - fact.fetchedAt > FRESH_MS };
}

export async function writeCache(store: LocalStore, id: number, entry: CacheEntry): Promise<void> {
  try {
    await store.set({ [CACHE_PREFIX + id]: entry });
    const all = await store.get(null);
    const keys = Object.keys(all).filter(key => key.startsWith(CACHE_PREFIX)).sort((a, b) => {
      const left = all[a], right = all[b];
      return Number(isRecord(left) ? left.updatedAt : 0) - Number(isRecord(right) ? right.updatedAt : 0);
    });
    if (keys.length > 200) await store.remove(keys.slice(0, keys.length - 200));
  } catch { /* A valid live response is still usable if its cache write fails. */ }
}
