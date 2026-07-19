import { expect, test, type Page } from '@playwright/test';

// El dashboard se prueba con la API mockeada (page.route); la API real tiene
// su verificación aparte contra wrangler dev.

const ORDER = {
  id: 'ord_1',
  created_at: '2026-07-07 20:00:00',
  product_id: 'lampara',
  config: { model: 'tessera', pantalla: 'azul', tapa: 'rojo' },
  amount_mxn: 49900,
  status: 'pagada',
  payment_method: 'card',
  customer: { name: 'Ana Prueba', email: 'ana@example.com', phone: '+525511112222' },
  shipping: { name: 'Ana Prueba', address: { line1: 'Av. Insurgentes 100', city: 'CDMX', postal_code: '06700' } },
  jobs: [] as unknown[],
};

async function mockApi(
  page: Page,
  opts: { spools?: (string | null)[]; bedClear?: boolean; syncedAt?: string | null } = {},
) {
  const spools = opts.spools ?? [null, null, null, null];
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { orders: [ORDER] } });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/orders/*', (route) =>
    route.fulfill({ json: { ...ORDER, status: 'en_cola' } }),
  );
  await page.route('**/api/admin/spools', (route) =>
    route.fulfill({
      json: {
        slots: spools.map((color_id, slot) => ({
          slot,
          color_id,
          material: color_id ? 'PLA' : null,
          color_hex: color_id ? '#F4F4F2' : null,
        })),
      },
    }),
  );
  await page.route('**/api/admin/printer', (route) =>
    route.fulfill({
      json: { bed_clear: opts.bedClear ?? true, ams_synced_at: opts.syncedAt ?? null },
    }),
  );
  // El MensajesProvider del shell siempre pide el inbox (badge de sin
  // responder). Por defecto va vacío; los tests que lo necesiten lo pisan.
  await page.route('**/api/admin/inbox**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { mensajes: [] } });
    }
    return route.fallback();
  });
  // El detalle de pedido pide las guías del pedido (`?order_id=`). Por defecto
  // vacío; los specs de envíos registran rutas más nuevas que ganan.
  await page.route('**/api/admin/envios**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { envios: [] } });
    }
    return route.fallback();
  });
  // La sub-pestaña Impresora pide las bobinas para el % del AMS (fetch
  // propio del panel). Por defecto vacío; los specs que lo necesiten
  // registran una ruta más nueva que gana.
  await page.route('**/api/admin/inventario/bobinas**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { bobinas: [] } });
    }
    return route.fallback();
  });
}

async function entrar(page: Page) {
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('el gate pide token y al entrar carga los pedidos', async ({ page }) => {
  await mockApi(page);
  await page.goto('/taller');
  await expect(page.getByText('Pega tu token de taller')).toBeVisible();
  await page.getByPlaceholder('token').fill('token-de-prueba');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page.getByText('Ana Prueba')).toBeVisible();
});

test('un 401 limpia el token y vuelve al gate', async ({ page }) => {
  await page.route('**/api/admin/**', (route) => route.fulfill({ status: 401, json: { error: 'no_autorizado' } }));
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('token-malo');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Token inválido.')).toBeVisible();
  await expect(page.getByText('Pega tu token de taller')).toBeVisible();
});

const JOBS_OK = [
  { id: 'job_1', order_id: 'ord_1', part: 'pantalla', file_key: 'pantalla/tessera', colors: ['azul'], status: 'queued', progress_pct: null, message: null },
  { id: 'job_2', order_id: 'ord_1', part: 'cuerpo', file_key: 'cuerpo/cuerpo', colors: ['blanco'], status: 'queued', progress_pct: null, message: null },
  { id: 'job_3', order_id: 'ord_1', part: 'tapa', file_key: 'tapa/tapa', colors: ['rojo'], status: 'queued', progress_pct: null, message: null },
];

