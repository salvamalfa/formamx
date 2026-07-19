import { expect, test, type Page } from '@playwright/test';

// Vista Clientes (F7): fusión del CRM con la mensajería en tres columnas
// (lista de personas · chat · ficha). La API va mockeada con page.route.

const ORDER = {
  id: 'ord_1',
  created_at: '2026-07-07 20:00:00',
  product_id: 'lampara',
  production: 'impresion_3d',
  config: { model: 'tessera', pantalla: 'azul', tapa: 'rojo' },
  amount_mxn: 49900,
  status: 'pagada',
  payment_method: 'card',
  customer: { name: 'Ana Prueba', email: 'ana@example.com', phone: '+525511112222' },
  customer_id: 'cus_1',
  shipping: { name: 'Ana Prueba', address: { city: 'CDMX' } },
  jobs: [] as unknown[],
};

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
    active_order_count: 1,
    city: 'CDMX',
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
    active_order_count: 0,
    city: 'Monterrey',
  },
  {
    id: 'cus_3',
    created_at: '2026-05-10 10:00:00',
    name: 'Carla Sol',
    email: 'carla@example.com',
    phone: '+525599998888',
    notes: null,
    order_count: 0,
    last_order_at: null,
    active_order_count: 0,
    city: 'CDMX',
  },
];

// Ana: hilo con un `out` respondido y un `in` nuevo (pendiente).
// Diana: contacto suelto (customer_id null) agrupado por `subject`, pendiente.
const MENSAJES = [
  {
    id: 'm_ana_out',
    channel: 'whatsapp',
    direction: 'out',
    customer_id: 'cus_1',
    order_id: null,
    subject: null,
    body: 'Va esta semana, Ana.',
    status: 'respondido',
    created_at: '2026-07-16 09:00:00',
    customer_name: 'Ana Prueba',
  },
  {
    id: 'm_ana_in',
    channel: 'whatsapp',
    direction: 'in',
    customer_id: 'cus_1',
    order_id: null,
    subject: null,
    body: 'Hola, ¿cuándo llega mi lámpara?',
    status: 'nuevo',
    created_at: '2026-07-17 10:00:00',
    customer_name: 'Ana Prueba',
  },
  {
    id: 'm_diana',
    channel: 'web',
    direction: 'in',
    customer_id: null,
    order_id: null,
    subject: 'Diana Web',
    body: '¿Hacen envíos a Oaxaca?',
    status: 'nuevo',
    created_at: '2026-07-18 08:00:00',
    customer_name: null,
  },
];

async function mockShell(
  page: Page,
  opts: { clientes?: typeof CLIENTES; mensajes?: typeof MENSAJES } = {},
) {
  const clientes = opts.clientes ?? CLIENTES;
  const mensajes = opts.mensajes ?? MENSAJES;

  await page.route('**/api/admin/resumen', (route) =>
    route.fulfill({
      json: {
        ventas: { mes_mxn: 0, mes_anterior_mxn: 0, delta_pct: null, serie: [] },
        pedidos: { activos: 0, sin_empezar: 0 },
        mensajes_sin_responder: 0,
        material_bajo: 0,
      },
    }),
  );
  await page.route('**/api/admin/orders', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { orders: [ORDER] } });
    return route.fallback();
  });
  await page.route('**/api/admin/orders/*', (route) => route.fulfill({ json: ORDER }));
  await page.route('**/api/admin/spools', (route) =>
    route.fulfill({ json: { slots: [] } }),
  );
  await page.route('**/api/admin/printer', (route) =>
    route.fulfill({ json: { bed_clear: true, ams_synced_at: null } }),
  );
  await page.route('**/api/admin/envios**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { envios: [] } });
    return route.fallback();
  });
  // Lista del CRM.
  await page.route('**/api/admin/clientes', (route) =>
    route.fulfill({ json: { clientes } }),
  );
  // Inbox: la lectura del MensajesProvider (`/inbox?limit=200`).
  await page.route('**/api/admin/inbox**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { mensajes } });
    return route.fallback();
  });
}

