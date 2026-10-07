import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MODEL } from '../../src/estimator';
import { renderRevenue } from '../../src/ui';
import { game } from './helpers';

let host: HTMLElement;
beforeEach(() => { document.body.replaceChildren(); host = document.createElement('div'); document.body.append(host); });

describe('inline detail and validation', () => {
  it.each(['en', 'ru'] as const)('shows full totals and compact ranges in %s', language => {
    renderRevenue(host, { status: 'ready', facts: game() }, { ...DEFAULT_MODEL }, language, vi.fn());
    const expected = new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const compact = new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code', notation: 'compact', maximumFractionDigits: 1 });
    expect(host.shadowRoot!.querySelector('.amount strong')!.textContent).toBe(`≈ ${expected.format(40000)}`);
    expect(host.shadowRoot!.querySelector('.range')!.textContent).toBe(`${compact.format(40000)} – ${compact.format(120000)}`);
  });
  it('keeps concise details and settings behind a gear', () => {
    renderRevenue(host, { status: 'ready', facts: game() }, { ...DEFAULT_MODEL }, 'en', vi.fn());
    expect(host.dataset.state).toBe('estimated');
    const text = host.shadowRoot!.textContent;
    expect(text).toContain('Gross'); expect(text).toContain('Net');
    expect(text).not.toContain('Data sources'); expect(text).not.toContain('boxleiter-v');
    expect(text).not.toContain('Scenario range'); expect(text).not.toContain('Lifetime Steam-purchase');
    const settings = host.shadowRoot!.querySelector<HTMLElement>('.settings-panel')!;
    expect(settings.hidden).toBe(true);
    host.shadowRoot!.querySelector<HTMLButtonElement>('.gear')!.click();
    expect(settings.hidden).toBe(false);
    expect(settings.querySelector('a')!.textContent).toBe('About the Boxleiter method');
    expect(host.shadowRoot!.querySelectorAll('.breakdown-bar span')).toHaveLength(6);
    expect(host.shadowRoot!.querySelectorAll('input')).toHaveLength(9);
  });
  it('explains unknown data without financial zeros', () => {
    renderRevenue(host, { status: 'ready', facts: { appId: 413150 } }, { ...DEFAULT_MODEL }, 'ru', vi.fn());
    expect(host.dataset.state).toBe('unavailable');
    expect(host.shadowRoot!.textContent).toContain('Не удалось подтвердить');
    expect(host.shadowRoot!.querySelector('.amount')).toBeNull();
  });
  it('does not save empty, unordered or invalid parameters', () => {
    const save = vi.fn();
    renderRevenue(host, { status: 'ready', facts: game() }, { ...DEFAULT_MODEL }, 'en', save);
    const input = host.shadowRoot!.querySelector<HTMLInputElement>('input[name="base"]')!;
    const auto = host.shadowRoot!.querySelector<HTMLInputElement>('input[name="automatic"]')!;
    auto.checked = false;
    input.value = '';
    host.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(save).not.toHaveBeenCalled();
    expect(host.shadowRoot!.querySelector('[role="status"]')?.textContent).toContain('Enter valid numbers');
  });
  it('applies percent conversion and reports a failed save', async () => {
    const save = vi.fn().mockResolvedValue(false);
    renderRevenue(host, { status: 'ready', facts: game() }, { ...DEFAULT_MODEL }, 'en', save);
    host.shadowRoot!.querySelector<HTMLInputElement>('input[name="steamFee"]')!.value = '20';
    host.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(host.shadowRoot!.querySelector('[role="status"]')?.textContent).toContain('could not be saved'));
    expect(save).toHaveBeenCalledWith({ ...DEFAULT_MODEL, steamFee: .2 });
  });
});
