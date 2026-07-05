// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import preact from '@astrojs/preact';

export default defineConfig({
  output: 'static',
  site: 'https://formamx.com',

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [preact()],
});