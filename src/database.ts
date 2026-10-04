import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir, readFile } from 'node:fs/promises';
import { AppError } from './errors.ts';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(action: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: 'postgres' | 'pglite';
}
function translate(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === '23505') throw new AppError('El código o correo ya está registrado.', 409);
  if (code === '40001' || code === '40P01')
    throw new AppError('Otra operación modificó estos datos. Inténtalo de nuevo.', 409);
  throw error;
}
export async function openDatabase(
  options: { url?: string; path?: string } = {},
): Promise<Database> {
  let database: Database;
  if (options.url) {
    const pool = new pg.Pool({
      connectionString: options.url,
      max: 10,
      connectionTimeoutMillis: 10_000,
    });
    database = {
      kind: 'postgres',
      async query<T>(sql: string, params: unknown[] = []) {
        const result = await pool.query(sql, params);
        return { rows: result.rows as T[] };
      },
      async transaction<T>(action: (tx: Queryable) => Promise<T>) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await action({
            async query<R>(sql: string, params: unknown[] = []) {
              const result = await client.query(sql, params);
              return { rows: result.rows as R[] };
            },
          });
          await client.query('COMMIT');
          return result;
        } catch (error) {
          await client.query('ROLLBACK');
          return translate(error);
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    // En una descarga nueva no existe data/: prepara la ruta antes de abrir PostgreSQL.
    if (options.path && !options.path.startsWith('memory://'))
      await mkdir(options.path, { recursive: true });
    const local = await PGlite.create(options.path ?? 'memory://');
    database = {
      kind: 'pglite',
      async query<T>(sql: string, params: unknown[] = []) {
        return { rows: (await local.query<T>(sql, params)).rows };
      },
      async transaction<T>(action: (tx: Queryable) => Promise<T>) {
        try {
          return await local.transaction((tx) =>
            action({
              async query<R>(sql: string, params: unknown[] = []) {
                return { rows: (await tx.query<R>(sql, params)).rows };
              },
            }),
          );
        } catch (error) {
          return translate(error);
        }
      },
      close: () => local.close(),
    };
  }
  // Una migración se aplica una sola vez y dentro de una transacción.
  await database.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
  );
  await database.transaction(async (tx) => {
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    if (!(await tx.query('SELECT version FROM schema_migrations WHERE version = 1')).rows.length) {
      const sql = await readFile(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8');
      // Cada sentencia de esta migración es independiente; no contiene funciones SQL.
      for (const statement of sql
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (version) VALUES (1)');
    }
  });
  return database;
}
