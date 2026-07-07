import { expect, test } from '@playwright/test';

// La API se mockea con page.route: aquí se prueba el cableado del sitio
// (payload correcto, redirect, estados de UI), no el worker — ese tiene su
// propia verificación contra wrangler dev.

test('el configurador manda la combinación elegida al checkout y redirige a Stripe', async ({
  page,
}) => {
  let payload: unknown = null;

  await page.route('**/api/checkout', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { url: 'https://checkout.stripe.com/c/pay/cs_test_mock' } });
  });
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>stripe checkout</h1>' }),
  );

  await page.goto('/lampara');

  // Combinación distinta a los defaults: modelo Torsion, pantalla morada,
  // tapa naranja (la tapa vive dos pasos adelante). El primer clic se
  // reintenta hasta que el island hidrate y el estado responda.
  const torsion = page.getByRole('radio', { name: 'Torsion' });
  await expect(async () => {
    await torsion.click();
    await expect(torsion).toHaveAttribute('aria-checked', 'true', { timeout: 500 });
  }).toPass();
  await page.getByRole('radio', { name: 'Morado' }).click();
  await page.getByRole('button', { name: 'Pieza siguiente' }).click();
  await page.getByRole('button', { name: 'Pieza siguiente' }).click();
  await page.getByRole('radio', { name: 'Naranja' }).click();

  await page.getByRole('button', { name: 'Comprar' }).click();

  await page.waitForURL('https://checkout.stripe.com/**');
  expect(payload).toEqual({
    product: 'lampara',
    config: { model: 'torsion', pantalla: 'morado', tapa: 'naranja' },
  });
});

test('si el pago no abre, el configurador avisa y deja reintentar', async ({ page }) => {
  await page.route('**/api/checkout', (route) => route.fulfill({ status: 500, json: { error: 'stripe' } }));
  await page.goto('/lampara');
  // Reintento hasta que el island hidrate y el clic surta efecto.
  await expect(async () => {
    await page.getByRole('button', { name: 'Comprar' }).click();
    await expect(page.getByText('No se pudo abrir el pago')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.getByRole('button', { name: 'Comprar' })).toBeEnabled();
});

test('la banca disponible deja comprar', async ({ page }) => {
  await page.route('**/api/products/banca-001', (route) =>
    route.fulfill({ json: { id: 'banca-001', available: true, price_mxn: 240000 } }),
  );
  await page.goto('/banca');
  await expect(page.getByRole('button', { name: 'Comprar' })).toBeEnabled();
});

test('la banca vendida muestra el estado y conserva el mailto', async ({ page }) => {
  await page.route('**/api/products/banca-001', (route) =>
    route.fulfill({ json: { id: 'banca-001', available: false, price_mxn: 240000 } }),
  );
  await page.goto('/banca');
  await expect(page.getByText('Vendida — vive en otro jardín')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comprar' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '¿una a tu medida?' })).toBeVisible();
});

test('la página de gracias existe con la voz de la marca', async ({ page }) => {
  await page.goto('/gracias');
  await expect(page.getByRole('heading', { name: 'Gracias. Ya está en mi taller.' })).toBeVisible();
  await expect(page.getByText('¿Pagaste con OXXO?')).toBeVisible();
});