test('la tabla lista los pedidos con badge de estado y monto formateado', async ({ page }) => {
  const lampara = { ...ORDER, id: 'ord_l', production: 'impresion_3d' };
  const banca = {
    ...ORDER,
    id: 'ord_b',
    product_id: 'banca-001',
    config: null,
    production: 'manual',
    amount_mxn: 240000,
    status: 'pagada',
  };
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) =>
    route.fulfill({ json: { orders: [lampara, banca] } }),
  );
  await page.goto('/taller');
  await entrar(page);

  // Una sola tabla; el tipo de pieza va en el subtítulo mono de cada fila.
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page.getByText('La banca de los abuelos')).toBeVisible();
  await expect(page.getByText('impresión 3d')).toBeVisible();
  await expect(page.getByText('hecha a mano')).toBeVisible();
  await expect(page.getByText('$499')).toBeVisible();
  await expect(page.getByText('$2,400')).toBeVisible();
  await expect(page.getByText('Pagada', { exact: true }).first()).toBeVisible();
  // El panel AMS no vive en Pedidos: se movió a la sub-pestaña Impresora.
  await expect(page.getByText('AMS — qué hay cargado')).toHaveCount(0);
});

test('al hacer clic en una fila se abre el detalle con la config y las guías', async ({ page }) => {
  await mockApi(page, { spools: ['blanco', null, null, null] });
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();

  await expect(page.getByRole('button', { name: '← Proyectos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'La pieza' })).toBeVisible();
  // La configuración y las necesidades de filamento viven ahora en el detalle.
  await expect(page.getByText('cuerpo: Blanco')).toBeVisible();
  await expect(page.getByText('pantalla: Azul · carga')).toBeVisible();
  await expect(page.getByText('tapa: Rojo · carga')).toBeVisible();
  // La ficha del cliente en el detalle.
  await expect(page.getByText('ana@example.com')).toBeVisible();
});

test('avanzar el estado desde el detalle actualiza el badge (optimista)', async ({ page }) => {
  let patched = false;
  await mockApi(page);
  await page.route('**/api/admin/orders/ord_1', (route) => {
    if (route.request().method() === 'PATCH') patched = true;
    return route.fulfill({ json: { ...ORDER, status: 'en_cola' } });
  });
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();
  await page.getByRole('button', { name: 'A la cola' }).click();
  await expect(page.getByText('En cola')).toBeVisible();
  expect(patched).toBe(true);
});

test('el pedido en cola con filamentos cargados se despacha desde el detalle', async ({ page }) => {
  const enCola = { ...ORDER, status: 'en_cola' };
  let dispatched = false;
  await mockApi(page, { spools: ['blanco', 'azul', 'rojo', null] });
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { orders: [enCola] } });
    return route.fallback();
  });
  await page.route('**/api/admin/orders/ord_1/dispatch', (route) => {
    dispatched = true;
    return route.fulfill({ json: { jobs: JOBS_OK } });
  });
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();
  // Las lámparas en cola no ofrecen avance manual: solo Imprimir (el agente
  // mueve el estado al imprimir de verdad).
  await expect(page.getByRole('button', { name: 'Empezar' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Imprimir' }).click();
  await expect(page.getByText('Tapa', { exact: true })).toBeVisible();
  expect(dispatched).toBe(true);
});

test('sin los filamentos cargados el botón Imprimir del detalle queda deshabilitado', async ({ page }) => {
  const enCola = { ...ORDER, status: 'en_cola' };
  await mockApi(page, { spools: [null, null, null, null] });
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { orders: [enCola] } });
    return route.fallback();
  });
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
});

test('un trabajo fallido muestra el motivo y permite reintentar en el detalle', async ({ page }) => {
  const conFallo = {
    ...ORDER,
    status: 'en_cola',
    jobs: [
      { id: 'job_1', order_id: 'ord_1', part: 'pantalla', file_key: 'pantalla/tessera', colors: ['azul'], status: 'failed', progress_pct: null, message: 'falta azul en el AMS' },
    ],
  };
  let requeued = false;
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { orders: [conFallo] } });
    return route.fallback();
  });
  await page.route('**/api/admin/jobs/job_1/requeue', (route) => {
    requeued = true;
    return route.fulfill({ json: { ...conFallo.jobs[0], status: 'queued', message: null } });
  });
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();
  await expect(page.getByText('falta azul en el AMS')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('falta azul en el AMS')).toHaveCount(0);
  expect(requeued).toBe(true);
});

