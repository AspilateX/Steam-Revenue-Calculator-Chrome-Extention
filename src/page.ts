import { isCount, isRecord, REVIEW_POPULATION, type PageFacts } from './types';

export const HOST_ID = 'steam-revenue-estimate';

export function findMetadataContainer(doc: Document): HTMLElement | undefined {
  const container = doc.querySelector<HTMLElement>('#glanceMidCtn .glance_ctn_responsive_left')
    ?? doc.querySelector<HTMLElement>('.game_header .glance_ctn_responsive_left');
  // Publisher rows can contain plain text or links outside /publisher/.
  // Use the metadata container so no existing or later-added row is split.
  return container?.querySelector('.dev_row') ? container : undefined;
}

export function pageLanguage(doc: Document): 'ru' | 'en' {
  const language = doc.documentElement.lang.toLowerCase();
  return language.startsWith('ru') ? 'ru' : 'en';
}

function reviewProps(doc: Document, appId: number): Record<string, unknown> | undefined {
  const raw = doc.querySelector('[data-featuretarget="appreviews"][data-props]')?.getAttribute('data-props');
  if (!raw || raw.length > 100_000) return;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) && parsed.appid === appId ? parsed : undefined;
  } catch { return; }
}

function usdCents(text: string): number | undefined {
  // Currency is independently confirmed by microdata, not this dollar sign.
  const match = /^\$\s*([\d,]+)\.(\d{2})$/.exec(text.trim());
  if (!match) return;
  const amount = Number(match[1]?.replaceAll(',', '')) * 100 + Number(match[2]);
  return isCount(amount) && amount > 0 ? amount : undefined;
}

export function readPageFacts(doc: Document, appId: number, now = Date.now()): PageFacts {
  const result: PageFacts = {};
  const props = reviewProps(doc, appId);
  if (!props) return result;
  const options = props.summary_options;
  const filters = props.filter_options;
  // The visible reviewCount may be language-specific. Only explicitly unfiltered
  // global Steam-purchase data can satisfy the configured review population.
  if (isRecord(options) && isRecord(filters)) {
    const summary = options.summaryGlobalNoOutliers;
    if (isRecord(summary) && summary.bFilteredReviews === false && summary.nAgeInDays === 0
      && isCount(summary.nReviews) && summary.nReviews === filters.nReviewsSteamPurchase) {
      result.reviews = { total: summary.nReviews, population: REVIEW_POPULATION };
    }
  }
  if (props.app_type !== 0 || doc.querySelector('.game_area_dlc_bubble, .game_area_comingsoon, .game_area_purchase_game pre')) return result;
  const released = Number(props.app_release_date);
  if (!Number.isFinite(released) || released <= 0 || released * 1000 > now || typeof props.appname !== 'string') return result;
  const product = doc.querySelector('.page_content_ctn[itemtype$="/Product"]');
  const currency = product?.querySelector('[itemprop="offers"] [itemprop="priceCurrency"]')?.getAttribute('content');
  if (currency !== 'USD') return result;
  const purchases = [...doc.querySelectorAll<HTMLElement>('#game_area_purchase .game_area_purchase_game')].filter(block => {
    const title = block.querySelector('h2')?.textContent?.trim();
    return title === `Buy ${props.appname}` || title === `Купить ${props.appname}`;
  });
  if (purchases.length !== 1) return result;
  const block = purchases[0]!;
  if (block.querySelector('[data-bundleid], .game_area_purchase_game_dropdown_selection')) return result;
  const ordinary = block.querySelector('.discount_original_price') ?? block.querySelector('.game_purchase_price');
  const priceCents = ordinary ? usdCents(ordinary.textContent ?? '') : undefined;
  if (!priceCents) return result;
  result.metadata = {
    type: 'game', isFree: false, comingSoon: false,
    earlyAccess: Boolean(doc.querySelector('.early_access_header, .early_access_banner')), priceCents,
  };
  return result;
}
