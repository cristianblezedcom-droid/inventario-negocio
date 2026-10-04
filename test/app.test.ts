import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import type { Server } from 'node:http';
import { openDatabase } from '../src/database.ts';
import type { Database } from '../src/database.ts';
import { createAuth } from '../src/auth.ts';
import { createService } from '../src/service.ts';
import { createAppServer } from '../src/server.ts';
import { DEMO_ADMIN, DEMO_OPERATOR } from '../src/bootstrap.ts';
import type { User, Product } from '../src/types.ts';
import { filterProducts, status } from '../client/utils.ts';
import { DatabaseSync } from 'node:sqlite';
import { importLegacy } from '../src/import-legacy.ts';

let db: Database,
  auth: ReturnType<typeof createAuth>,
  service: ReturnType<typeof createService>,
  admin: User,
  operator: User;
const example = {
  sku: 'PAP-001',
  name: 'Cuaderno',
  category: 'Papelería',
  price_cents: 850000,
  min_stock: 2,
  initial_stock: 5,
};
before(async () => {
  db = await openDatabase({ url: process.env.TEST_DATABASE_URL });
  auth = createAuth(db);
  service = createService(db);
});
beforeEach(async () => {
  await db.query(
    'TRUNCATE audit_log,idempotency_keys,movements,order_lines,orders,products,sessions,users RESTART IDENTITY CASCADE',
  );
  admin = await auth.createUser(DEMO_ADMIN);
  operator = await auth.createUser(DEMO_OPERATOR);
});
after(async () => {
  await db?.close();
});