test('un pedido manual muestra En progreso y el texto de pieza manual', async ({ page }) => {
  const banca = {
    ...ORDER,
    id: 'ord_banca',
    product_id: 'banca-001',
    config: null,
    production: 'manual',
    amount_mxn: 240000,
    status: 'imprimiendo',
  };
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) => route.fulfill({ json: { orders: [banca] } }));
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /La banca de los abuelos/ }).click();

  await expect(page.getByText('En progreso')).toBeVisible();
  await expect(page.getByText('Imprimiendo')).toHaveCount(0);
  await expect(page.getByText('no pasa por la impresora', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimir' })).toHaveCount(0);
});

test('un deep-link a un pedido fuera de la lista carga el detalle', async ({ page }) => {
  const enviado = { ...ORDER, id: 'ord_hist', status: 'enviada' };
  await mockApi(page);
  // La lista por defecto no lo trae (pedido enviado/histórico).
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { orders: [] } });
    return route.fallback();
  });
  // Ruta específica del pedido: se registra DESPUÉS del glob `orders/*` de
  // mockApi, así que Playwright la evalúa primero y no la captura la lista.
  await page.route('**/api/admin/orders/ord_hist', (route) => route.fulfill({ json: enviado }));
  await page.goto('/taller#pedido/ord_hist');
  await entrar(page);

  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page.getByText('Enviada', { exact: true })).toBeVisible();
});

test('el botón volver regresa a la lista de pedidos', async ({ page }) => {
  await mockApi(page);
  await page.goto('/taller');
  await entrar(page);
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();
  await expect(page.getByRole('button', { name: '← Proyectos' })).toBeVisible();
  await page.getByRole('button', { name: '← Proyectos' }).click();
  await expect(page).toHaveURL(/#proyectos\/pedidos$/);
  await expect(page.getByRole('button', { name: /Lámpara Tessera/ })).toBeVisible();
});

test('la card de bobinas AMS es de solo lectura y muestra el hex de la impresora', async ({ page }) => {
  await mockApi(page, { syncedAt: '2026-07-11 15:30:00' });
  await page.route('**/api/admin/spools', (route) =>
    route.fulfill({
      json: {
        slots: [
          { slot: 0, color_id: 'blanco', material: 'PLA', color_hex: '#F4F4F2' },
          { slot: 1, color_id: 'azul', material: 'PETG', color_hex: '#2F5FD6' },
          // Gris: sin correspondencia en el catálogo, se muestra el hex.
          { slot: 2, color_id: null, material: 'PLA', color_hex: '#808080' },
          { slot: 3, color_id: null, material: null, color_hex: null },
        ],
      },
    }),
  );
  // El AMS vive en la sub-pestaña Impresora de Proyectos (compat de hash).
  await page.goto('/taller#impresora');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Bobinas AMS' })).toBeVisible();
  // Escapa el <select> que inyecta la barra de dev de Astro fuera de <main>.
  await expect(page.locator('main select')).toHaveCount(0); // solo lectura, sin formularios
  await expect(page.getByText('#2F5FD6')).toBeVisible(); // hex junto al nombre de catálogo
  await expect(page.getByText('#808080')).toBeVisible(); // gris fuera de catálogo: el hex es el nombre
  await expect(page.getByText('leído de la impresora:')).toBeVisible();
  await expect(page.getByText('vacía')).toBeVisible();
});

test('sin sincronización del AMS aparece el aviso de arrancar el agente', async ({ page }) => {
  await mockApi(page, { syncedAt: null });
  await page.goto('/taller#impresora');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('sin lectura de la impresora — arranca el agente')).toBeVisible();
});

test('con la cama ocupada aparece el candado y se libera al confirmar', async ({ page }) => {
  let confirmed = false;
  await mockApi(page, { bedClear: false });
  await page.route('**/api/admin/printer/bed-clear', (route) => {
    confirmed = true;
    return route.fulfill({ json: { bed_clear: true } });
  });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Hay una pieza en la cama.')).toBeVisible();
  await page.getByRole('button', { name: 'Cama despejada' }).click();
  await expect(page.getByText('Hay una pieza en la cama.')).toHaveCount(0);
  expect(confirmed).toBe(true);
});

