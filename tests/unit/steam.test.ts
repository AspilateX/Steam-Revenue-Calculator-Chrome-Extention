import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COOLDOWN_PREFIX, endpointUrl, fetchEndpoint, getGameFacts, parseMetadata, parseReviews, retryAfterAt, TIMEOUT_MS } from '../../src/steam';
import { CACHE_PREFIX, FRESH_MS, STALE_MS } from '../../src/storage';
import { apiMetadata, apiReviews, fact, MemoryStore, metadata } from './helpers';

afterEach(() => vi.useRealTimers());
const loadJson = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8')) as unknown;

describe('Steam adapters', () => {
  it('reads real ordinary USD pricing and the summary total', () => {
    expect(parseMetadata(loadJson('appdetails-live'), 413150)).toMatchObject({ type: 'game', priceCents: 1499, isFree: false });
    expect(parseReviews(loadJson('appreviews-live'))).toBe(897540);
    expect(parseReviews(apiReviews())).toBe(100);
  });
  it('uses fixed market and explicitly defined review coverage', () => {
    const metaUrl = new URL(endpointUrl('metadata', 413150));
    expect(metaUrl.searchParams.get('cc')).toBe('us');
    const url = new URL(endpointUrl('reviews', 413150));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ language: 'all', purchase_type: 'steam', filter: 'recent', review_type: 'all', filter_offtopic_activity: '0' });
  });
  it('rejects wrong identities/malformed totals and unconfirmed USD', () => {
    expect(parseMetadata(apiMetadata(), 123)).toBeUndefined();
    expect(parseReviews({ success: 1, query_summary: { total_reviews: -1 } })).toBeUndefined();
    expect(parseMetadata(apiMetadata({ price_overview: { currency: 'CAD', initial: 2000 } }), 413150)?.priceCents).toBeUndefined();
  });
  it('does not treat a free promotion as F2P', () => {
    expect(parseMetadata(apiMetadata({ price_overview: { currency: 'USD', initial: 2000, final: 0 } }), 413150)).toMatchObject({ isFree: false, priceCents: 2000 });
  });
});

describe('request limits', () => {
  it('retries server errors once and omits credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json(apiReviews()));
    expect(await fetchEndpoint('reviews', 413150, new MemoryStore(), fetcher)).toEqual(apiReviews());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit' });
  });
  it('stops after two network failures and after one malformed response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    expect(await fetchEndpoint('reviews', 413150, new MemoryStore(), fetcher)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockReset().mockResolvedValue(new Response('not JSON'));
    expect(await fetchEndpoint('reviews', 413150, new MemoryStore(), fetcher)).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('persists 429 cooldown across requests', async () => {
    const store = new MemoryStore(), now = 1_000_000;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
    await fetchEndpoint('reviews', 413150, store, fetcher, () => now);
    expect(store.data[COOLDOWN_PREFIX + 'reviews']).toBe(now + 120_000);
    await fetchEndpoint('reviews', 413150, store, fetcher, () => now + 30_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await fetchEndpoint('reviews', 413150, store, fetcher, () => now + 120_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('parses seconds, HTTP dates and default Retry-After', () => {
    const now = Date.UTC(2026, 9, 7);
    expect(retryAfterAt('2', now)).toBe(now + 2000);
    expect(retryAfterAt(new Date(now + 6000).toUTCString(), now)).toBe(now + 6000);
    expect(retryAfterAt('invalid', now)).toBe(now + 60000);
  });
  it('aborts each stalled request after eight seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('abort')));
    }));
    const pending = fetchEndpoint('reviews', 413150, new MemoryStore(), fetcher);
    await vi.advanceTimersByTimeAsync(2 * TIMEOUT_MS);
    expect(await pending).toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('merging independent facts', () => {
  it('survives a worker restart using persisted fresh cache without requests', async () => {
    const store = new MemoryStore(), now = Date.now();
    store.data[CACHE_PREFIX + 413150] = { updatedAt: now, metadata: fact(metadata, now), reviews: fact(100, now) };
    const fetcher = vi.fn<typeof fetch>();
    expect((await getGameFacts(413150, {}, store, fetcher)).reviews).toMatchObject({ value: 100, source: 'cache', stale: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('merges current metadata with stale reviews after partial failure', async () => {
    const store = new MemoryStore(), now = Date.now();
    store.data[CACHE_PREFIX + 413150] = { updatedAt: now, reviews: fact(200, now - FRESH_MS - 1) };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes('appdetails') ? Response.json(apiMetadata()) : new Response('', { status: 403 }));
    const result = await getGameFacts(413150, {}, store, fetcher, () => now);
    expect(result.metadata?.source).toBe('steam-api'); expect(result.reviews).toMatchObject({ value: 200, stale: true });
  });
  it('never replaces current F2P or missing USD price with an older paid price', async () => {
    const store = new MemoryStore(), now = Date.now();
    store.data[CACHE_PREFIX + 413150] = { updatedAt: now, metadata: fact(metadata, now - FRESH_MS - 1) };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => String(url).includes('appdetails') ? Response.json(apiMetadata({ is_free: true, price_overview: undefined })) : Response.json(apiReviews()));
    expect((await getGameFacts(413150, { metadata }, store, fetcher)).metadata?.value).toMatchObject({ isFree: true });
    store.data[CACHE_PREFIX + 413150] = { updatedAt: now, metadata: fact(metadata, now - FRESH_MS - 1) };
    fetcher.mockImplementation(async url => String(url).includes('appdetails') ? Response.json(apiMetadata({ price_overview: undefined })) : Response.json(apiReviews()));
    expect((await getGameFacts(413150, { metadata }, store, fetcher)).metadata?.value.priceCents).toBeUndefined();
  });
  it('uses page facts when no eligible cache exists, or leaves facts unknown', async () => {
    const store = new MemoryStore(), now = Date.now();
    store.data[CACHE_PREFIX + 413150] = { updatedAt: now, metadata: fact(metadata, now - STALE_MS - 1) };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 403 }));
    expect((await getGameFacts(413150, { metadata }, store, fetcher)).metadata?.source).toBe('page');
    expect((await getGameFacts(413150, {}, store, fetcher)).metadata).toBeUndefined();
  });
});
