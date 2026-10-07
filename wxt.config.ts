import { defineConfig } from 'wxt';

export default defineConfig({
  imports: false,
  manifest: {
    name: 'Steam Revenue Estimate',
    description: 'See approximate gross and net revenue on Steam game pages, with transparent assumptions and adjustable estimates.',
    permissions: ['storage'],
    host_permissions: ['https://store.steampowered.com/*'],
  },
});