test('en la sub-pestaña Impresora el banner de la cama es el del panel, no el global', async ({
  page,
}) => {
  let confirmed = false;
  await mockApi(page, { bedClear: false });
  await page.route('**/api/admin/printer/bed-clear', (route) => {
    confirmed = true;
    return route.fulfill({ json: { bed_clear: true } });
  });
  await page.goto('/taller#impresora');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // El banner rico del panel está, con su copy propio...
  await expect(page.getByText('La cama no está despejada.')).toBeVisible();
  // ...y el banner global del shell NO se duplica en esta vista.
  await expect(page.getByText('Hay una pieza en la cama.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Ya la despejé' }).click();
  await expect(page.getByText('La cama no está despejada.')).toHaveCount(0);
  expect(confirmed).toBe(true);
});

test('la sub-pestaña Impresora muestra el trabajo en curso, la cola y el % de bobinas del AMS', async ({
  page,
}) => {
  const printing = { ...ORDER, id: 'ord_printing' };
  const queued = { ...ORDER, id: 'ord_queued' };
  await mockApi(page, { spools: ['azul'] });
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          orders: [
            {
              ...printing,
              jobs: [
                {
                  id: 'job_p',
                  order_id: 'ord_printing',
                  part: 'pantalla',
                  file_key: 'x',
                  colors: ['azul'],
                  status: 'printing',
                  progress_pct: 42,
                  message: null,
                },
              ],
            },
            {
              ...queued,
              jobs: [
                {
                  id: 'job_q',
                  order_id: 'ord_queued',
                  part: 'tapa',
                  file_key: 'x',
                  colors: ['rojo'],
                  status: 'queued',
                  progress_pct: null,
                  message: null,
                },
              ],
            },
          ],
        },
      });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/inventario/bobinas', (route) =>
    route.fulfill({
      json: {
        bobinas: [
          {
            id: 'bob_ams',
            color_id: 'azul',
            material: 'PLA',
            brand: null,
            weight_g: 1000,
            weight_left_g: 120,
            cost_mxn: null,
            status: 'en_uso',
            created_at: '2026-07-01 00:00:00',
            updated_at: '2026-07-01 00:00:00',
          },
        ],
      },
    }),
  );
  await page.goto('/taller#impresora');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Todo escopado a <main>: la barra de dev de Astro (fuera de <main>)
  // inyecta su propio inspector de props de islas, que en dev puede
  // repetir texto como "Tapa" (parte de la key del manifest de la lámpara).
  const main = page.locator('main');
  await expect(main.getByText('Pantalla · printing')).toBeVisible();
  await expect(main.getByText('42%')).toBeVisible();
  await expect(main.getByText('Tapa')).toBeVisible();
  // Bobina en uso con el mismo color+material del slot 0: 120/1000 = 12%, bajo 20%.
  await expect(main.getByText('12%')).toBeVisible();
});

const CLIENTES = [
  {
    id: 'cus_1',
    created_at: '2026-07-01 12:00:00',
    name: 'Ana Prueba',
    email: 'ana@example.com',
    phone: '+525511112222',
    notes: null,
    order_count: 2,
    last_order_at: '2026-07-07 20:00:00',
  },
  {
    id: 'cus_2',
    created_at: '2026-06-20 10:00:00',
    name: 'Bruno Madera',
    email: 'bruno@example.com',
    phone: '+525533334444',
    notes: 'Prefiere entrega en mano',
    order_count: 1,
    last_order_at: '2026-06-21 09:00:00',
  },
];

test('el módulo clientes lista y el filtro oculta a quien no coincide', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/admin/clientes', (route) =>
    route.fulfill({ json: { clientes: CLIENTES } }),
  );
  await page.goto('/taller#clientes');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Ana Prueba')).toBeVisible();
  await expect(page.getByText('Bruno Madera')).toBeVisible();
  await expect(page.getByText('2 pedidos')).toBeVisible();

  await page.getByPlaceholder('Buscar por nombre, email o teléfono').fill('bruno');
  await expect(page.getByText('Ana Prueba')).toHaveCount(0);
  await expect(page.getByText('Bruno Madera')).toBeVisible();
});

