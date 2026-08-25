import { Hono } from 'hono';
import type { AppContext } from '../../env';
import { bearer } from '../../lib/auth';
import { clientes } from './clientes';
import { customPrints } from './custom_prints';
import { envios } from './envios';
import { impresora } from './impresora';
import { inbox } from './inbox';
import { inventario } from './inventario';
import { pedidos } from './pedidos';
import { pricing } from './pricing';
import { resumen } from './resumen';

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
admin.route('/custom-prints', customPrints);
admin.route('/envios', envios);
admin.route('/inbox', inbox);
admin.route('/inventario', inventario);
admin.route('/pricing', pricing);
admin.route('/resumen', resumen);
