import { test, expect } from '@playwright/test';

test('administrador completa catálogo, pedido, cancelación, reporte y usuario', async ({
  page,
}) => {
  const code = `E2E-${Date.now()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como administrador demo' }).click();
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
  await expect(page.getByText('Cuaderno cuadriculado', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/captura.png', fullPage: true });
  await page.getByRole('button', { name: 'Nuevo producto', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill(`Libreta ${code}`);
  await dialog.getByLabel('Código', { exact: true }).fill(code);
  await dialog.getByLabel('Categoría', { exact: true }).fill('Pruebas');
  await dialog.getByLabel('Precio unitario (COP)').fill('5000');
  await dialog.getByLabel('Mínimo de unidades').fill('2');
  await dialog.getByLabel('Unidades iniciales').fill('5');
  await dialog.getByRole('button', { name: 'Guardar producto' }).click();
  await page.getByRole('searchbox').fill(code);
  await expect(page.getByText(`Libreta ${code}`, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: `Registrar movimiento de Libreta ${code}`, exact: true })
    .click();
  await dialog.getByLabel('Tipo de movimiento').selectOption('OUT');
  await dialog.getByLabel('Cantidad de unidades').fill('6');
  await dialog.getByLabel('Motivo', { exact: true }).fill('Prueba imposible');
  await dialog.getByRole('button', { name: 'Guardar movimiento' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Solo hay 5 unidades disponibles.');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo pedido', exact: false }).click();
  await dialog.getByLabel('Cliente', { exact: true }).fill(`Cliente ${code}`);
  await dialog
    .getByLabel('Producto del pedido')
    .selectOption({ label: `Libreta ${code} (5 disponibles)` });
  await dialog.getByLabel('Unidades del pedido').fill('2');
  await dialog.getByRole('button', { name: 'Añadir al pedido' }).click();
  await dialog.getByRole('button', { name: 'Confirmar pedido' }).click();
  const row = page.getByRole('row').filter({ hasText: `Cliente ${code}` });
  await expect(row).toContainText('10.000');
  await row.getByRole('button', { name: 'Ver pedido', exact: false }).click();
  await expect(dialog).toContainText(`Libreta ${code}`);
  await dialog.getByRole('button', { name: 'Cerrar detalle' }).click();
  await row.getByRole('button', { name: 'Cancelar pedido', exact: false }).click();
  await dialog.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(row).toContainText('Cancelado');
  await page.getByRole('button', { name: 'Reportes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unidades por categoría' })).toBeVisible();
  await page.getByRole('button', { name: 'Usuarios', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo usuario', exact: false }).click();
  await dialog.getByLabel('Nombre del usuario').fill(`Empleado ${code}`);
  await dialog.getByLabel('Correo del usuario').fill(`${code.toLowerCase()}@demo.local`);
  await dialog.getByLabel('Contraseña', { exact: true }).fill('ContrasenaDePrueba2026!');
  await dialog.getByRole('button', { name: 'Guardar usuario' }).click();
  await expect(page.getByText(`Empleado ${code}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inventario', exact: true }).click();
  await page.getByRole('searchbox').fill(code);
  await page.getByRole('button', { name: `Editar Libreta ${code}`, exact: true }).click();
  await dialog.getByLabel('Nombre', { exact: true }).fill(`Libreta editada ${code}`);
  await dialog.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByText(`Libreta editada ${code}`, { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('inventario.csv');
  await page.getByRole('button', { name: `Archivar Libreta editada ${code}`, exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText(`Libreta editada ${code}`, { exact: true })).toHaveCount(0);
  await page.getByLabel('Ver archivados').check();
  await expect(page.getByText(`Libreta editada ${code}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actividad', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registro de actividad' })).toBeVisible();
});
test('operador, sesión y vista móvil', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar como operador demo' }).click();
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
  await expect(page.getByText('Cuaderno cuadriculado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo producto', exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usuarios', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/captura-movil.png', fullPage: true });
  await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo pedido', exact: false }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
  expect(errors).toEqual([]);
});
