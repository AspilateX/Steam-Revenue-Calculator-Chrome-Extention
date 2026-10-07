import { cachedFact, readCache, writeCache, type LocalStore } from './storage';
import { isCount, isRecord, type Fact, type GameFacts, type Metadata, type PageFacts } from './types';

export type Endpoint = 'metadata' | 'reviews';
export const COOLDOWN_PREFIX = 'revenue:cooldown:';
export const TIMEOUT_MS = 8000;

export function endpointUrl(endpoint: Endpoint, appId: number): string {
  const url = new URL(endpoint === 'metadata' ? '/api/appdetails' : `/appreviews/${appId}`, 'https://store.steampowered.com');
  url.search = endpoint === 'metadata'
    ? new URLSearchParams({ appids: String(appId), cc: 'us', l: 'english' }).toString()
    : new URLSearchParams({ json: '1', language: 'all', purchase_type: 'steam', review_type: 'all', filter: 'recent', num_per_page: '1', filter_offtopic_activity: '0' }).toString();
  return url.href;
}

export function parseMetadata(json: unknown, appId: number): Metadata | undefined {
  if (!isRecord(json)) return;
  const item = json[String(appId)];
  if (!isRecord(item) || item.success !== true || !isRecord(item.data)) return;
  const data = item.data;
  if (data.steam_appid !== appId || typeof data.type !== 'string' || !data.type || typeof data.is_free !== 'boolean'
    || !isRecord(data.release_date) || typeof data.release_date.coming_soon !== 'boolean') return;
  const price = data.price_overview;
  return {
    type: data.type, isFree: data.is_free, comingSoon: data.release_date.coming_soon,
    earlyAccess: Array.isArray(data.genres) && data.genres.some(v => isRecord(v) && v.id === '70'),
    ...(isRecord(price) && price.currency === 'USD' && isCount(price.initial) && price.initial > 0 ? { priceCents: price.initial } : {}),
  };
}

export function parseReviews(json: unknown): number | undefined {
  if (!isRecord(json) || json.success !== 1 || !isRecord(json.query_summary)) return;
  return isCount(json.query_summary.total_reviews) ? json.query_summary.total_reviews : undefined;
}

export function retryAfterAt(value: string | null, now: number): number {
  if (value !== null && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.min(now + seconds * 1000, Number.MAX_SAFE_INTEGER);
  }
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.max(date, now) : now + 60_000;
}

export async function fetchEndpoint(endpoint: Endpoint, appId: number, store: LocalStore, fetcher: typeof fetch = fetch, clock = Date.now): Promise<unknown> {
  const key = COOLDOWN_PREFIX + endpoint;
  try {
    const next = (await store.get(key))[key];
    if (typeof next === 'number' && next > clock()) return;
  } catch { /* Live requests can still work without cache. */ }
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    // This timer bounds a single active request, not persistent background work.
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetcher(endpointUrl(endpoint, appId), { credentials: 'omit', signal: controller.signal });
      if (response.status === 429) {
        try { await store.set({ [key]: retryAfterAt(response.headers.get('Retry-After'), clock()) }); } catch { /* No retry in this handler. */ }
        return;
      }
      if (response.status >= 500 && attempt === 0) continue;
      if (!response.ok) return;
      // Invalid JSON is not a retryable network failure.
      try { return await response.json(); } catch { return; }
    } catch { if (attempt === 1) return; }
    finally { clearTimeout(timeout); }
  }
}

export async function getGameFacts(appId: number, page: PageFacts, store: LocalStore, fetcher: typeof fetch = fetch, clock = Date.now): Promise<GameFacts> {
  const now = clock();
  const cache = await readCache(store, appId);
  const oldMetadata = cachedFact(cache.metadata, now);
  const oldReviews = cachedFact(cache.reviews, now);
  const metadataFresh = oldMetadata && !oldMetadata.stale;
  const reviewsFresh = oldReviews && !oldReviews.stale;
  const [metaResponse, reviewResponse] = await Promise.allSettled([
    metadataFresh ? Promise.resolve(undefined) : fetchEndpoint('metadata', appId, store, fetcher, clock),
    reviewsFresh ? Promise.resolve(undefined) : fetchEndpoint('reviews', appId, store, fetcher, clock),
  ]);
  const liveMeta = metaResponse.status === 'fulfilled' ? parseMetadata(metaResponse.value, appId) : undefined;
  const liveReviews = reviewResponse.status === 'fulfilled' ? parseReviews(reviewResponse.value) : undefined;
  const liveFact = <T>(value: T): Fact<T> => ({ value, source: 'steam-api', fetchedAt: clock(), stale: false });
  const pageFact = <T>(value: T): Fact<T> => ({ value, source: 'page', fetchedAt: now, stale: false });
  const newMetadata = liveMeta ? liveFact(liveMeta) : undefined;
  const newReviews = liveReviews !== undefined ? liveFact(liveReviews) : undefined;
  // A successful metadata response with no price is authoritative; an older
  // price must not disguise current purchase unavailability or another currency.
  const facts: GameFacts = {
    appId,
    metadata: newMetadata ?? oldMetadata ?? (page.metadata ? pageFact(page.metadata) : undefined),
    reviews: newReviews ?? oldReviews ?? (page.reviews ? pageFact(page.reviews.total) : undefined),
  };
  if (newMetadata || newReviews) await writeCache(store, appId, {
    updatedAt: clock(), metadata: newMetadata ?? cache.metadata, reviews: newReviews ?? cache.reviews,
  });
  return facts;
}
