import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Verifica que el servidor de `webServer` sea de verdad formamx antes del
  // primer test. Ver el porqué en el archivo.
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:4321',
    // Entornos sin descarga de navegadores (p. ej. Claude Code remoto)
    // exponen un Chromium fijo vía esta variable.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4321',
    // `astro dev` se manda solo al fondo cuando detecta que lo corre un agente
    // (Claude Code y compañía): el proceso que lanza Playwright termina de
    // inmediato y la suite muere con "Process from config.webServer exited
    // early". Esta variable es la salida de emergencia de Astro para esa
    // detección: con ella el servidor corre en primer plano y Playwright puede
    // esperarlo y matarlo. En CI no hay agente y no cambia nada.
    env: { ASTRO_DEV_BACKGROUND: '1' },
    // En CI nunca se engancha a un servidor que ya esté vivo: si el puerto
    // está tomado al arrancar, Playwright falla ahí mismo. No cubre el caso
    // de que alguien tome el puerto DESPUÉS de esa comprobación (Astro se
    // mueve de puerto en silencio y la suite acaba pegándole a otra app) —
    // de eso se encarga el globalSetup.
    reuseExistingServer: !process.env.CI,
  },
});
