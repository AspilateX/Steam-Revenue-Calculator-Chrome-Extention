import { DEFAULT_MODEL, estimate, isModel, reviewMultiplier } from './estimator';
import type { EstimateResult, GameFacts, ModelConfig, Reason } from './types';
import styles from './ui.css?inline';

const copy = {
  en: {
    title: 'Estimated lifetime revenue', details: 'Details', loading: 'Getting Steam data…', unavailable: 'Estimate unavailable', unsupported: 'Estimate not applicable',
    gross: 'Gross', net: 'Net', sales: 'Copies', reviews: 'Reviews', price: 'Price',
    regional: 'Regional pricing', discounts: 'Discounts', refunds: 'Refunds', taxes: 'Taxes', steam: 'Steam cut',
    low: 'Min multiplier', base: 'Multiplier', high: 'Max multiplier', auto: 'Automatic multiplier', discountRate: 'Discounts (%)', regionalFactor: 'Regional price (%)', refundRate: 'Refunds (%)', indirectTaxDeduction: 'Taxes (%)', steamFee: 'Steam commission (%)',
    assumptions: 'Edit assumptions', save: 'Apply & save', reset: 'Reset defaults', saved: 'Saved for all games.', notSaved: 'Applied on this page, but could not be saved.',
    invalid: 'Enter valid numbers. Multipliers must be positive and ordered; deductions must leave a non-negative balance.',
    method: 'About the Boxleiter method',
    small: 'Very few reviews: highly uncertain estimate', early: 'Early Access', stale: 'Using older cached data', fallback: 'Using page data',
  },
  ru: {
    title: 'Приблизительная выручка за всё время', details: 'Детализация', loading: 'Получаем данные Steam…', unavailable: 'Оценка недоступна', unsupported: 'Расчёт неприменим',
    gross: 'Gross', net: 'Net', sales: 'Копии', reviews: 'Отзывы', price: 'Цена',
    regional: 'Региональные цены', discounts: 'Скидки', refunds: 'Возвраты', taxes: 'Налоги', steam: 'Комиссия Steam',
    low: 'Мин. множитель', base: 'Множитель', high: 'Макс. множитель', auto: 'Автоматический множитель', discountRate: 'Скидки (%)', regionalFactor: 'Региональная цена (%)', refundRate: 'Возвраты (%)', indirectTaxDeduction: 'Налоги (%)', steamFee: 'Комиссия Steam (%)',
    assumptions: 'Изменить допущения', save: 'Применить и сохранить', reset: 'Сбросить', saved: 'Сохранено для всех игр.', notSaved: 'Применено на этой странице, но сохранить не удалось.',
    invalid: 'Введите корректные числа. Множители должны быть положительными и идти по возрастанию; вычитания не должны давать отрицательный остаток.',
    method: 'О методе Boxleiter',
    small: 'Очень мало отзывов: высокая неопределённость', early: 'Ранний доступ', stale: 'Используется устаревший кеш', fallback: 'Используются данные страницы',
  },
};

const reasons: Record<'en' | 'ru', Record<Reason, string>> = {
  en: { product: 'Only base games are supported.', free: 'F2P revenue cannot be estimated from the purchase price.', unreleased: 'The game has not been released.', 'no-reviews': 'No reviews yet.', metadata: 'Game eligibility could not be confirmed.', price: 'No trustworthy ordinary USD price.', reviews: 'No compatible global lifetime review count.', numeric: 'Values exceed safe numerical limits.', model: 'Invalid model settings.', connection: 'Steam data could not be retrieved.' },
  ru: { product: 'Поддерживаются только основные игры.', free: 'Доход F2P нельзя оценить по цене покупки.', unreleased: 'Игра ещё не вышла.', 'no-reviews': 'Отзывов пока нет.', metadata: 'Не удалось подтвердить тип и статус игры.', price: 'Нет подтверждённой обычной цены в USD.', reviews: 'Нет совместимого числа отзывов за всё время по всем языкам.', numeric: 'Значения превышают пределы безопасного расчёта.', model: 'Некорректные параметры модели.', connection: 'Не удалось получить данные Steam.' },
};