test('crear un producto normaliza su código y registra unidades con responsable', async () => {
  const product = await service.createProduct({ ...example, sku: 'pap-001' }, admin);
  assert.equal(product.sku, 'PAP-001');
  assert.equal(product.stock, 5);
  const movements = await service.listMovements();
  assert.equal(movements[0].actor_name, admin.name);
  assert.equal(movements[0].quantity, 5);
});
test('salida válida y rechazo de una salida imposible conservan el historial', async () => {
  const product = await service.createProduct(example, admin);
  await service.recordMovement(product.id, { kind: 'OUT', quantity: 3, note: 'Venta' }, operator);
  await assert.rejects(
    () =>
      service.recordMovement(product.id, { kind: 'OUT', quantity: 3, note: 'Imposible' }, operator),
    /Solo hay 2/,
  );
  assert.equal((await service.listProducts())[0].stock, 2);
  assert.equal((await service.listMovements()).length, 2);
});
test('códigos repetidos, decimales y valores negativos se rechazan', async () => {
  await service.createProduct(example, admin);
  await assert.rejects(() => service.createProduct(example, admin), /registrado/);
  for (const changes of [
    { initial_stock: -1 },
    { initial_stock: 1.5 },
    { price_cents: 1.1 },
    { name: ' ' },
    { sku: '<script>' },
  ])
    await assert.rejects(() =>
      service.createProduct({ ...example, sku: 'PAP-002', ...changes }, admin),
    );
  assert.equal((await service.listProducts()).length, 1);
});
test('editar datos no permite sobrescribir unidades y deja auditoría', async () => {
  const product = await service.createProduct(example, admin);
  const changed = await service.updateProduct(
    product.id,
    { ...example, name: 'Cuaderno grande', stock: 999, initial_stock: 999 },
    admin,
  );
  assert.equal(changed.stock, 5);
  assert.equal(changed.name, 'Cuaderno grande');
  assert.equal((await service.listAudit())[0].action, 'update');
});
test('archivar conserva el historial e impide movimientos y pedidos', async () => {
  const product = await service.createProduct(example, admin);
  await service.setProductActive(product.id, false, admin);
  await assert.rejects(
    () => service.recordMovement(product.id, { kind: 'IN', quantity: 1, note: 'Compra' }, operator),
    /Restaura/,
  );
  await assert.rejects(
    () =>
      service.createOrder(
        { customer: 'Ana', lines: [{ product_id: product.id, quantity: 1 }] },
        'archivo-00000000001',
        operator,
      ),
    /archivado/,
  );
  assert.equal((await service.listMovements()).length, 1);
  await service.setProductActive(product.id, true, admin);
  assert.equal((await service.listProducts())[0].active, true);
});
test('pedido guarda los precios históricos y descuenta unidades', async () => {
  const product = await service.createProduct(example, admin);
  const order = await service.createOrder(
    { customer: 'Ana', lines: [{ product_id: product.id, quantity: 2 }] },
    'pedido-00000000001',
    operator,
  );
  assert.equal(order.total_cents, 1700000);
  assert.equal((await service.listProducts())[0].stock, 3);
  await service.updateProduct(
    product.id,
    { ...example, price_cents: 900000, name: 'Nuevo nombre' },
    admin,
  );
  const historical = await service.getOrder(order.id);
  assert.equal(historical.lines![0].price_cents, 850000);
  assert.equal(historical.lines![0].name, 'Cuaderno');
});
test('pedido con una línea imposible revierte todas sus escrituras', async () => {
  const first = await service.createProduct(example, admin);
  const second = await service.createProduct(
    { ...example, sku: 'PAP-002', initial_stock: 0 },
    admin,
  );
  await assert.rejects(
    () =>
      service.createOrder(
        {
          customer: 'Ana',
          lines: [
            { product_id: first.id, quantity: 2 },
            { product_id: second.id, quantity: 1 },
          ],
        },
        'rollback-0000000001',
        operator,
      ),
    /solo hay 0/,
  );
  assert.equal((await service.listOrders()).length, 0);
  assert.equal((await service.listProducts()).find((product) => product.id === first.id)!.stock, 5);
  assert.equal((await service.listMovements()).length, 1);
});
test('cancelar devuelve unidades una sola vez y conserva el pedido', async () => {
  const product = await service.createProduct(example, admin);
  const order = await service.createOrder(
    { customer: 'Ana', lines: [{ product_id: product.id, quantity: 2 }] },
    'cancelar-0000000001',
    operator,
  );
  await service.cancelOrder(order.id, admin);
  await assert.rejects(() => service.cancelOrder(order.id, admin), /ya está cancelado/);
  assert.equal((await service.listProducts())[0].stock, 5);
  assert.equal((await service.getOrder(order.id)).status, 'cancelled');
  assert.equal((await service.report()).revenue_cents, 0);
});
test('reintentar el mismo pedido no duplica el pedido ni sus movimientos', async () => {
  const product = await service.createProduct(example, admin);
  const value = { customer: 'Ana', lines: [{ product_id: product.id, quantity: 2 }] };
  const [first, second] = await Promise.all([
    service.createOrder(value, 'reintento-000000001', operator),
    service.createOrder(value, 'reintento-000000001', operator),
  ]);
  assert.equal(first.id, second.id);
  assert.equal((await service.listOrders()).length, 1);
  assert.equal((await service.listProducts())[0].stock, 3);
  await assert.rejects(
    () =>
      service.createOrder({ ...value, customer: 'Otra persona' }, 'reintento-000000001', operator),
    /pedido distinto/,
  );
});
test('dos usuarios que compran la última unidad no pueden venderla dos veces', async () => {
  const product = await service.createProduct({ ...example, initial_stock: 1 }, admin);
  const value = { customer: 'Última unidad', lines: [{ product_id: product.id, quantity: 1 }] };
  const results = await Promise.allSettled([
    service.createOrder(value, 'concurrente-0000001', admin),
    service.createOrder(value, 'concurrente-0000002', operator),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await service.listProducts())[0].stock, 0);
  assert.equal((await service.listOrders()).length, 1);
});
test('cancelaciones simultáneas devuelven las unidades una sola vez', async () => {
  const product = await service.createProduct(example, admin);
  const order = await service.createOrder(
    { customer: 'Ana', lines: [{ product_id: product.id, quantity: 1 }] },
    'dos-cancelaciones-01',
    operator,
  );
  const result = await Promise.allSettled([
    service.cancelOrder(order.id, admin),
    service.cancelOrder(order.id, admin),
  ]);
  assert.equal(result.filter((row) => row.status === 'fulfilled').length, 1);
  assert.equal((await service.listProducts())[0].stock, 5);
});
test('las líneas duplicadas y cantidades inválidas no crean pedidos', async () => {
  const product = await service.createProduct(example, admin);
  for (const lines of [
    [],
    [{ product_id: product.id, quantity: 0 }],
    [
      { product_id: product.id, quantity: 1 },
      { product_id: product.id, quantity: 1 },
    ],
  ])
    await assert.rejects(() =>
      service.createOrder({ customer: 'Ana', lines }, 'invalido-0000000001', operator),
    );
  assert.equal((await service.listOrders()).length, 0);
});
test('reportes suman productos activos y ventas confirmadas', async () => {
  const product = await service.createProduct(example, admin);
  await service.createOrder(
    { customer: 'Ana', lines: [{ product_id: product.id, quantity: 2 }] },
    'reporte-0000000001',
    operator,
  );
  const report = await service.report();
  assert.equal(report.products, 1);
  assert.equal(report.units, 3);
  assert.equal(report.value_cents, 2550000);
  assert.equal(report.revenue_cents, 1700000);
  assert.equal(report.top_products[0].quantity, 2);
  assert.equal(report.daily_sales.length, 1);
});
test('contraseñas están derivadas con sal y las sesiones no guardan tokens originales', async () => {
  const rows = (await db.query<{ password_hash: string }>('SELECT password_hash FROM users')).rows;
  assert.ok(!rows[0].password_hash.includes(DEMO_ADMIN.password));
  assert.notEqual(rows[0].password_hash, rows[1].password_hash);
  const session = await auth.login(DEMO_ADMIN);
  const stored = (await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions'))
    .rows[0];
  assert.notEqual(stored.token_hash, session.token);
  assert.equal((await auth.session(session.token)).user.id, admin.id);
});
test('login incorrecto, expiración y cierre de sesión rechazan el acceso', async () => {
  await assert.rejects(
    () => auth.login({ ...DEMO_ADMIN, password: 'Contraseña incorrecta' }),
    /incorrectos/,
  );
  const first = await auth.login(DEMO_ADMIN);
  await auth.logout(first.token);
  await assert.rejects(() => auth.session(first.token), /caducado/);
  const second = await auth.login(DEMO_ADMIN);
  await db.query("UPDATE sessions SET expires_at=NOW()-INTERVAL '1 second'");
  await assert.rejects(() => auth.session(second.token), /caducado/);
});
test('cambiar permisos invalida sesiones y protege al último administrador', async () => {
  const session = await auth.login(DEMO_OPERATOR);
  await auth.updateUser(operator.id, { role: 'operator', active: false }, admin);
  await assert.rejects(() => auth.session(session.token), /caducado/);
  await assert.rejects(
    () => auth.updateUser(admin.id, { role: 'operator', active: true }, admin),
    /administrador activo/,
  );
});
test('primer arranque crea carpetas y conserva datos después de cerrar y abrir', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'almacen-pg-test-'));
  const databasePath = join(folder, 'data', 'postgres');
  try {
    await assert.rejects(() => access(join(folder, 'data')), { code: 'ENOENT' });
    const first = await openDatabase({ path: databasePath });
    const firstAuth = createAuth(first);
    const user = await firstAuth.createUser(DEMO_ADMIN);
    await createService(first).createProduct(example, user);
    await first.close();
    const second = await openDatabase({ path: databasePath });
    assert.equal((await createService(second).listProducts())[0].stock, 5);
    await second.close();
  } finally {
    assert.equal(resolve(dirname(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('almacen-pg-test-'));
    await rm(folder, { recursive: true, force: true });
  }
});
test('filtros combinan búsqueda, categoría, existencias, rango de precios y archivados', () => {
  const product = {
    ...example,
    id: 1,
    stock: 5,
    active: true,
    created_at: '2026-01-01',
  } as Product;
  const filters = {
    search: 'cuad',
    category: 'Papelería',
    stock: '',
    minimum: '8000',
    maximum: '9000',
    archived: false,
  };
  assert.equal(filterProducts([product], filters).length, 1);
  assert.equal(filterProducts([product], { ...filters, minimum: '9000' }).length, 0);
  assert.equal(
    filterProducts([{ ...product, active: false }], { ...filters, archived: true }).length,
    1,
  );
  assert.equal(status({ ...product, stock: 0 })[0], 'Agotado');
  assert.equal(status({ ...product, stock: 2 })[0], 'Por reponer');
});

