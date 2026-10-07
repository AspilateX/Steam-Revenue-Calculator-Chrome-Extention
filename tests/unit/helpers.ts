import { type LocalStore } from '../../src/storage';
import { type GameFacts, type Metadata } from '../../src/types';

export class MemoryStore implements LocalStore {
  data: Record<string, unknown> = {};
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    const selected = keys === null ? Object.keys(this.data) : Array.isArray(keys) ? keys : [keys];
    return structuredClone(Object.fromEntries(selected.filter(key => key in this.data).map(key => [key, this.data[key]])));
  }
  async set(items: Record<string, unknown>): Promise<void> { Object.assign(this.data, structuredClone(items)); }
  async remove(keys: string | string[]): Promise<void> { for (const key of typeof keys === 'string' ? [keys] : keys) delete this.data[key]; }
}
export const metadata: Metadata = { type: 'game', isFree: false, comingSoon: false, earlyAccess: false, priceCents: 2000 };
export const fact = <T>(value: T, fetchedAt = Date.now()) => ({ value, fetchedAt, source: 'steam-api' as const, stale: false });
export const game = (reviews = 100, meta: Metadata = metadata): GameFacts => ({ appId: 413150, metadata: fact(meta), reviews: fact(reviews) });
export const apiMetadata = (overrides: Record<string, unknown> = {}) => ({ '413150': { success: true, data: { steam_appid: 413150, type: 'game', is_free: false, release_date: { coming_soon: false }, price_overview: { currency: 'USD', initial: 2000, final: 1000 }, ...overrides } } });
export const apiReviews = (total = 100) => ({ success: 1, query_summary: { num_reviews: 1, total_reviews: total } });
