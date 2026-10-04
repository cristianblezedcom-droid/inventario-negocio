import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Database } from './database.ts';

interface LegacyProduct {
  id: number;
  sku: string;
  name: string;
  category: string;
  price_cents: number;
  stock: number;
  min_stock: number;
  created_at: string;
}
interface LegacyMovement {
  product_id: number;
  kind: string;
  quantity: number;
  note: string;
  created_at: string;
}
// Migra la primera etapa solo si el destino está vacío; la base original nunca se modifica.
export async function importLegacy(db: Database, path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    const products = source
      .prepare('SELECT * FROM products ORDER BY id')
      .all() as unknown as LegacyProduct[];
    const movements = source
      .prepare('SELECT * FROM movements ORDER BY id')
      .all() as unknown as LegacyMovement[];
    if (!products.length) return false;
    return db.transaction(async (tx) => {
      await tx.query('LOCK TABLE products IN EXCLUSIVE MODE');
      if ((await tx.query('SELECT id FROM products LIMIT 1')).rows.length) return false;
      const ids = new Map<number, number>();
      for (const product of products) {
        const inserted = (
          await tx.query<{ id: number }>(
            'INSERT INTO products (sku,name,category,price_cents,stock,min_stock,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [
              product.sku,
              product.name,
              product.category,
              product.price_cents,
              product.stock,
              product.min_stock,
              product.created_at,
            ],
          )
        ).rows[0];
        ids.set(product.id, inserted.id);
      }
      for (const movement of movements)
        await tx.query(
          'INSERT INTO movements (product_id,kind,quantity,note,created_at) VALUES ($1,$2,$3,$4,$5)',
          [
            ids.get(movement.product_id),
            movement.kind,
            movement.quantity,
            movement.note,
            movement.created_at,
          ],
        );
      await tx.query(
        "INSERT INTO audit_log (action,entity,entity_id,details) VALUES ('import','database',1,$1)",
        [
          JSON.stringify({
            source: 'etapa-1-sqlite',
            products: products.length,
            movements: movements.length,
          }),
        ],
      );
      return true;
    });
  } finally {
    source.close();
  }
}
