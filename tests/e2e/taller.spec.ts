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

test('las instrucciones de filamento avisan si falta un color en el AMS', async ({ page }) => {
  // Solo blanco cargado: pantalla azul y tapa rojo deben pedir "carga".
  await mockApi(page, { spools: ['blanco', null, null, null] });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('cuerpo: Blanco')).toBeVisible();
  await expect(page.getByText('pantalla: Azul · carga')).toBeVisible();
  await expect(page.getByText('tapa: Rojo · carga')).toBeVisible();
});

test('un pedido en cola con filamentos cargados se puede mandar a imprimir', async ({ page }) => {
  const enCola = { ...ORDER, status: 'en_cola' };
  let dispatched = false;
  await mockApi(page, { spools: ['blanco', 'azul', 'rojo', null] });
  await page.route('**/api/admin/orders', (route) => route.fulfill({ json: { orders: [enCola] } }));
  await page.route('**/api/admin/orders/ord_1/dispatch', (route) => {
    dispatched = true;
    return route.fulfill({
      json: {
        jobs: [
          { id: 'job_1', order_id: 'ord_1', part: 'pantalla', file_key: 'pantalla/tessera', colors: ['azul'], status: 'queued', progress_pct: null, message: null },
          { id: 'job_2', order_id: 'ord_1', part: 'cuerpo', file_key: 'cuerpo/cuerpo', colors: ['blanco'], status: 'queued', progress_pct: null, message: null },
          { id: 'job_3', order_id: 'ord_1', part: 'tapa', file_key: 'tapa/tapa', colors: ['rojo'], status: 'queued', progress_pct: null, message: null },
        ],
      },
    });
  });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Las lámparas en cola ya no tienen botón de avance manual: solo Imprimir
  // (el agente mueve el estado al imprimir de verdad).
  await expect(page.getByRole('button', { name: 'Imprimiendo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Imprimir' }).click();
  await expect(page.getByText('Tapa', { exact: true })).toBeVisible();
  expect(dispatched).toBe(true);
});

test('sin los filamentos cargados el botón Imprimir queda deshabilitado', async ({ page }) => {
  const enCola = { ...ORDER, status: 'en_cola' };
  await mockApi(page, { spools: [null, null, null, null] });
  await page.route('**/api/admin/orders', (route) => route.fulfill({ json: { orders: [enCola] } }));
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeDisabled();
});

test('un trabajo fallido muestra el motivo y permite reintentar', async ({ page }) => {
  const conFallo = {
    ...ORDER,
    status: 'en_cola',
    jobs: [
      { id: 'job_1', order_id: 'ord_1', part: 'pantalla', file_key: 'pantalla/tessera', colors: ['azul'], status: 'failed', progress_pct: null, message: 'falta azul en el AMS' },
    ],
  };
  let requeued = false;
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) => route.fulfill({ json: { orders: [conFallo] } }));
  await page.route('**/api/admin/jobs/job_1/requeue', (route) => {
    requeued = true;
    return route.fulfill({ json: { ...conFallo.jobs[0], status: 'queued', message: null } });
  });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('falta azul en el AMS')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('falta azul en el AMS')).toHaveCount(0);
  expect(requeued).toBe(true);
});

test('los pedidos se separan en Impresión 3D y Taller manual', async ({ page }) => {
  const lampara = { ...ORDER, id: 'ord_l', production: 'impresion_3d' };
  const banca = {
    ...ORDER,
    id: 'ord_b',
    product_id: 'banca-001',
    config: null,
    production: 'manual',
    status: 'pagada',
  };
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) =>
    route.fulfill({ json: { orders: [lampara, banca] } }),
  );
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  const seccion3d = page.locator('section', { has: page.getByRole('heading', { name: 'Impresión 3D' }) });
  const seccionManual = page.locator('section', { has: page.getByRole('heading', { name: 'Taller manual' }) });
  await expect(seccion3d.getByText('Lámpara Tessera')).toBeVisible();
  await expect(seccionManual.getByText('La banca de los abuelos')).toBeVisible();
  // El panel AMS vive dentro de la sección de impresión.
  await expect(seccion3d.getByText('AMS — qué hay cargado')).toBeVisible();
  await expect(seccionManual.getByText('AMS — qué hay cargado')).toHaveCount(0);
});

test('la banca no imprime: muestra Empezar y estado En progreso', async ({ page }) => {
  const banca = {
    ...ORDER,
    id: 'ord_banca',
    product_id: 'banca-001',
    config: null,
    amount_mxn: 240000,
    status: 'en_cola',
  };
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) => route.fulfill({ json: { orders: [banca] } }));
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Imprimir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeVisible();

  // Ya en marcha, el estado se lee "En progreso", no "Imprimiendo".
  await page.route('**/api/admin/orders', (route) =>
    route.fulfill({ json: { orders: [{ ...banca, status: 'imprimiendo' }] } }),
  );
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText('En progreso')).toBeVisible();
  await expect(page.getByText('Imprimiendo')).toHaveCount(0);
});

test('el panel AMS es de solo lectura y muestra el hex de la impresora', async ({ page }) => {
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
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  const panel = page.locator('section', { hasText: 'AMS — qué hay cargado' });
  await expect(panel.locator('select')).toHaveCount(0); // solo lectura
  await expect(panel.getByText('#2F5FD6')).toBeVisible(); // hex junto al nombre
  await expect(panel.getByText('#808080')).toBeVisible(); // gris fuera de catálogo
  await expect(panel.getByText('PETG')).toBeVisible();
  await expect(panel.getByText('leído de la impresora:')).toBeVisible();
  await expect(panel.getByText('vacía')).toBeVisible();
});

test('sin sincronización del AMS aparece el aviso de arrancar el agente', async ({ page }) => {
  await mockApi(page, { syncedAt: null });
  await page.goto('/taller');
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

test('el botón avanza el estado del pedido', async ({ page }) => {
  let patched = false;
  await mockApi(page);
  await page.route('**/api/admin/orders/ord_1', (route) => {
    patched = true;
    return route.fulfill({ json: { ...ORDER, status: 'en_cola' } });
  });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: 'A la cola' }).click();
  await expect(page.getByText('En cola')).toBeVisible();
  expect(patched).toBe(true);
});
