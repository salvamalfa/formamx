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
  opts: { spools?: (string | null)[]; bedClear?: boolean } = {},
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
      json: { slots: spools.map((color_id, slot) => ({ slot, color_id, material: null })) },
    }),
  );
  await page.route('**/api/admin/printer', (route) =>
    route.fulfill({ json: { bed_clear: opts.bedClear ?? true, ams_synced_at: null } }),
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

test('cada ranura permite indicar el material y se guarda', async ({ page }) => {
  let saved: unknown = null;
  await mockApi(page, { spools: ['blanco', null, null, null] });
  await page.route('**/api/admin/spools', (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: saved });
    }
    return route.fulfill({
      json: { slots: [{ slot: 0, color_id: 'blanco', material: null }, { slot: 1, color_id: null, material: null }, { slot: 2, color_id: null, material: null }, { slot: 3, color_id: null, material: null }] },
    });
  });
  await page.goto('/taller');
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByLabel('Material ranura 1').selectOption('PETG');
  await expect
    .poll(() => saved)
    .toMatchObject({ slots: [{ slot: 0, color_id: 'blanco', material: 'PETG' }, {}, {}, {}] });
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
