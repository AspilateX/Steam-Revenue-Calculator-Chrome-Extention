import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL } from '../../src/estimator';
import { cachedFact, CACHE_PREFIX, FRESH_MS, readCache, readModel, saveModel, SETTINGS_KEY, STALE_MS, writeCache } from '../../src/storage';
import { fact, MemoryStore, metadata } from './helpers';

describe('persistent facts and model settings', () => {
  it('preserves a profile and restores defaults without mutating saved data', async () => {
    const store = new MemoryStore();
    const model = { ...DEFAULT_MODEL, steamFee: .2 };
    expect(await saveModel(store, model)).toBe(true);
    expect(await readModel(store)).toEqual(model);
    expect(await saveModel(store, { ...model, base: -1 })).toBe(false);
    expect(await readModel(store)).toEqual(model);
    await saveModel(store, { ...DEFAULT_MODEL });
    expect(await readModel(store)).toEqual(DEFAULT_MODEL);
  });
  it('falls back on invalid saved settings and reports failed writes', async () => {
    const store = new MemoryStore(); store.data[SETTINGS_KEY] = { base: 'invalid' };
    expect(await readModel(store)).toEqual(DEFAULT_MODEL);
    store.set = async () => { throw new Error('quota'); };
    expect(await saveModel(store, { ...DEFAULT_MODEL })).toBe(false);
  });
  it('updates old defaults and preserves customized net during migration', async () => {
    const store = new MemoryStore();
    const old = { version: 'boxleiter-v1', low: 20, base: 35, high: 60, discountRate: .3, regionalFactor: .8, refundRate: .08, indirectTaxDeduction: .1, steamFee: .3 };
    store.data[SETTINGS_KEY] = old;
    expect(await readModel(store)).toEqual(DEFAULT_MODEL);
    store.data[SETTINGS_KEY] = { ...old, steamFee: .2 };
    const migrated = await readModel(store);
    expect(migrated.base).toBe(35);
    expect(migrated.regionalFactor - migrated.discountRate - migrated.refundRate).toBeCloseTo(.8 * .7 * .92);
    expect(1 - migrated.indirectTaxDeduction - migrated.steamFee).toBeCloseTo(.9 * .8);
  });
  it('marks age accurately and rejects old/future timestamps', () => {
    const now = 10 * FRESH_MS;
    expect(cachedFact(fact(100, now - FRESH_MS), now)?.stale).toBe(false);
    expect(cachedFact(fact(100, now - FRESH_MS - 1), now)?.stale).toBe(true);
    expect(cachedFact(fact(100, now - STALE_MS - 1), now)).toBeUndefined();
    expect(cachedFact(fact(100, now + 1), now)).toBeUndefined();
  });
  it('bounds the cache and keeps model settings across eviction', async () => {
    const store = new MemoryStore(); await saveModel(store, { ...DEFAULT_MODEL });
    for (let id = 1; id <= 200; id++) store.data[CACHE_PREFIX + id] = { updatedAt: id, reviews: fact(id, id) };
    await writeCache(store, 201, { updatedAt: 201, metadata: fact(metadata, 201) });
    expect(Object.keys(store.data).filter(k => k.startsWith(CACHE_PREFIX))).toHaveLength(200);
    expect((await readCache(store, 1)).reviews).toBeUndefined();
    expect(await readModel(store)).toEqual(DEFAULT_MODEL);
  });
  it('ignores incompatible keys and corrupted cached facts after restart', async () => {
    const store = new MemoryStore();
    store.data['revenue:facts:v0:413150'] = { reviews: fact(100) };
    store.data[CACHE_PREFIX + 413150] = { updatedAt: 123, reviews: fact('100'), metadata: { value: metadata } };
    expect(await readCache(store, 413150)).toEqual({ updatedAt: 123 });
  });
});
