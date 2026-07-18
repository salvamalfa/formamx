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

  await expect(page.getByText('Azul')).toBeVisible();
  await expect(page.getByText('1000 g / 1000 g')).toBeVisible();
  expect(posted).toBe(true);

  await page.getByLabel('Peso restante en gramos').fill('650');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('650 g / 1000 g')).toBeVisible();
  expect(patchedPeso).toBe(true);
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

const CHECKLISTS_QC = {
  impresion_3d: [
    { id: 'capas', label: 'Capas uniformes, sin saltos ni hilos' },
    { id: 'warping', label: 'Sin warping ni esquinas levantadas' },
    { id: 'encaje', label: 'Pantalla, cuerpo y tapa encajan sin forzar' },
    { id: 'colores', label: 'Colores según el pedido' },
    { id: 'electrico', label: 'Socket y cable probados, enciende' },
  ],
  manual: [
    { id: 'acabado', label: 'Lijado y acabado uniformes' },
    { id: 'estructura', label: 'Estable, sin juego en las uniones' },
    { id: 'medidas', label: 'Medidas según la ficha' },
  ],
};

const QC_REGISTRO = {
  id: 'qc_1',
  order_id: 'ord_ok',
  print_job_id: null,
  part: null,
  checklist: { capas: true, warping: true, encaje: true, colores: true, electrico: true },
  passed: true,
  notes: null,
  created_at: '2026-07-17 10:00:00',
  pedido: { id: 'ord_ok', product_id: 'lampara', customer_name: 'Bruno Aprobado' },
};

// El glob exacto '**/api/admin/calidad' no captura '/calidad/checklists'
// (mismo criterio que clientes vs clientes/*), pero checklists se registra
// aparte y el handler de '/calidad' discrimina por método con fallback.
async function mockCalidad(page: Page, registros: (typeof QC_REGISTRO)[]) {
  await page.route('**/api/admin/calidad/checklists', (route) =>
    route.fulfill({ json: { checklists: CHECKLISTS_QC } }),
  );
  await page.route('**/api/admin/calidad', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { registros } });
    }
    return route.fallback();
  });
}

test('calidad calcula lo pendiente: sin registro aprobado sí, aprobado no', async ({ page }) => {
  const porRevisar = { ...ORDER, id: 'ord_rev', status: 'imprimiendo' };
  const aprobado = {
    ...ORDER,
    id: 'ord_ok',
    status: 'lista',
    customer: { ...ORDER.customer, name: 'Bruno Aprobado' },
  };
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { orders: [porRevisar, aprobado] } });
    }
    return route.fallback();
  });
  await mockCalidad(page, [QC_REGISTRO]);
  await page.goto('/taller#calidad');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Solo el pedido sin registro aprobado pide revisión.
  const pendientes = page.getByRole('list', { name: 'Por revisar' });
  await expect(pendientes.getByText('Ana Prueba')).toBeVisible();
  await expect(pendientes.getByText('Bruno Aprobado')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Revisar' })).toHaveCount(1);

  // El registro aprobado vive en el historial con su veredicto.
  const historial = page.getByRole('list', { name: 'Historial' });
  await expect(historial.getByText('Bruno Aprobado')).toBeVisible();
  await expect(historial.getByText('Aprobada')).toBeVisible();
});

test('la revisión exige responder todo el checklist y lo manda completo', async ({ page }) => {
  let posted = false;
  let body: { checklist?: Record<string, boolean> } = {};
  await mockApi(page);
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { orders: [{ ...ORDER, status: 'imprimiendo' }] } });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/calidad/checklists', (route) =>
    route.fulfill({ json: { checklists: CHECKLISTS_QC } }),
  );
  await page.route('**/api/admin/calidad', (route) => {
    if (route.request().method() === 'POST') {
      posted = true;
      body = route.request().postDataJSON() as typeof body;
      return route.fulfill({ json: { ...QC_REGISTRO, id: 'qc_2', order_id: 'ord_1' } });
    }
    return route.fulfill({ json: { registros: [] } });
  });
  await page.goto('/taller#calidad');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByText('Capas uniformes, sin saltos ni hilos')).toBeVisible();
  const registrar = page.getByRole('button', { name: 'Registrar' });
  await expect(registrar).toBeDisabled();

  // Responder todos los items habilita el botón; el veredicto lo da el worker.
  const bien = page.getByRole('button', { name: 'Bien' });
  await expect(bien).toHaveCount(5);
  for (let i = 0; i < 5; i++) await bien.nth(i).click();
  await registrar.click();

  await expect(page.getByText('Revisión registrada: Aprobada.')).toBeVisible();
  expect(posted).toBe(true);
  for (const id of ['capas', 'warping', 'encaje', 'colores', 'electrico']) {
    expect(body.checklist?.[id]).toBe(true);
  }
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
