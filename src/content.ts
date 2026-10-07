import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { DEFAULT_MODEL } from './estimator';
import { findMetadataContainer, HOST_ID, pageLanguage, readPageFacts } from './page';
import { readModel, saveModel } from './storage';
import { appIdFromUrl, type FactsResponse, type ModelConfig } from './types';
import { renderRevenue, type UiState } from './ui';

export function startContent(ctx: ContentScriptContext): void {
  const documentAppId = appIdFromUrl(location.href);
  let appId: number | undefined;
  let state: UiState = { status: 'loading' };
  let model: ModelConfig = { ...DEFAULT_MODEL };
  let host: HTMLElement | undefined;
  let observer: MutationObserver | undefined;
  let waitingTimer: number | undefined;
  let frame: number | undefined;
  let requested = false;
  let generation = 0;
  let disposed = false;

  const stopObservation = () => {
    observer?.disconnect(); observer = undefined;
    if (waitingTimer !== undefined) window.clearTimeout(waitingTimer);
    waitingTimer = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const clearPage = () => {
    generation++;
    stopObservation(); host?.remove(); host = undefined; requested = false;
    state = { status: 'loading' };
  };
  const draw = (notice = '') => {
    if (!host || disposed || ctx.isInvalid) return;
    renderRevenue(host, state, model, pageLanguage(document), async next => {
      const revision = generation;
      const saved = await saveModel(chrome.storage.local, next);
      if (revision !== generation || disposed || ctx.isInvalid) return saved;
      model = next;
      const ru = pageLanguage(document) === 'ru';
      draw(saved ? (ru ? 'Сохранено для всех игр.' : 'Saved for all games.') : (ru ? 'Применено, но сохранить не удалось.' : 'Applied, but could not be saved.'));
      return saved;
    }, notice);
  };
  const load = async (id: number, revision: number) => {
    const storedModel = await readModel(chrome.storage.local);
    if (revision !== generation || ctx.isInvalid || disposed) return;
    model = storedModel;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_GAME_FACTS', appId: id, documentAppId, pageFacts: readPageFacts(document, id) }) as FactsResponse;
      if (revision !== generation || appIdFromUrl(location.href) !== id || ctx.isInvalid || disposed) return;
      state = response?.ok ? { status: 'ready', facts: response.facts } : { status: 'failed', reason: 'connection' };
    } catch {
      if (revision !== generation || disposed || ctx.isInvalid) return;
      state = { status: 'failed', reason: 'connection' };
    }
    draw();
  };
  const schedule = () => {
    if (frame !== undefined || disposed || ctx.isInvalid) return;
    frame = ctx.requestAnimationFrame(() => { frame = undefined; mount(); });
  };
  const observe = (target: Node, bounded: boolean) => {
    stopObservation();
    observer = new MutationObserver(records => {
      if (records.every(record => host && (record.target === host || host.contains(record.target)))) return;
      if (host?.isConnected && records.every(record => [...record.addedNodes, ...record.removedNodes].every(node => node === host))) return;
      schedule();
    });
    observer.observe(target, { childList: true, subtree: true });
    if (bounded) waitingTimer = ctx.setTimeout(stopObservation, 15_000);
  };
  const mount = () => {
    if (disposed || ctx.isInvalid || appId === undefined || appIdFromUrl(location.href) !== appId) return;
    const container = findMetadataContainer(document);
    if (!container) { host?.remove(); return; }
    if (!host) {
      document.getElementById(HOST_ID)?.remove();
      host = document.createElement('div'); host.id = HOST_ID;
      draw();
      // Observe the immediate stable upper-details parent, not the entire page.
      observe(container.closest('#glanceMidCtn')?.parentElement ?? container.parentElement!, false);
    }
    if (host.parentElement !== container || container.lastElementChild !== host) container.append(host);
    if (!requested) { requested = true; void load(appId, generation); }
  };
  const navigate = () => {
    const next = appIdFromUrl(location.href);
    if (appId === next) return;
    clearPage(); appId = next;
    if (appId !== undefined) { observe(document.documentElement, true); mount(); }
  };
  // WXT's Navigation API event can precede the URL commit (e.g. pushState).
  ctx.addEventListener(window, 'wxt:locationchange', () => { ctx.setTimeout(navigate, 0); });
  ctx.onInvalidated(() => { disposed = true; clearPage(); });
  navigate();
}