async function entrar(page: Page, hash = '#clientes') {
  await page.goto(`/taller${hash}`);
  await page.getByPlaceholder('token').fill('t');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('lista = clientes + contacto suelto por subject, pendientes con punto arriba', async ({
  page,
}) => {
  await mockShell(page);
  await entrar(page);

  const lista = page.getByTestId('persona-lista');
  await expect(lista.getByText('Ana Prueba')).toBeVisible();
  await expect(lista.getByText('Bruno Madera')).toBeVisible();
  await expect(lista.getByText('Carla Sol')).toBeVisible();
  // Contacto suelto agrupado por su subject.
  await expect(lista.getByText('Diana Web')).toBeVisible();

  // Dos pendientes (Ana + Diana) con punto naranja.
  await expect(page.getByTestId('pendiente-dot')).toHaveCount(2);

  // Pendientes arriba: Diana (más reciente) y Ana ocupan los dos primeros.
  const botones = lista.locator('button');
  await expect(botones.nth(0)).toContainText('Diana Web');
  await expect(botones.nth(1)).toContainText('Ana Prueba');
});

test('la búsqueda y el chip de ciudad filtran', async ({ page }) => {
  await mockShell(page);
  await entrar(page);
  const lista = page.getByTestId('persona-lista');

  await page.getByPlaceholder('Buscar…').fill('bruno');
  await expect(lista.getByText('Ana Prueba')).toHaveCount(0);
  await expect(lista.getByText('Bruno Madera')).toBeVisible();

  await page.getByPlaceholder('Buscar…').fill('');
  // Chip de ciudad: solo Monterrey (Bruno); CDMX y el contacto quedan fuera.
  await page.getByRole('button', { name: 'Monterrey', exact: true }).click();
  await expect(lista.getByText('Bruno Madera')).toBeVisible();
  await expect(lista.getByText('Ana Prueba')).toHaveCount(0);
  await expect(lista.getByText('Diana Web')).toHaveCount(0);
});

test('la búsqueda encuentra por correo y por teléfono, no solo por nombre', async ({ page }) => {
  await mockShell(page);
  await entrar(page);
  const lista = page.getByTestId('persona-lista');

  // Por correo (que no aparece en el nombre visible del renglón).
  await page.getByPlaceholder('Buscar…').fill('bruno@example.com');
  await expect(lista.getByText('Bruno Madera')).toBeVisible();
  await expect(lista.getByText('Ana Prueba')).toHaveCount(0);

  // Por teléfono (solo el de Carla termina en 9998888).
  await page.getByPlaceholder('Buscar…').fill('9998888');
  await expect(lista.getByText('Carla Sol')).toBeVisible();
  await expect(lista.getByText('Bruno Madera')).toHaveCount(0);
});

test('la ficha muestra correo y teléfono como enlaces mailto/tel', async ({ page }) => {
  await mockShell(page);
  await page.route('**/api/admin/clientes/*', (route) =>
    route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [] } }),
  );
  await entrar(page, '#clientes/cus_1');

  await expect(page.locator('a[href="mailto:ana@example.com"]')).toBeVisible();
  await expect(page.locator('a[href="tel:+525511112222"]')).toBeVisible();
});

test('si el historial de la ficha falla, muestra alerta y Reintentar rehace el fetch', async ({
  page,
}) => {
  await mockShell(page);
  let intentos = 0;
  await page.route('**/api/admin/clientes/*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    intentos += 1;
    if (intentos === 1) return route.fulfill({ status: 500, json: { error: 'boom' } });
    return route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [ORDER] } });
  });
  await entrar(page, '#clientes/cus_1');

  await expect(page.getByRole('alert').getByText('No se pudo cargar. Reintenta.')).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  // El segundo intento trae el pedido de Ana.
  await expect(page.getByText('Lámpara Tessera')).toBeVisible();
  expect(intentos).toBe(2);
});

