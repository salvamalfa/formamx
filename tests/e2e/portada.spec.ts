import { expect, test } from '@playwright/test';

// La portada-menú: tres columnas sobre una foto, cada
// una un <a> a su página completa (/forma, /trabajos, /mas). Sin API que
// mockear — todo es contenido estático de src/lib/trabajos.ts.

test('la portada responde y muestra los tres enlaces de columna', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('a[href="/forma"]')).toBeVisible();
  await expect(page.locator('a[href="/trabajos"]')).toBeVisible();
  await expect(page.locator('a[href="/mas"]')).toBeVisible();
});

test('la columna Trabajos lleva a /trabajos con su h1', async ({ page }) => {
  await page.goto('/');
  await page.locator('a[href="/trabajos"]').click();
  await expect(page).toHaveURL(/\/trabajos$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Trabajos' })).toBeVisible();
});

test('/trabajos enlaza a /banca y /lampara', async ({ page }) => {
  await page.goto('/trabajos');
  await expect(page.locator('a[href="/banca"]')).toBeVisible();
  await expect(page.locator('a[href="/lampara"]')).toBeVisible();
});

test('/forma responde 200 y muestra su h1', async ({ page }) => {
  const res = await page.goto('/forma');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();
});

test('/mas responde 200 y muestra su h1', async ({ page }) => {
  const res = await page.goto('/mas');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Más' })).toBeVisible();
});

test('el enlace Menú de /trabajos regresa a la portada', async ({ page }) => {
  await page.goto('/trabajos');
  await page.getByRole('link', { name: 'Menú' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('/mas tiene el input de correo', async ({ page }) => {
  await page.goto('/mas');
  await expect(page.getByLabel('Tu correo')).toBeVisible();
});
