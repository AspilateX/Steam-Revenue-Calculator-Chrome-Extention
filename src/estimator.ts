import { isCount, isRecord, type EstimateResult, type GameFacts, type ModelConfig, type Scenario } from './types';

export const DEFAULT_MODEL: Readonly<ModelConfig> = Object.freeze({
  version: 'boxleiter-v2', low: 20, base: 'auto', high: 60,
  discountRate: 0.20, regionalFactor: 0.91, refundRate: 0.12, indirectTaxDeduction: 0.20, steamFee: 0.30,
});

// Exact tiers used by steam-revenue-calculator.com (including its strict boundaries).
export function reviewMultiplier(reviews: number): number {
  return reviews < 999 ? 20 : reviews < 9999 ? 36 : reviews < 49999 ? 49 : reviews < 99999 ? 59 : 48;
}

export function isModel(value: unknown): value is ModelConfig {
  if (!isRecord(value) || value.version !== 'boxleiter-v2') return false;
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (!positive(value.low) || !positive(value.high) || value.low > value.high) return false;
  if (value.base !== 'auto' && (!positive(value.base) || value.low > value.base || value.base > value.high)) return false;
  if (!positive(value.regionalFactor) || value.regionalFactor > 1) return false;
  const validRates = ['discountRate', 'refundRate', 'indirectTaxDeduction', 'steamFee'].every(key => {
    const v = value[key];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1;
  });
  return validRates && Number(value.discountRate) + Number(value.refundRate) <= Number(value.regionalFactor)
    && Number(value.indirectTaxDeduction) + Number(value.steamFee) <= 1;
}

function calculate(reviews: number, price: number, multiplier: number, model: ModelConfig): Scenario | undefined {
  const units = reviews * multiplier;
  const gross = units * price;
  const regional = gross * (1 - model.regionalFactor);
  const discounts = gross * model.discountRate;
  const refunds = gross * model.refundRate;
  const adjusted = gross * Math.max(0, model.regionalFactor - model.discountRate - model.refundRate);
  const taxes = adjusted * model.indirectTaxDeduction;
  const steam = adjusted * model.steamFee;
  const net = adjusted * Math.max(0, 1 - model.indirectTaxDeduction - model.steamFee);
  const effectivePriceCents = price * (model.regionalFactor - model.discountRate);
  if (![units, effectivePriceCents, gross, regional, discounts, refunds, taxes, steam, net].every(v => Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER)) return;
  return { units, effectivePriceCents, grossCents: Math.round(gross), regionalCents: Math.round(regional), discountsCents: Math.round(discounts), refundsCents: Math.round(refunds), taxesCents: Math.round(taxes), steamCents: Math.round(steam), netCents: Math.round(net) };
}

export function estimate(facts: GameFacts, model: ModelConfig): EstimateResult {
  if (!isModel(model)) return { status: 'unavailable', reason: 'model' };
  const metadata = facts.metadata?.value;
  if (!metadata) return { status: 'unavailable', reason: 'metadata' };
  if (metadata.type !== 'game') return { status: 'unsupported', reason: 'product' };
  if (metadata.isFree) return { status: 'unsupported', reason: 'free' };
  if (metadata.comingSoon) return { status: 'unsupported', reason: 'unreleased' };
  if (!isCount(metadata.priceCents) || metadata.priceCents <= 0) return { status: 'unavailable', reason: 'price' };
  const reviews = facts.reviews?.value;
  if (!isCount(reviews)) return { status: 'unavailable', reason: 'reviews' };
  if (reviews === 0) return { status: 'unsupported', reason: 'no-reviews' };
  const multiplier = model.base === 'auto' ? reviewMultiplier(reviews) : model.base;
  const low = calculate(reviews, metadata.priceCents, Math.min(model.low, multiplier), model);
  const base = calculate(reviews, metadata.priceCents, multiplier, model);
  const high = calculate(reviews, metadata.priceCents, Math.max(model.high, multiplier), model);
  if (!low || !base || !high) return { status: 'unavailable', reason: 'numeric' };
  const warnings: Extract<EstimateResult, { status: 'estimated' }>['warnings'] = [];
  if (reviews < 10) warnings.push('small-sample');
  if (metadata.earlyAccess) warnings.push('early-access');
  if (facts.metadata?.stale || facts.reviews?.stale) warnings.push('stale');
  if (facts.metadata?.source === 'page' || facts.reviews?.source === 'page') warnings.push('page');
  return { status: 'estimated', low, base, high, warnings };
}
