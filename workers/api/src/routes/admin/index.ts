import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { bearer } from '../../lib/auth';
import { clientes } from './clientes';
import { envios } from './envios';
import { impresora } from './impresora';
import { pedidos } from './pedidos';

// /api/admin: un sub-app Hono por módulo. El bearer se aplica UNA sola vez
// aquí — ningún módulo puede olvidar el auth. Las rutas históricas se montan
// en '/' (URLs congeladas); los módulos futuros se montan con prefijo:
//   admin.route('/clientes', clientes)  →  /api/admin/clientes/...
// Receta completa en docs/ROADMAP_ARQUITECTURA.md.
export const admin = new Hono<AppContext>();

admin.use('*', bearer('ADMIN_TOKEN'));
admin.route('/', pedidos);
admin.route('/', impresora);
admin.route('/clientes', clientes);
admin.route('/envios', envios);
