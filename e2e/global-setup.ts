import { openDatabase } from '../src/database.ts';
import { bootstrap } from '../src/bootstrap.ts';
import { createAppServer } from '../src/server.ts';

// El servidor de pruebas vive en el mismo proceso: no deja procesos huérfanos en Windows.
export default async function setup() {
  const db = await openDatabase();
  let server: ReturnType<typeof createAppServer> | undefined;
  try {
    await bootstrap(db, true);
    server = createAppServer(db, { demo: true, origin: 'http://127.0.0.1:4321' });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(4321, '127.0.0.1', resolve);
    });
  } catch (error) {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.close();
    throw error;
  }
  return async () => {
    server!.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.close();
  };
}
