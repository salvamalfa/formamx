export interface Env {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  // Topic de ntfy.sh para avisos de pedidos; el nombre del topic es el secreto.
  NTFY_TOPIC?: string;
  SITE_ORIGIN: string;
  // Bearer del dashboard /taller.
  ADMIN_TOKEN: string;
}

export type AppContext = { Bindings: Env };