test('el detalle del cliente muestra su historial y guarda notas', async ({ page }) => {
  let patched = false;
  await mockApi(page);
  await page.route('**/api/admin/clientes', (route) =>
    route.fulfill({ json: { clientes: CLIENTES } }),
  );
  // Detalle y notas comparten glob: se discrimina por método (como mockApi).
  await page.route('**/api/admin/clientes/*', (route) => {
    if (route.request().method() === 'PATCH') {
      patched = true;
      return route.fulfill({ json: { ...CLIENTES[0], notes: 'Cliente frecuente' } });
    }
    return route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [ORDER] } });
  });
  await page.goto('/taller#clientes');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByText('Ana Prueba').click();
  await expect(page.getByRole('button', { name: '← Clientes' })).toBeVisible();
  await expect(page.locator('a[href="mailto:ana@example.com"]')).toBeVisible();
  await expect(page.locator('a[href="tel:+525511112222"]')).toBeVisible();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();

  await page
    .getByPlaceholder('Preferencias, acuerdos, lo que haga falta recordar')
    .fill('Cliente frecuente');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Notas guardadas.')).toBeVisible();
  expect(patched).toBe(true);
});

const ENVIO = {
  id: 'shp_1',
  order_id: 'ord_1',
  carrier: 'Estafeta',
  service: null,
  tracking_number: 'EST123456',
  label_url: null,
  cost_mxn: 15000,
  status: 'creada',
  created_at: '2026-07-15 12:00:00',
  shipped_at: null,
  delivered_at: null,
  pedido: { id: 'ord_1', customer_name: 'Ana Prueba', shipping: ORDER.shipping },
};

test('el módulo envíos crea una guía para un pedido listo', async ({ page }) => {
  let posted = false;
  await mockApi(page);
  // El select del form pide los pedidos y filtra los 'lista'.
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { orders: [{ ...ORDER, status: 'lista' }] } });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/envios', (route) => {
    if (route.request().method() === 'POST') {
      posted = true;
      return route.fulfill({ json: ENVIO });
    }
    return route.fulfill({ json: { envios: [] } });
  });
  await page.goto('/taller#envios');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Sin guías activas.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva guía' }).click();
  await page.getByLabel('Pedido').selectOption('ord_1');
  await page.getByPlaceholder('Paquetería').fill('Estafeta');
  await page.getByPlaceholder('Número de guía').fill('EST123456');
  await page.getByRole('button', { name: 'Crear guía' }).click();

  await expect(page.getByText('EST123456')).toBeVisible();
  await expect(page.getByText('Guía creada')).toBeVisible();
  expect(posted).toBe(true);
});

