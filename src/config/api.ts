// URL base del backend (workers/api). No es un secreto: es la misma URL que
// ve el navegador. Tras el primer `npm run deploy` del worker, sustituir por
// la URL real de *.workers.dev que imprime wrangler.
export const API_BASE = import.meta.env.DEV
  ? 'http://localhost:8787'
  : 'https://formamx-api.salvamalfa.workers.dev';
