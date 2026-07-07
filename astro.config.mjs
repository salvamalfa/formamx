// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import preact from '@astrojs/preact';

export default defineConfig({
  output: 'static',
  site: 'https://formamx.com',

  // El dev server usa el puerto que asigne el entorno (PORT), con 4321 de reserva.
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 4321,
  },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [preact()],
});