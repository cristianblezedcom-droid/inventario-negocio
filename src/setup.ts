import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.ts';
import { bootstrap } from './bootstrap.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
const db = await openDatabase({
  url: process.env.DATABASE_URL,
  path: resolve(root, process.env.DATABASE_PATH || 'data/postgres'),
});
try {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'false')
    throw new Error('Producción requiere DEMO_MODE=false.');
  await bootstrap(
    db,
    process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== 'false',
    resolve(root, 'data/inventory.sqlite'),
  );
  console.log('Esquema y administrador preparados.');
} finally {
  await db.close();
}
