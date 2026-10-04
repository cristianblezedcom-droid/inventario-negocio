import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './database.ts';
import { openDatabase } from './database.ts';
import { createAuth, requireAdmin } from './auth.ts';
import { createService } from './service.ts';
import { AppError, object } from './errors.ts';
import { bootstrap } from './bootstrap.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}
async function body(request: IncomingMessage) {
  if (!(request.headers['content-type'] ?? '').startsWith('application/json'))
    throw new AppError('El contenido debe ser JSON.', 415);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new AppError('La solicitud es demasiado grande.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AppError('El JSON no es válido.');
  }
}
function cookie(request: IncomingMessage) {
  return request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('session='))
    ?.slice(8);
}
export function createAppServer(
  db: Database,
  options: { origin?: string; secureCookies?: boolean; demo?: boolean } = {},
) {
  const auth = createAuth(db);
  const service = createService(db);
  const attempts = new Map<string, { count: number; until: number }>();
  const setCookie = (token: string, clear = false) =>
    `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 28800}${options.secureCookies ? '; Secure' : ''}`;
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    const writing = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? '');
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = url.pathname;
      if (writing) {
        const allowed = options.origin || `http://${request.headers.host}`;
        if (
          (request.headers.origin && request.headers.origin !== allowed) ||
          request.headers['sec-fetch-site'] === 'cross-site'
        )
          throw new AppError('El origen de la solicitud no está permitido.', 403);
      }
      if (path === '/api/health' && request.method === 'GET')
        return json(response, 200, { status: 'ok' });
      if (path === '/api/config' && request.method === 'GET')
        return json(response, 200, { demo: options.demo ?? false });
      if (path === '/api/auth/login' && request.method === 'POST') {
        const ip = request.socket.remoteAddress || 'local';
        for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
        const attempt = attempts.get(ip) ?? { count: 0, until: Date.now() + 600_000 };
        if (attempt.count >= 8) {
          response.setHeader('Retry-After', String(Math.ceil((attempt.until - Date.now()) / 1000)));
          throw new AppError('Demasiados intentos. Espera unos minutos.', 429);
        }
        attempt.count++;
        attempts.set(ip, attempt);
        if (attempts.size > 5000) attempts.delete(attempts.keys().next().value!);
        const result = await auth.login(await body(request));
        attempts.delete(ip);
        response.setHeader('Set-Cookie', setCookie(result.token));
        return json(response, 200, { user: result.user, csrf: result.csrf });
      }
      if (path.startsWith('/api/')) {
        const token = cookie(request);
        const session = await auth.session(token);
        if (writing && request.headers['x-csrf-token'] !== session.csrf)
          throw new AppError('La solicitud necesita un token de sesión válido.', 403);
        const actor = session.user;
        if (path === '/api/auth/me' && request.method === 'GET')
          return json(response, 200, session);
        if (path === '/api/auth/logout' && request.method === 'POST') {
          await auth.logout(token!);
          response.setHeader('Set-Cookie', setCookie('', true));
          return json(response, 200, { success: true });
        }
        if (path === '/api/products' && request.method === 'GET')
          return json(response, 200, await service.listProducts());
        if (path === '/api/products' && request.method === 'POST') {
          requireAdmin(actor);
          return json(response, 201, await service.createProduct(await body(request), actor));
        }
        const product = path.match(/^\/api\/products\/(\d+)(\/movements|\/active)?$/);
        if (product && !product[2] && request.method === 'PUT') {
          requireAdmin(actor);
          return json(
            response,
            200,
            await service.updateProduct(Number(product[1]), await body(request), actor),
          );
        }
        if (product?.[2] === '/movements' && request.method === 'POST')
          return json(
            response,
            201,
            await service.recordMovement(Number(product[1]), await body(request), actor),
          );
        if (product?.[2] === '/active' && request.method === 'PATCH') {
          requireAdmin(actor);
          return json(
            response,
            200,
            await service.setProductActive(
              Number(product[1]),
              object(await body(request)).active,
              actor,
            ),
          );
        }
        if (path === '/api/movements' && request.method === 'GET')
          return json(response, 200, await service.listMovements());
        if (path === '/api/orders' && request.method === 'GET')
          return json(response, 200, await service.listOrders());
        if (path === '/api/orders' && request.method === 'POST')
          return json(
            response,
            201,
            await service.createOrder(
              await body(request),
              String(request.headers['idempotency-key'] ?? ''),
              actor,
            ),
          );
        const order = path.match(/^\/api\/orders\/(\d+)(\/cancel)?$/);
        if (order && !order[2] && request.method === 'GET')
          return json(response, 200, await service.getOrder(Number(order[1])));
        if (order?.[2] === '/cancel' && request.method === 'POST') {
          requireAdmin(actor);
          return json(response, 200, await service.cancelOrder(Number(order[1]), actor));
        }
        if (path === '/api/report' && request.method === 'GET')
          return json(response, 200, await service.report());
        if (path === '/api/users') {
          requireAdmin(actor);
          if (request.method === 'GET') return json(response, 200, await auth.listUsers());
          if (request.method === 'POST')
            return json(response, 201, await auth.createUser(await body(request), actor));
        }
        const user = path.match(/^\/api\/users\/(\d+)$/);
        if (user && request.method === 'PATCH') {
          requireAdmin(actor);
          return json(
            response,
            200,
            await auth.updateUser(Number(user[1]), await body(request), actor),
          );
        }
        if (path === '/api/audit' && request.method === 'GET') {
          requireAdmin(actor);
          return json(response, 200, await service.listAudit());
        }
        throw new AppError('La ruta no existe.', 404);
      }
      if (request.method === 'GET') {
        let filename = path === '/' ? '/index.html' : path;
        if (
          filename !== '/index.html' &&
          filename !== '/favicon.svg' &&
          !/^\/assets\/[a-zA-Z0-9_.-]+$/.test(filename)
        )
          throw new AppError('La ruta no existe.', 404);
        const dist = resolve(root, 'dist');
        const target = resolve(dist, `.${filename}`);
        if (!target.startsWith(dist + sep)) throw new AppError('La ruta no existe.', 404);
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
        };
        try {
          const contents = await readFile(target);
          response.writeHead(200, {
            'Content-Type': types[extname(target)] || 'application/octet-stream',
            'Cache-Control': filename.startsWith('/assets/')
              ? 'public,max-age=31536000,immutable'
              : 'no-cache',
          });
          return response.end(contents);
        } catch {
          throw new AppError('Ejecuta npm run build antes de abrir la interfaz.', 503);
        }
      }
      throw new AppError('La ruta no existe.', 404);
    } catch (error) {
      if (!(error instanceof AppError)) console.error('Error interno:', (error as Error).message);
      json(response, error instanceof AppError ? error.status : 500, {
        error: error instanceof AppError ? error.message : 'No se pudo completar la operación.',
      });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.DATABASE_URL ||
      !process.env.APP_ORIGIN?.startsWith('https://') ||
      process.env.DEMO_MODE !== 'false')
  )
    throw new Error('Producción requiere DATABASE_URL, APP_ORIGIN con HTTPS y DEMO_MODE=false.');
  const db = await openDatabase({
    url: process.env.DATABASE_URL,
    path: resolve(root, process.env.DATABASE_PATH || 'data/postgres'),
  });
  try {
    await bootstrap(
      db,
      process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== 'false',
      resolve(root, 'data/inventory.sqlite'),
    );
  } catch (error) {
    await db.close();
    throw error;
  }
  const server = createAppServer(db, {
    origin: process.env.APP_ORIGIN,
    secureCookies: process.env.NODE_ENV === 'production',
    demo: process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== 'false',
  });
  const port = Number(process.env.PORT || 4317);
  server.listen(port, process.env.HOST || '127.0.0.1', () =>
    console.log(`Almacén: http://127.0.0.1:${port} · ${db.kind}`),
  );
  server.on('error', async (error) => {
    console.error(error.message);
    await db.close();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      server.closeAllConnections();
      server.close(async () => {
        await db.close();
        process.exit(0);
      });
    });
}
