// URL base del backend (workers/api). No es un secreto: es la misma URL que
// ve el navegador.
export const API_BASE = import.meta.env.DEV
  ? 'http://localhost:8787'
  : 'https://formamx-api.formamx.workers.dev';
