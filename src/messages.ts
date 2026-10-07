import { appIdFromUrl, isAppId, isPageFacts, isRecord, type FactsRequest } from './types';

export function validRequest(message: unknown, sender: { id?: string; url?: string; frameId?: number }, extensionId: string): message is FactsRequest {
  return sender.id === extensionId && sender.frameId === 0 && isRecord(message)
    && message.type === 'GET_GAME_FACTS' && isAppId(message.appId)
    // Chrome retains the document's original URL in MessageSender after pushState.
    // Bind the request to that document; appId is read from the current URL by
    // our isolated, bundled content script and is independently validated.
    && appIdFromUrl(sender.url ?? '') === message.documentAppId && isPageFacts(message.pageFacts);
}