test('migración de la primera etapa conserva productos e historial y no duplica datos', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'almacen-sqlite-test-'));
  const sourcePath = join(folder, 'original.sqlite');
  try {
    const source = new DatabaseSync(sourcePath);
    source.exec(
      "CREATE TABLE products(id INTEGER,sku TEXT,name TEXT,category TEXT,price_cents INTEGER,stock INTEGER,min_stock INTEGER,created_at TEXT); CREATE TABLE movements(id INTEGER PRIMARY KEY,product_id INTEGER,kind TEXT,quantity INTEGER,note TEXT,created_at TEXT); INSERT INTO products VALUES(9,'LEG-001','Producto anterior','General',500000,3,2,'2026-10-02T12:00:00Z'); INSERT INTO movements(product_id,kind,quantity,note,created_at) VALUES(9,'IN',5,'Inicial','2026-10-02T12:00:00Z'),(9,'OUT',2,'Venta anterior','2026-10-02T13:00:00Z');",
    );
    source.close();
    assert.equal(await importLegacy(db, sourcePath), true);
    assert.equal((await service.listProducts())[0].stock, 3);
    assert.equal((await service.listMovements()).length, 2);
    assert.equal(await importLegacy(db, sourcePath), false);
    assert.equal((await service.listMovements()).length, 2);
    const unchanged = new DatabaseSync(sourcePath, { readOnly: true });
    assert.equal(unchanged.prepare('SELECT stock FROM products').get()!.stock, 3);
    unchanged.close();
  } finally {
    assert.equal(resolve(dirname(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('almacen-sqlite-test-'));
    await rm(folder, { recursive: true, force: true });
  }
});