test('el composer no manda dos veces el mismo envío (guardia de doble envío)', async ({ page }) => {
  await mockShell(page);
  let posts = 0;
  await page.route('**/api/admin/inbox', async (route) => {
    if (route.request().method() === 'POST') {
      posts += 1;
      // Retraso para mantener el envío "en vuelo" mientras se intenta reenviar.
      await new Promise((r) => setTimeout(r, 400));
      return route.fulfill({
        json: {
          id: 'm_new_out',
          channel: 'whatsapp',
          direction: 'out',
          customer_id: 'cus_1',
          order_id: null,
          subject: null,
          body: 'uno',
          status: 'respondido',
          created_at: '2026-07-18 12:00:00',
          customer_name: 'Ana Prueba',
        },
      });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/inbox/*', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ json: { ...MENSAJES[1], status: 'respondido' } });
    }
    return route.fallback();
  });
  await entrar(page, '#clientes/cus_1');

  const input = page.getByLabel('Escribe un mensaje');
  await input.fill('uno');
  await input.press('Enter');
  // Reintento inmediato mientras el primer POST sigue en vuelo: debe ignorarse.
  await input.fill('dos');
  await input.press('Enter');

  await expect.poll(() => posts).toBe(1);
  // Y no llega un segundo POST tras resolverse el primero.
  await page.waitForTimeout(300);
  expect(posts).toBe(1);
  // El texto escrito mientras el primero estaba en vuelo sigue como borrador.
  await expect(input).toHaveValue('dos');
});

test('deep-link #clientes/cus_1 abre el chat y la ficha', async ({ page }) => {
  await mockShell(page);
  await page.route('**/api/admin/clientes/*', (route) =>
    route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [ORDER] } }),
  );
  await entrar(page, '#clientes/cus_1');

  // Chat con los mensajes de Ana.
  const chat = page.getByTestId('chat-mensajes');
  await expect(chat.getByText('Hola, ¿cuándo llega mi lámpara?')).toBeVisible();
  await expect(chat.getByText('Va esta semana, Ana.')).toBeVisible();
  // Ficha con su correo.
  await expect(page.getByText('ana@example.com')).toBeVisible();
});

test('enviar con Enter hace POST out + PATCH respondido de los in pendientes', async ({ page }) => {
  await mockShell(page);
  let postBody: { direction?: string; customer_id?: string; body?: string } = {};
  const patched: string[] = [];
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() === 'POST') {
      postBody = route.request().postDataJSON() as typeof postBody;
      return route.fulfill({
        json: {
          id: 'm_new_out',
          channel: 'whatsapp',
          direction: 'out',
          customer_id: 'cus_1',
          order_id: null,
          subject: null,
          body: postBody.body,
          status: 'respondido',
          created_at: '2026-07-18 12:00:00',
          customer_name: 'Ana Prueba',
        },
      });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/inbox/*', (route) => {
    if (route.request().method() === 'PATCH') {
      patched.push(route.request().url());
      return route.fulfill({ json: { ...MENSAJES[1], status: 'respondido' } });
    }
    return route.fallback();
  });
  await entrar(page, '#clientes/cus_1');

  const input = page.getByLabel('Escribe un mensaje');
  await input.fill('Sale mañana con guía.');
  await input.press('Enter');

  // Burbuja optimista.
  await expect(page.getByTestId('chat-mensajes').getByText('Sale mañana con guía.')).toBeVisible();
  expect(postBody.direction).toBe('out');
  expect(postBody.customer_id).toBe('cus_1');
  // El `in` pendiente de Ana se cerró (PATCH a respondido).
  await expect.poll(() => patched.some((u) => u.includes('m_ana_in'))).toBe(true);
});

test('si enviar falla conserva el borrador y permite reintentar', async ({ page }) => {
  await mockShell(page);
  let intentos = 0;
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    intentos += 1;
    if (intentos === 1) return route.fulfill({ status: 500, json: { error: 'boom' } });
    return route.fulfill({
      json: {
        id: 'm_retry_out',
        channel: 'whatsapp',
        direction: 'out',
        customer_id: 'cus_1',
        order_id: null,
        subject: null,
        body: 'No pierdas este texto.',
        status: 'respondido',
        created_at: '2026-07-18 12:00:00',
        customer_name: 'Ana Prueba',
      },
    });
  });
  await entrar(page, '#clientes/cus_1');

  const input = page.getByLabel('Escribe un mensaje');
  await input.fill('No pierdas este texto.');
  await input.press('Enter');

  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo enviar.' })).toContainText(
    'El mensaje sigue aquí para reintentar.',
  );
  await expect(input).toHaveValue('No pierdas este texto.');

  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('chat-mensajes').getByText('No pierdas este texto.')).toBeVisible();
  expect(intentos).toBe(2);
});

test('registrar entrante desde el <details> crea un in y aparece en el chat', async ({ page }) => {
  await mockShell(page);
  let postBody: { direction?: string; customer_id?: string; body?: string } = {};
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() === 'POST') {
      postBody = route.request().postDataJSON() as typeof postBody;
      return route.fulfill({
        json: {
          id: 'm_bruno_in',
          channel: 'email',
          direction: 'in',
          customer_id: 'cus_2',
          order_id: null,
          subject: null,
          body: postBody.body,
          status: 'nuevo',
          created_at: '2026-07-18 13:00:00',
          customer_name: 'Bruno Madera',
        },
      });
    }
    return route.fallback();
  });
  await page.route('**/api/admin/clientes/*', (route) =>
    route.fulfill({ json: { cliente: CLIENTES[1], pedidos: [] } }),
  );
  await entrar(page, '#clientes/cus_2');

  await page.getByText('Registrar entrante').click();
  await page.getByLabel('Canal').selectOption('email');
  await page.getByLabel('Cuerpo del mensaje recibido').fill('Me llegó, gracias.');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  await expect(page.getByTestId('chat-mensajes').getByText('Me llegó, gracias.')).toBeVisible();
  expect(postBody.direction).toBe('in');
  expect(postBody.customer_id).toBe('cus_2');
});

test('un contacto nuevo con "+" agrupa por subject y usa ext: en el hash', async ({ page }) => {
  await mockShell(page);
  let postBody: { direction?: string; subject?: string; body?: string } = {};
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() === 'POST') {
      postBody = route.request().postDataJSON() as typeof postBody;
      return route.fulfill({
        json: {
          id: 'm_evaweb',
          channel: 'web',
          direction: 'in',
          customer_id: null,
          order_id: null,
          subject: postBody.subject,
          body: postBody.body,
          status: 'nuevo',
          created_at: '2026-07-18 14:00:00',
          customer_name: null,
        },
      });
    }
    return route.fallback();
  });
  await entrar(page);

  await page.getByRole('button', { name: 'Registrar contacto nuevo' }).click();
  await page.getByLabel('Nombre del contacto').fill('Eva Nueva');
  await page.getByLabel('Canal').selectOption('web');
  await page.getByLabel('Cuerpo del mensaje recibido').fill('¿Tienes lámparas azules?');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  expect(postBody.direction).toBe('in');
  expect(postBody.subject).toBe('Eva Nueva');
  await expect(page).toHaveURL(/#clientes\/ext:Eva%20Nueva$/);
  await expect(page.getByTestId('chat-mensajes').getByText('¿Tienes lámparas azules?')).toBeVisible();
});

test('si registrar un contacto falla conserva el formulario y no navega', async ({ page }) => {
  await mockShell(page);
  let intentos = 0;
  await page.route('**/api/admin/inbox', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    intentos += 1;
    if (intentos === 1) return route.fulfill({ status: 500, json: { error: 'boom' } });
    return route.fulfill({
      json: {
        id: 'm_retry_in',
        channel: 'web',
        direction: 'in',
        customer_id: null,
        order_id: null,
        subject: 'Eva Nueva',
        body: '¿Tienes lámparas azules?',
        status: 'nuevo',
        created_at: '2026-07-18 14:00:00',
        customer_name: null,
      },
    });
  });
  await entrar(page);

  await page.getByRole('button', { name: 'Registrar contacto nuevo' }).click();
  const nombre = page.getByLabel('Nombre del contacto');
  const cuerpo = page.getByLabel('Cuerpo del mensaje recibido');
  await nombre.fill('Eva Nueva');
  await page.getByLabel('Canal').selectOption('web');
  await cuerpo.fill('¿Tienes lámparas azules?');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();

  await expect(page.getByRole('alert')).toContainText('El mensaje sigue aquí para reintentar.');
  await expect(nombre).toHaveValue('Eva Nueva');
  await expect(cuerpo).toHaveValue('¿Tienes lámparas azules?');
  await expect(page).not.toHaveURL(/#clientes\/ext:/);

  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page).toHaveURL(/#clientes\/ext:Eva%20Nueva$/);
  expect(intentos).toBe(2);
});

test('el historial de la ficha navega a #pedido/<id>', async ({ page }) => {
  await mockShell(page);
  await page.route('**/api/admin/clientes/*', (route) =>
    route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [ORDER] } }),
  );
  await entrar(page, '#clientes/cus_1');

  // La ficha lista el pedido de Ana; al tocarlo abre el detalle.
  await page.getByRole('button', { name: /Lámpara Tessera/ }).click();
  await expect(page).toHaveURL(/#pedido\/ord_1$/);
  await expect(page.getByRole('heading', { name: 'Lámpara Tessera' })).toBeVisible();
});