test('la guía avanza por el grafo y al entregarla sale de la lista', async ({ page }) => {
  let patched = false;
  await mockApi(page);
  await page.route('**/api/admin/envios', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { envios: [ENVIO] } });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/envios/*', (route) => {
    patched = true;
    return route.fulfill({
      json: { ...ENVIO, status: 'en_transito', shipped_at: '2026-07-15 13:00:00' },
    });
  });
  await page.goto('/taller#envios');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('EST123456')).toBeVisible();
  await page.getByRole('button', { name: 'Marcar en tránsito' }).click();
  await expect(page.getByText('En tránsito')).toBeVisible();
  expect(patched).toBe(true);

  // Entregada: sale de la lista al instante (optimista).
  await page.getByRole('button', { name: 'Marcar entregada' }).click();
  await expect(page.getByText('EST123456')).toHaveCount(0);
});

test('en envíos, el botón del pedido navega a #pedido/<id> y abre el detalle', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/admin/envios', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { envios: [ENVIO] } });
    }
    return route.fallback();
  });
  await page.goto('/taller#envios');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('EST123456')).toBeVisible();
  await page.getByRole('button', { name: 'Ver pedido' }).click();
  await expect(page).toHaveURL(/#pedido\/ord_1$/);
  await expect(page.getByRole('heading', { name: 'Lámpara Tessera' })).toBeVisible();
});

const BOBINA = {
  id: 'bob_1',
  color_id: 'azul',
  material: 'PLA',
  brand: 'Creality',
  weight_g: 1000,
  weight_left_g: 1000,
  cost_mxn: 35000,
  status: 'nueva',
  created_at: '2026-07-16 10:00:00',
  updated_at: '2026-07-16 10:00:00',
};

const PIEZA = {
  id: 'pza_1',
  product_id: 'lampara',
  config: { model: 'tessera', pantalla: 'azul', tapa: 'rojo' },
  print_job_id: null,
  order_id: null,
  qc_status: 'ok',
  status: 'en_stock',
  location: 'repisa A',
  created_at: '2026-07-16 11:00:00',
};

test('el módulo inventario da de alta una bobina y edita su peso', async ({ page }) => {
  let posted = false;
  let patchedPeso = false;
  await mockApi(page);
  // Lista y alta comparten glob con el detalle: se discrimina por método y
  // el detalle (bobinas/*) se registra aparte.
  await page.route('**/api/admin/inventario/bobinas', (route) => {
    if (route.request().method() === 'POST') {
      posted = true;
      return route.fulfill({ json: BOBINA });
    }
    return route.fulfill({ json: { bobinas: [] } });
  });
  await page.route('**/api/admin/inventario/bobinas/*', (route) => {
    if (route.request().method() === 'PATCH') {
      patchedPeso = true;
      return route.fulfill({ json: { ...BOBINA, weight_left_g: 650 } });
    }
    return route.fallback();
  });
  await page.goto('/taller#inventario');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Aún no hay bobinas registradas.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva bobina' }).click();
  await page.getByLabel('Color').selectOption('azul');
  await page.getByPlaceholder('Marca').fill('Creality');
  await page.getByRole('button', { name: 'Agregar bobina' }).click();

  // La tabla: color + peso restante editable ("1000" en el input, "/ 1000 g" al lado).
  await expect(page.getByText('Azul', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Peso restante en gramos')).toHaveValue('1000');
  await expect(page.getByText('/ 1000 g')).toBeVisible();
  expect(posted).toBe(true);

  await page.getByLabel('Peso restante en gramos').fill('650');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByLabel('Peso restante en gramos')).toHaveValue('650');
  expect(patchedPeso).toBe(true);
});

test('una bobina con menos de 200 g muestra el badge "bajo"', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/admin/inventario/bobinas', (route) =>
    route.fulfill({
      json: { bobinas: [{ ...BOBINA, id: 'bob_bajo', status: 'en_uso', weight_left_g: 150 }] },
    }),
  );
  await page.goto('/taller#inventario');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('bajo', { exact: true })).toBeVisible();
});

test('la sección piezas del inventario reserva una pieza en stock', async ({ page }) => {
  let patched = false;
  await mockApi(page);
  await page.route('**/api/admin/inventario/bobinas', (route) =>
    route.fulfill({ json: { bobinas: [] } }),
  );
  await page.route('**/api/admin/inventario/piezas', (route) =>
    route.fulfill({ json: { piezas: [PIEZA] } }),
  );
  await page.route('**/api/admin/inventario/piezas/*', (route) => {
    if (route.request().method() === 'PATCH') {
      patched = true;
      return route.fulfill({ json: { ...PIEZA, status: 'reservada' } });
    }
    return route.fallback();
  });
  await page.goto('/taller#inventario');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('button', { name: 'Piezas' }).click();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page.getByText('QC ok')).toBeVisible();
  await page.getByRole('button', { name: 'Reservar' }).click();
  await expect(page.getByText('Reservada')).toBeVisible();
  expect(patched).toBe(true);
});

const MENSAJE = {
  id: 'msg_1',
  channel: 'whatsapp',
  direction: 'in',
  customer_id: 'cus_1',
  order_id: null,
  subject: 'Duda sobre mi lámpara',
  body: 'Hola, ¿cuándo llega mi pedido?',
  status: 'nuevo',
  created_at: '2026-07-17 12:00:00',
  customer_name: 'Ana Prueba',
};

