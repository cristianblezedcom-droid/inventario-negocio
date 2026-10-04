import type { Database } from './database.ts';
import { createAuth } from './auth.ts';
import { createService } from './service.ts';
import { AppError } from './errors.ts';
import { importLegacy } from './import-legacy.ts';

export const DEMO_ADMIN = {
  name: 'Administración demo',
  email: 'admin@almacen.local',
  password: 'AprendeInventario2026!',
  role: 'admin',
};
export const DEMO_OPERATOR = {
  name: 'Operador demo',
  email: 'operador@almacen.local',
  password: 'AprendeInventario2026!',
  role: 'operator',
};

export async function bootstrap(db: Database, demo: boolean, legacyPath?: string) {
  const auth = createAuth(db);
  let users = await auth.listUsers();
  if (!users.length) {
    if (demo) {
      await auth.createUser(DEMO_ADMIN);
      await auth.createUser(DEMO_OPERATOR);
    } else {
      if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
        throw new AppError(
          'Define ADMIN_EMAIL y ADMIN_PASSWORD para crear el primer administrador.',
        );
      if (process.env.ADMIN_PASSWORD === DEMO_ADMIN.password)
        throw new AppError('El administrador debe usar una contraseña distinta de la demo.');
      await auth.createUser({
        name: process.env.ADMIN_NAME || 'Administrador',
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        role: 'admin',
      });
    }
    users = await auth.listUsers();
  }
  if (demo && legacyPath) await importLegacy(db, legacyPath);
  if (demo && !(await db.query('SELECT id FROM products LIMIT 1')).rows.length) {
    const actor = users.find((user) => user.role === 'admin' && user.active)!;
    const service = createService(db);
    const examples = [
      ['PAP-001', 'Cuaderno cuadriculado', 'Papelería', 8500, 42, 10],
      ['PAP-002', 'Bolígrafo negro', 'Papelería', 1800, 8, 15],
      ['TEC-001', 'Cable USB-C', 'Tecnología', 18000, 24, 8],
      ['TEC-002', 'Mouse inalámbrico', 'Tecnología', 45000, 6, 8],
      ['ACC-001', 'Botella reutilizable', 'Accesorios', 28000, 18, 5],
      ['ACC-002', 'Estuche organizador', 'Accesorios', 12500, 0, 5],
    ] as const;
    for (const [sku, name, category, price, initial_stock, min_stock] of examples)
      await service.createProduct(
        { sku, name, category, price_cents: price * 100, initial_stock, min_stock },
        actor,
      );
  }
}