test('las notas de la ficha se guardan (PATCH)', async ({ page }) => {
  await mockShell(page);
  let patched = false;
  await page.route('**/api/admin/clientes/*', (route) => {
    if (route.request().method() === 'PATCH') {
      patched = true;
      return route.fulfill({ json: { ...CLIENTES[0], notes: 'Cliente frecuente' } });
    }
    return route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [] } });
  });
  await entrar(page, '#clientes/cus_1');

  await page
    .getByPlaceholder('Preferencias, acuerdos, lo que haga falta recordar')
    .fill('Cliente frecuente');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Notas guardadas.')).toBeVisible();
  expect(patched).toBe(true);
});

test.describe('en móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('flujo lista → chat → ficha con regresos', async ({ page }) => {
    await mockShell(page);
    await page.route('**/api/admin/clientes/*', (route) =>
      route.fulfill({ json: { cliente: CLIENTES[0], pedidos: [ORDER] } }),
    );
    await entrar(page);

    // Lista: se ve, sin chat todavía.
    const lista = page.getByTestId('persona-lista');
    await expect(lista.getByText('Ana Prueba')).toBeVisible();
    await expect(page.getByTestId('chat-mensajes')).toHaveCount(0);

    // Abrir el chat de Ana.
    await lista.getByText('Ana Prueba').click();
    await expect(page.getByTestId('chat-mensajes')).toBeVisible();

    // Nombre del header → ficha.
    await page.getByRole('button', { name: 'Ana Prueba' }).click();
    await expect(page.getByText('ana@example.com')).toBeVisible();

    // Volver al chat.
    await page.getByRole('button', { name: '‹ Volver al chat' }).click();
    await expect(page.getByTestId('chat-mensajes')).toBeVisible();

    // Volver a la lista.
    await page.getByRole('button', { name: '‹ Volver' }).click();
    await expect(page.getByTestId('persona-lista').getByText('Bruno Madera')).toBeVisible();
  });
});
