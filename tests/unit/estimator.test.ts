import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, estimate, isModel, reviewMultiplier } from '../../src/estimator';
import { game, metadata } from './helpers';

describe('Boxleiter financial semantics', () => {
  it('matches the specified financial example and sensitivity bounds', () => {
    const result = estimate(game(), { ...DEFAULT_MODEL });
    expect(result.status).toBe('estimated');
    if (result.status !== 'estimated') throw new Error('Expected estimate');
    expect(result.base).toMatchObject({ units: 2000, effectivePriceCents: 1420, grossCents: 4000000, regionalCents: 360000, discountsCents: 800000, refundsCents: 480000, taxesCents: 472000, steamCents: 708000, netCents: 1180000 });
    expect(result.low).toMatchObject({ units: 2000, grossCents: 4000000, netCents: 1180000 });
    expect(result.high).toMatchObject({ units: 6000, grossCents: 12000000, netCents: 3540000 });
  });
  it('matches the reference homepage example to cents', () => {
    const result = estimate(game(1540, { ...metadata, priceCents: 1499 }), { ...DEFAULT_MODEL });
    if (result.status !== 'estimated') throw new Error('Expected estimate');
    expect(result.base).toMatchObject({ units: 55440, grossCents: 83104560, regionalCents: 7479410, discountsCents: 16620912, refundsCents: 9972547, steamCents: 14709507, taxesCents: 9806338, netCents: 24515845 });
  });
  it.each([[998,20],[999,36],[9998,36],[9999,49],[49998,49],[49999,59],[99998,59],[99999,48]])('uses reference tiers at %i reviews', (reviews, multiplier) => {
    expect(reviewMultiplier(reviews)).toBe(multiplier);
  });
  it('applies independently editable deductions in the documented order', () => {
    const result = estimate(game(), { ...DEFAULT_MODEL, discountRate: 0, regionalFactor: 1, refundRate: 0, indirectTaxDeduction: 0, steamFee: 0 });
    if (result.status !== 'estimated') throw new Error('Expected estimate');
    expect(result.base.grossCents).toBe(4_000_000);
    expect(result.base.netCents).toBe(result.base.grossCents);
  });
  it('does not round intermediate price or financial steps', () => {
    const result = estimate(game(1, { ...metadata, priceCents: 1999 }), { ...DEFAULT_MODEL, base: 35.5 });
    if (result.status !== 'estimated') throw new Error('Expected estimate');
    expect(result.base.netCents).toBe(Math.round(1999 * 35.5 * .59 * .5));
  });
  it('handles zero balances without floating-point negatives', () => {
    const result = estimate(game(1, { ...metadata, priceCents: 1999 }), { ...DEFAULT_MODEL, regionalFactor: .32, discountRate: .2, refundRate: .12 });
    if (result.status !== 'estimated') throw new Error('Expected estimate');
    expect(result.base.netCents).toBe(0);
  });
  it.each([
    [{ ...metadata, type: 'dlc' }, 'product'], [{ ...metadata, type: 'demo' }, 'product'],
    [{ ...metadata, isFree: true }, 'free'], [{ ...metadata, comingSoon: true }, 'unreleased'],
  ] as const)('rejects ineligible product %#', (meta, reason) => {
    expect(estimate(game(100, meta), { ...DEFAULT_MODEL })).toEqual({ status: 'unsupported', reason });
  });
  it('distinguishes zero reviews from missing reviews and prices', () => {
    expect(estimate(game(0), { ...DEFAULT_MODEL })).toEqual({ status: 'unsupported', reason: 'no-reviews' });
    expect(estimate({ ...game(), reviews: undefined }, { ...DEFAULT_MODEL })).toEqual({ status: 'unavailable', reason: 'reviews' });
    expect(estimate(game(100, { ...metadata, priceCents: undefined }), { ...DEFAULT_MODEL })).toEqual({ status: 'unavailable', reason: 'price' });
    expect(estimate({ appId: 413150 }, { ...DEFAULT_MODEL })).toEqual({ status: 'unavailable', reason: 'metadata' });
  });
  it('attaches meaningful data quality warnings', () => {
    const facts = game(5, { ...metadata, earlyAccess: true });
    facts.reviews!.source = 'page'; facts.metadata!.stale = true;
    const result = estimate(facts, { ...DEFAULT_MODEL });
    if (result.status !== 'estimated') throw new Error('Expected estimate');
    expect(result.warnings).toEqual(['small-sample', 'early-access', 'stale', 'page']);
  });
  it('fails safely on monetary overflow', () => {
    expect(estimate(game(Number.MAX_SAFE_INTEGER), { ...DEFAULT_MODEL }).status).toBe('unavailable');
  });
});

describe('settings validation', () => {
  it.each([{ base: 0 }, { low: 40, base: 35 }, { high: 10 }, { regionalFactor: 0 }, { regionalFactor: 1.01 }, { refundRate: 1 }, { steamFee: -1 }, { indirectTaxDeduction: NaN }, { discountRate: Infinity }, { discountRate: .8 }, { steamFee: .9 }])('rejects invalid model %j', change => {
    expect(isModel({ ...DEFAULT_MODEL, ...change })).toBe(false);
  });
  it('permits equal multipliers and zero deductions', () => {
    expect(isModel({ ...DEFAULT_MODEL, low: 35, high: 35, refundRate: 0 })).toBe(true);
  });
});
