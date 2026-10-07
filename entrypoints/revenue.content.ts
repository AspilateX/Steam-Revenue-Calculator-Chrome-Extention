import { defineContentScript } from 'wxt/utils/define-content-script';
import { startContent } from '../src/content';

export default defineContentScript({
  matches: ['https://store.steampowered.com/app/*'],
  runAt: 'document_idle',
  allFrames: false,
  main: startContent,
});