export type UiState = { status: 'loading' } | { status: 'ready'; facts: GameFacts } | { status: 'failed'; reason: Reason };
type Parameter = Exclude<keyof ModelConfig, 'version'>;
const parameters: Parameter[] = ['low', 'base', 'high', 'discountRate', 'regionalFactor', 'refundRate', 'indirectTaxDeduction', 'steamFee'];
const isMultiplier = (key: Parameter) => key === 'low' || key === 'base' || key === 'high';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function renderRevenue(host: HTMLElement, state: UiState, model: ModelConfig, language: 'en' | 'ru', onSave: (model: ModelConfig) => Promise<boolean>, notice = ''): void {
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const wasOpen = root.querySelector<HTMLDetailsElement>('.details')?.open ?? false;
  const settingsOpen = !root.querySelector<HTMLElement>('.settings-panel')?.hidden && root.querySelector('.settings-panel') !== null;
  const t = copy[language];
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const money = (cents: number, whole = false) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
  const rangeMoney = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', currencyDisplay: 'code', notation: 'compact', maximumFractionDigits: 1 });
  const number = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  const style = el('style', styles);
  const frame = el('div', undefined, 'frame');
  const section = el('section');
  frame.append(section);
  section.setAttribute('aria-label', t.title);
  const header = el('header');
  header.append(el('h3', t.title));
  section.append(header);
  root.replaceChildren(style, frame);
  host.dataset.state = state.status;
  if (state.status === 'loading') { section.append(el('p', t.loading, 'muted')); return; }
  const result: EstimateResult = state.status === 'failed' ? { status: 'unavailable', reason: state.reason } : estimate(state.facts, model);
  host.dataset.state = result.status;
  if (result.status !== 'estimated' || state.status !== 'ready') {
    const reason = result.status === 'estimated' ? 'connection' : result.reason;
    section.append(el('p', `${result.status === 'unsupported' ? t.unsupported : t.unavailable}: ${reasons[language][reason]}`, 'muted'));
    return;
  }
  for (const [label, amount, low, high] of [
    [t.gross, result.base.grossCents, result.low.grossCents, result.high.grossCents],
    [t.net, result.base.netCents, result.low.netCents, result.high.netCents],
  ] as const) {
    const row = el('div', undefined, 'amount');
    row.append(el('span', label), el('strong', `≈ ${money(amount, true)}`));
    section.append(row, el('p', `${rangeMoney.format(low / 100)} – ${rangeMoney.format(high / 100)}`, 'range'));
  }
  const warningLabels = { 'small-sample': t.small, 'early-access': t.early, stale: t.stale, page: t.fallback };
  for (const warning of result.warnings) section.append(el('p', warningLabels[warning], 'warning'));
  const details = el('details', undefined, 'details');
  details.open = wasOpen;
  details.append(el('summary', t.details));
  const list = el('dl');
  const row = (label: string, value: string) => { list.append(el('dt', label), el('dd', value)); };
  row(t.reviews, number(state.facts.reviews!.value));
  row(t.price, money(state.facts.metadata!.value.priceCents!));
  row(t.sales, number(result.base.units));
  row(t.gross, money(result.base.grossCents));
  details.append(list);
  const segments = [
    [t.regional, result.base.regionalCents, 'regional'], [t.discounts, result.base.discountsCents, 'discounts'],
    [t.refunds, result.base.refundsCents, 'refunds'], [t.taxes, result.base.taxesCents, 'taxes'],
    [t.steam, result.base.steamCents, 'steam'], [t.net, result.base.netCents, 'net'],
  ] as const;
  const breakdown = el('div', undefined, 'breakdown');
  const bar = el('div', undefined, 'breakdown-bar'); bar.setAttribute('aria-hidden', 'true');
  const legend = el('dl', undefined, 'legend');
  for (const [label, amount, color] of segments) {
    const segment = el('span', undefined, color);
    segment.style.width = `${amount / result.base.grossCents * 100}%`;
    bar.append(segment);
    const labelElement = el('dt', label, color);
    legend.append(labelElement, el('dd', money(amount)));
  }
  breakdown.append(bar, legend); details.append(breakdown); section.append(details);
  const settings = el('div', undefined, 'settings-panel');
  settings.id = 'revenue-settings'; settings.hidden = !settingsOpen;
  const gear = el('button', '⚙', 'gear'); gear.type = 'button';
  gear.setAttribute('aria-label', language === 'ru' ? 'Настройки' : 'Settings');
  gear.title = gear.getAttribute('aria-label')!;
  gear.setAttribute('aria-controls', settings.id); gear.setAttribute('aria-expanded', String(settingsOpen));
  gear.addEventListener('click', () => {
    settings.hidden = !settings.hidden; gear.setAttribute('aria-expanded', String(!settings.hidden));
  });
  settings.addEventListener('keydown', event => {
    if (event.key === 'Escape') { settings.hidden = true; gear.setAttribute('aria-expanded', 'false'); gear.focus(); }
  });
  header.append(gear);
  settings.append(el('h4', t.assumptions));
  const link = el('a', t.method);
  link.href = 'https://greyaliengames.com/blog/how-to-estimate-how-many-sales-a-steam-game-has-made/';
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  const form = el('form');
  form.noValidate = true;
  const autoLabel = el('label', t.auto, 'auto');
  const auto = el('input'); auto.type = 'checkbox'; auto.checked = model.base === 'auto'; auto.name = 'automatic';
  autoLabel.append(auto); form.append(autoLabel);
  const inputs = new Map<Parameter, HTMLInputElement>();
  for (const key of parameters) {
    const label = el('label', t[key]);
    const input = el('input');
    input.type = 'number'; input.step = 'any'; input.required = true;
    const value = key === 'base' && model.base === 'auto' ? reviewMultiplier(state.facts.reviews!.value) : model[key] as number;
    input.name = key; input.value = String(isMultiplier(key) ? value : Number((value * 100).toFixed(8)));
    if (key === 'base') input.disabled = auto.checked;
    input.min = '0';
    if (!isMultiplier(key)) input.max = '100';
    inputs.set(key, input); label.append(input); form.append(label);
  }
  auto.addEventListener('change', () => { inputs.get('base')!.disabled = auto.checked; });
  const status = el('p', notice, 'form-status');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const save = el('button', t.save); save.type = 'submit';
  const reset = el('button', t.reset); reset.type = 'button'; reset.className = 'secondary';
  const buttons = el('div', undefined, 'buttons'); buttons.append(save, reset);
  form.append(buttons, status);
  const apply = async (candidate: ModelConfig) => {
    save.disabled = reset.disabled = true;
    try {
      const saved = await onSave(candidate);
      status.textContent = saved ? t.saved : t.notSaved;
    } catch { status.textContent = t.notSaved; }
    finally { save.disabled = reset.disabled = false; }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const candidate: ModelConfig = { ...model };
    for (const [key, input] of inputs) candidate[key] = input.value.trim() === '' ? NaN : Number(input.value) / (isMultiplier(key) ? 1 : 100);
    if (auto.checked) candidate.base = 'auto';
    if (!isModel(candidate)) { status.textContent = t.invalid; return; }
    void apply(candidate);
  });
  reset.addEventListener('click', () => { void apply({ ...DEFAULT_MODEL }); });
  settings.append(form, link, el('p', language === 'ru' ? 'Приблизительная оценка. Диапазон показывает чувствительность к множителю. Net — до затрат и доли издателя.' : 'Approximate estimate. The range shows multiplier sensitivity. Net is before costs and publisher share.', 'muted'));
  section.append(settings);
}