test('el módulo inbox registra un mensaje recibido', async ({ page }) => {
  let posted = false;
  let body: { channel?: string; body?: string; direction?: string } = {};
  await mockApi(page);
  // El select opcional de cliente pide el CRM.
  await page.route('**/api/admin/clientes', (route) =>
    route.fulfill({ json: { clientes: CLIENTES } }),
  );
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() === 'POST') {
      posted = true;
      body = route.request().postDataJSON() as typeof body;
      return route.fulfill({ json: MENSAJE });
    }
    return route.fulfill({ json: { mensajes: [] } });
  });
  await page.goto('/taller#inbox');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Sin mensajes por atender.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar mensaje' }).click();
  await page.getByLabel('Canal').selectOption('whatsapp');
  await page.getByLabel('Cliente').selectOption('cus_1');
  await page.getByPlaceholder('Asunto (opcional)').fill('Duda sobre mi lámpara');
  await page.getByPlaceholder('Mensaje').fill('Hola, ¿cuándo llega mi pedido?');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  await expect(page.getByText('Duda sobre mi lámpara')).toBeVisible();
  await expect(page.getByText('Ana Prueba')).toBeVisible();
  expect(posted).toBe(true);
  expect(body.channel).toBe('whatsapp');
  expect(body.body).toBe('Hola, ¿cuándo llega mi pedido?');
});

test('archivar un mensaje lo saca de los activos', async ({ page }) => {
  let patched = false;
  await mockApi(page);
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { mensajes: [MENSAJE] } });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/inbox/*', (route) => {
    if (route.request().method() === 'PATCH') {
      patched = true;
      return route.fulfill({ json: { ...MENSAJE, status: 'archivado' } });
    }
    return route.fallback();
  });
  await page.goto('/taller#inbox');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Duda sobre mi lámpara')).toBeVisible();
  await expect(page.getByText('WhatsApp')).toBeVisible();
  await expect(page.getByText('Recibido')).toBeVisible();
  await page.getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(page.getByText('Duda sobre mi lámpara')).toHaveCount(0);
  expect(patched).toBe(true);
});

// ── Shell nuevo (F3): router por hash + sidebar ──────────────────────────

test('el hash viejo #pedidos redirige a #proyectos/pedidos y muestra la vista', async ({ page }) => {
  await mockApi(page);
  await page.goto('/taller#pedidos');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page).toHaveURL(/#proyectos\/pedidos$/);
});

test('el hash #calidad (módulo dado de baja) cae a proyectos/pedidos', async ({ page }) => {
  await mockApi(page);
  await page.goto('/taller#calidad');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page).toHaveURL(/#proyectos\/pedidos$/);
});

test('el sidebar navega a Clientes', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/admin/clientes', (route) =>
    route.fulfill({ json: { clientes: CLIENTES } }),
  );
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();

  await page.getByRole('button', { name: 'Clientes' }).click();
  await expect(page.getByText('Bruno Madera')).toBeVisible();
  await expect(page).toHaveURL(/#clientes$/);
});

test('el badge de sin responder aparece con mensajes entrantes nuevos', async ({ page }) => {
  await mockApi(page);
  // Dos entrantes pendientes (nuevo + leído) → el badge muestra 2.
  await page.route('**/api/admin/inbox**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          mensajes: [
            { ...MENSAJE, id: 'm1', status: 'nuevo' },
            { ...MENSAJE, id: 'm2', status: 'leido' },
          ],
        },
      });
    }
    return route.fallback();
  });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  await expect(page.getByRole('button', { name: /Clientes\s*2/ })).toBeVisible();
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la barra superior existe y permite navegar entre vistas', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/admin/clientes', (route) =>
      route.fulfill({ json: { clientes: CLIENTES } }),
    );
    await page.goto('/taller');
    await page.getByPlaceholder('token').fill('t');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Lámpara Tessera')).toBeVisible();

    // Los botones de la barra superior navegan igual que en desktop.
    await page.getByRole('button', { name: 'Clientes' }).click();
    await expect(page.getByText('Bruno Madera')).toBeVisible();
    await expect(page).toHaveURL(/#clientes$/);

    await page.getByRole('button', { name: 'Proyectos' }).click();
    await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  });
});
