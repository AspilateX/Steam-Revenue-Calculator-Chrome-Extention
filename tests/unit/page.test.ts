import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findMetadataContainer, pageLanguage, readPageFacts } from '../../src/page';
import { appIdFromUrl, REVIEW_POPULATION } from '../../src/types';
import { validRequest } from '../../src/messages';

function page(language = 'english') {
  return new DOMParser().parseFromString(readFileSync(`tests/fixtures/steam-${language}.html`, 'utf8'), 'text/html');
}

describe('real Steam page fixtures', () => {
  it.each(['english', 'russian'])('selects the primary metadata container on %s page', language => {
    const doc = page(language);
    const container = findMetadataContainer(doc);
    expect(container?.closest('#glanceMidCtn')).not.toBeNull();
    expect(container?.querySelectorAll('.dev_row')).toHaveLength(2);
    expect(container?.closest('#appDetailsUnderlinedLinks')).toBeNull();
    expect(pageLanguage(doc)).toBe(language === 'russian' ? 'ru' : 'en');
  });
  it('accepts a publisher row without a recognized publisher link', () => {
    const doc = page();
    const publisher = doc.querySelector('#glanceMidCtn .dev_row:last-child .summary')!;
    publisher.textContent = 'Independent publisher';
    expect(findMetadataContainer(doc)?.lastElementChild?.textContent).toContain('Independent publisher');
  });
  it.each(['english', 'russian'])('reads ordinary USD price but rejects filtered review data on %s page', language => {
    const facts = readPageFacts(page(language), 413150);
    expect(facts.metadata).toMatchObject({ type: 'game', priceCents: 1499, isFree: false });
    expect(facts.reviews).toBeUndefined();
  });
  it('rejects non-USD and currency-less prices', () => {
    const doc = page();
    doc.querySelector('[itemprop="priceCurrency"]')!.setAttribute('content', 'CAD');
    expect(readPageFacts(doc, 413150).metadata).toBeUndefined();
    doc.querySelector('[itemprop="priceCurrency"]')!.remove();
    expect(readPageFacts(doc, 413150).metadata).toBeUndefined();
  });
  it('refuses extra editions with identical base-game titles', () => {
    const doc = page();
    const block = doc.querySelector('#game_area_purchase .game_area_purchase_game')!;
    block.parentElement!.append(block.cloneNode(true));
    expect(readPageFacts(doc, 413150).metadata).toBeUndefined();
  });
  it('accepts only explicitly unfiltered global Steam-purchase summaries', () => {
    const doc = page();
    const node = doc.querySelector('[data-featuretarget="appreviews"]')!;
    const props = JSON.parse(node.getAttribute('data-props')!);
    props.summary_options.summaryGlobalNoOutliers.bFilteredReviews = false;
    node.setAttribute('data-props', JSON.stringify(props));
    expect(readPageFacts(doc, 413150).reviews).toEqual({ total: props.filter_options.nReviewsSteamPurchase, population: REVIEW_POPULATION });
    props.summary_options.summaryGlobalNoOutliers.nAgeInDays = 30;
    node.setAttribute('data-props', JSON.stringify(props));
    expect(readPageFacts(doc, 413150).reviews).toBeUndefined();
  });
  it('does not invent a different app identity or an anchor on an age gate', () => {
    expect(readPageFacts(page(), 123)).toEqual({});
    const doc = new DOMParser().parseFromString('<h1>Age verification</h1>', 'text/html');
    expect(findMetadataContainer(doc)).toBeUndefined();
  });
});

describe('message boundary', () => {
  const sender = { id: 'extension', url: 'https://store.steampowered.com/app/413150/Game/', frameId: 0 };
  const request = { type: 'GET_GAME_FACTS', appId: 413150, documentAppId: 413150, pageFacts: {} };
  it('accepts matching app messages and rejects unrelated senders', () => {
    expect(validRequest(request, sender, 'extension')).toBe(true);
    expect(validRequest(request, { ...sender, id: 'other' }, 'extension')).toBe(false);
    expect(validRequest(request, { ...sender, frameId: 1 }, 'extension')).toBe(false);
    expect(validRequest({ ...request, documentAppId: 123 }, sender, 'extension')).toBe(false);
    expect(validRequest({ ...request, appId: 123 }, sender, 'extension')).toBe(true);
    expect(validRequest({ ...request, appId: -123 }, sender, 'extension')).toBe(false);
    expect(validRequest({ ...request, pageFacts: { reviews: { total: 100, population: 'all' } } }, sender, 'extension')).toBe(false);
    expect(validRequest({ ...request, pageFacts: { url: 'https://example.com' } }, sender, 'extension')).toBe(false);
  });
  it.each(['http://store.steampowered.com/app/1/', 'https://store.steampowered.com.evil/app/1/', 'https://example.com/app/1/', 'https://store.steampowered.com/app/0/', 'https://store.steampowered.com/app/1evil/'])('rejects URL %s', url => {
    expect(appIdFromUrl(url)).toBeUndefined();
  });
});
