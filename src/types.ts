export const REVIEW_POPULATION = 'lifetime:all-languages:steam-purchases:including-offtopic' as const;

export interface Fact<T> {
  value: T;
  source: 'steam-api' | 'cache' | 'page';
  fetchedAt: number;
  stale: boolean;
}

export interface Metadata {
  type: string;
  isFree: boolean;
  comingSoon: boolean;
  earlyAccess: boolean;
  priceCents?: number;
}

export interface GameFacts {
  appId: number;
  metadata?: Fact<Metadata>;
  reviews?: Fact<number>;
}

export interface PageFacts {
  metadata?: Metadata;
  reviews?: { total: number; population: typeof REVIEW_POPULATION };
}

export interface ModelConfig {
  version: 'boxleiter-v2';
  low: number;
  base: number | 'auto';
  high: number;
  discountRate: number;
  regionalFactor: number;
  refundRate: number;
  indirectTaxDeduction: number;
  steamFee: number;
}

export type Reason = 'product' | 'free' | 'unreleased' | 'no-reviews' | 'metadata' | 'price' | 'reviews' | 'numeric' | 'model' | 'connection';
export interface Scenario {
  units: number;
  effectivePriceCents: number;
  grossCents: number;
  regionalCents: number;
  discountsCents: number;
  refundsCents: number;
  taxesCents: number;
  steamCents: number;
  netCents: number;
}
export type EstimateResult =
  | { status: 'estimated'; low: Scenario; base: Scenario; high: Scenario; warnings: ('small-sample' | 'early-access' | 'stale' | 'page')[] }
  | { status: 'unsupported' | 'unavailable'; reason: Reason };

export interface FactsRequest { type: 'GET_GAME_FACTS'; appId: number; documentAppId: number; pageFacts: PageFacts }
export type FactsResponse = { ok: true; facts: GameFacts } | { ok: false; error: 'invalid-request' | 'connection' };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export const isAppId = (value: unknown): value is number => isCount(value) && value > 0;

export function isMetadata(value: unknown): value is Metadata {
  return isRecord(value) && typeof value.type === 'string' && value.type.length > 0 && value.type.length < 64
    && typeof value.isFree === 'boolean' && typeof value.comingSoon === 'boolean' && typeof value.earlyAccess === 'boolean'
    && (value.priceCents === undefined || (isCount(value.priceCents) && value.priceCents > 0));
}

export function isPageFacts(value: unknown): value is PageFacts {
  return isRecord(value)
    && Object.keys(value).every(key => key === 'metadata' || key === 'reviews')
    && (value.metadata === undefined || isMetadata(value.metadata))
    && (value.reviews === undefined || (isRecord(value.reviews) && isCount(value.reviews.total) && value.reviews.population === REVIEW_POPULATION));
}

export function appIdFromUrl(url: string): number | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://store.steampowered.com') return;
    const match = /^\/app\/(\d+)(?:\/|$)/.exec(parsed.pathname);
    const id = Number(match?.[1]);
    return isAppId(id) ? id : undefined;
  } catch { return; }
}
