// Binding de rate limiting nativo de Cloudflare Workers.
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  // STL que mandan los clientes (ver docs/STL_CLIENTES.md). D1 guarda el
  // metadato; el binario vive aquí porque no cabe ni conviene en D1.
  STL_BUCKET: R2Bucket;
  // Límite de creación de sesiones de checkout por IP (ver wrangler.toml).
  CHECKOUT_RL: RateLimit;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  // Topic de ntfy.sh para avisos de pedidos; el nombre del topic es el secreto.
  NTFY_TOPIC?: string;
  SITE_ORIGIN: string;
  // Bearer del dashboard /taller.
  ADMIN_TOKEN: string;
  // Bearer del agente de impresión (la PC junto a la impresora). Separado del
  // ADMIN_TOKEN: el token del dashboard nunca vive en esa PC ni viceversa.
  AGENT_TOKEN: string;
}

export type AppContext = { Bindings: Env };