async function httpContext() {
  const server = createAppServer(db, { demo: true });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  return { server, base };
}
async function stop(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
async function credentials(base: string, user: typeof DEMO_ADMIN) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  return {
    Cookie: response.headers.get('set-cookie')!.split(';')[0],
    'X-CSRF-Token': result.csrf,
    'Content-Type': 'application/json',
  };
}

test('API exige sesión, token CSRF y permisos en el servidor', async () => {
  const { server, base } = await httpContext();
  try {
    const guest = await fetch(`${base}/api/products`);
    assert.equal(guest.status, 401);
    await guest.json();
    const operatorHeaders = await credentials(base, DEMO_OPERATOR);
    const forbidden = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify(example),
    });
    assert.equal(forbidden.status, 403);
    await forbidden.json();
    const headers = await credentials(base, DEMO_ADMIN);
    const missingCsrf = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { Cookie: headers.Cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(example),
    });
    assert.equal(missingCsrf.status, 403);
    await missingCsrf.json();
    const created = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers,
      body: JSON.stringify(example),
    });
    assert.equal(created.status, 201);
    await created.json();
    const users = await fetch(`${base}/api/users`, { headers: operatorHeaders });
    assert.equal(users.status, 403);
    await users.json();
    const crossSite = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { ...headers, Origin: 'https://otro.example' },
      body: JSON.stringify(example),
    });
    assert.equal(crossSite.status, 403);
    await crossSite.json();
  } finally {
    await stop(server);
  }
});
test('pedidos HTTP simultáneos de dos usuarios no venden la última unidad dos veces', async () => {
  const product = await service.createProduct({ ...example, initial_stock: 1 }, admin);
  const { server, base } = await httpContext();
  try {
    const adminHeaders = await credentials(base, DEMO_ADMIN);
    const operatorHeaders = await credentials(base, DEMO_OPERATOR);
    const send = (headers: Record<string, string>, key: string) =>
      fetch(`${base}/api/orders`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': key },
        body: JSON.stringify({
          customer: 'Concurrencia HTTP',
          lines: [{ product_id: product.id, quantity: 1 }],
        }),
      });
    const results = await Promise.all([
      send(adminHeaders, 'http-concurrente-001'),
      send(operatorHeaders, 'http-concurrente-002'),
    ]);
    assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
    await Promise.all(results.map((response) => response.json()));
    assert.equal((await service.listProducts())[0].stock, 0);
  } finally {
    await stop(server);
  }
});
test('API rechaza JSON mal formado, contenido incompatible y sesiones inválidas', async () => {
  const { server, base } = await httpContext();
  try {
    const headers = await credentials(base, DEMO_ADMIN);
    const malformed = await fetch(`${base}/api/products`, { method: 'POST', headers, body: '{' });
    assert.equal(malformed.status, 400);
    await malformed.json();
    const badType = await fetch(`${base}/api/products`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: 'texto',
    });
    assert.equal(badType.status, 415);
    await badType.json();
    const session = await fetch(`${base}/api/products`, { headers: { Cookie: 'session=invalid' } });
    assert.equal(session.status, 401);
    await session.json();
  } finally {
    await stop(server);
  }
});
test('ocho intentos fallidos activan el límite de login', async () => {
  const { server, base } = await httpContext();
  try {
    for (let i = 0; i < 8; i++) {
      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DEMO_ADMIN, password: 'Incorrecta' }),
      });
      assert.equal(response.status, 401);
      await response.json();
    }
    const blocked = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEMO_ADMIN),
    });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    await blocked.json();
  } finally {
    await stop(server);
  }
});
