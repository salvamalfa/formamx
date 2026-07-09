import type { Context, Next } from 'hono';
import type { AppContext } from '../env';

// Compara dos strings en tiempo constante (no filtra por dónde difieren).
// Se hashean primero para que la comparación no dependa de la longitud.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// Middleware de bearer contra un secreto del entorno. El dashboard usa
// ADMIN_TOKEN; el agente de impresión usa AGENT_TOKEN.
export function bearer(secretName: 'ADMIN_TOKEN' | 'AGENT_TOKEN') {
  return async (c: Context<AppContext>, next: Next) => {
    const expected = c.env[secretName];
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!expected || !token || !(await safeEqual(token, expected))) {
      return c.json({ error: 'no_autorizado' }, 401);
    }
    await next();
  };
}
