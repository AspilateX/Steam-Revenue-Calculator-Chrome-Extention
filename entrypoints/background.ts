import { defineBackground } from 'wxt/utils/define-background';
import { validRequest } from '../src/messages';
import { getGameFacts } from '../src/steam';
import type { FactsResponse } from '../src/types';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (response: FactsResponse) => void) => {
    if (!validRequest(message, sender, chrome.runtime.id)) {
      sendResponse({ ok: false, error: 'invalid-request' });
      return false;
    }
    void (async () => {
      try { sendResponse({ ok: true, facts: await getGameFacts(message.appId, message.pageFacts, chrome.storage.local) }); }
      catch { sendResponse({ ok: false, error: 'connection' }); }
    })();
    return true;
  });
});
