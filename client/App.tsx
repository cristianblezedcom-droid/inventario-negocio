import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Product, Movement, Order, Report } from '../src/types.ts';
import { api, setCsrf } from './api.ts';
import type { Session } from './api.ts';
import { Products } from './Products.tsx';
import { Orders } from './Orders.tsx';
import { Users, AuditLog } from './Admin.tsx';
import { Reports } from './Reports.tsx';
import { money, number, date, exportCsv } from './utils.ts';

type View = 'inventory' | 'orders' | 'movements' | 'reports' | 'users' | 'audit';
const titles: Record<View, string> = {
  inventory: 'Inventario',
  orders: 'Pedidos',
  movements: 'Movimientos',
  reports: 'Reportes',
  users: 'Usuarios',
  audit: 'Actividad',
};
const descriptions: Record<View, string> = {
  inventory: 'Cada producto, cada unidad, en su lugar.',
  orders: 'Del pedido al inventario, con cada cambio registrado.',
  movements: 'Un historial claro de lo que entra y lo que sale.',
  reports: 'Las cifras que te ayudan a decidir qué reponer.',
  users: 'El acceso adecuado para cada persona.',
  audit: 'Las operaciones del negocio y sus responsables.',
};

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(true);
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<View>('inventory');
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  function accept(value: Session) {
    setCsrf(value.csrf);
    setSession(value);
    setView('inventory');
    setNotice('');
  }
  useEffect(() => {
    let active = true;
    api<{ demo: boolean }>('/config')
      .then((value) => {
        if (active) setDemo(value.demo);
      })
      .catch(() => {});
    api<Session>('/auth/me')
      .then((value) => {
        if (active) accept(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setStarting(false);
      });
    const expired = () => {
      setSession(null);
      setCsrf('');
    };
    window.addEventListener('session-expired', expired);
    return () => {
      active = false;
      window.removeEventListener('session-expired', expired);
    };
  }, []);
  async function load() {
    const [products, movements, orders, report] = await Promise.all([
      api<Product[]>('/products'),
      api<Movement[]>('/movements'),
      api<Order[]>('/orders'),
      api<Report>('/report'),
    ]);
    setProducts(products);
    setMovements(movements);
    setOrders(orders);
    setReport(report);
  }
  useEffect(() => {
    if (session)
      load().catch((error) => {
        setNotice(error.message);
        setFailed(true);
      });
  }, [session]);
  async function refresh(message: string) {
    setNotice(message);
    setFailed(false);
    try {
      await load();
    } catch {
      setNotice(`${message} No se pudo actualizar la pantalla. Pulsa Actualizar.`);
      setFailed(true);
    }
  }
  if (starting) return <div className="loading-screen">Cargando Almacén…</div>;
  if (!session) return <Login demo={demo} onLogin={accept} />;
  const admin = session.user.role === 'admin';
  const views: View[] = admin
    ? ['inventory', 'orders', 'movements', 'reports', 'users', 'audit']
    : ['inventory', 'orders', 'movements', 'reports'];
  const symbols: Record<View, string> = {
    inventory: '▦',
    orders: '▤',
    movements: '◷',
    reports: '▥',
    users: '♙',
    audit: '☷',
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Almacén, inicio">
          <img src="/favicon.svg" alt="" width={38} height={38} />
          Almacén<span>01</span>
        </a>
        <p className="nav-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Navegación principal">
          {views.map((item) => (
            <button
              key={item}
              className={`nav-button ${view === item ? 'active' : ''}`}
              aria-current={view === item ? 'page' : undefined}
              onClick={() => setView(item)}
            >
              <span aria-hidden="true">{symbols[item]}</span>
              {titles[item]}
            </button>
          ))}
        </nav>
        <div className="workspace">
          <span className="workspace-icon" aria-hidden="true">
            {session.user.name[0]}
          </span>
          <div>
            <strong>{session.user.name}</strong>
            <small>{admin ? 'Administrador' : 'Operador'}</small>
          </div>
        </div>
      </aside>
      <div className="page">
        <header className="topbar">
          <span>
            Mi negocio <span className="separator">/</span>
            <strong>{titles[view]}</strong>
          </span>
          <div className="topbar-actions">
            {demo && <span className="demo-label">Demostración</span>}
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await api('/auth/logout', 'POST', {});
                  setSession(null);
                  setCsrf('');
                  setReport(null);
                } catch (error) {
                  setNotice((error as Error).message);
                  setFailed(true);
                }
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">CONTROL DEL NEGOCIO</p>
              <h1>{titles[view]}</h1>
              <p>{descriptions[view]}</p>
            </div>
            <button className="button secondary" onClick={() => refresh('Datos actualizados.')}>
              Actualizar
            </button>
          </div>
          {notice && (
            <div className={`notice ${failed ? 'error' : ''}`} role="status">
              {notice}
            </div>
          )}
          {report && (
            <section className="stats" aria-label="Resumen del inventario">
              <article className="stat">
                <span>Productos</span>
                <strong>{number(report.products)}</strong>
                <small>Referencias activas</small>
              </article>
              <article className="stat">
                <span>Unidades disponibles</span>
                <strong>{number(report.units)}</strong>
                <small>Existencias totales</small>
              </article>
              <article className="stat">
                <span>Valor del inventario</span>
                <strong>{money(report.value_cents)}</strong>
                <small>A precio de venta · COP</small>
              </article>
              <article className="stat warning-stat">
                <span>Por reponer</span>
                <strong>{number(report.low_stock)}</strong>
                <small>En el mínimo o por debajo</small>
              </article>
            </section>
          )}
          {!report ? (
            <section className="panel">
              <p className="empty">
                {failed
                  ? 'No se pudieron cargar los datos. Pulsa Actualizar para reintentar.'
                  : 'Cargando el negocio…'}
              </p>
            </section>
          ) : (
            <>
              {view === 'inventory' && (
                <Products products={products} user={session.user} refresh={refresh} />
              )}{' '}
              {view === 'orders' && (
                <Orders orders={orders} products={products} user={session.user} refresh={refresh} />
              )}{' '}
              {view === 'reports' && <Reports report={report} />}{' '}
              {view === 'users' && admin && <Users current={session.user} />}{' '}
              {view === 'audit' && admin && <AuditLog />}{' '}
              {view === 'movements' && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Historial de movimientos</h2>
                      <p>Últimos 500 movimientos con fecha, motivo y responsable.</p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() =>
                        exportCsv('movimientos.csv', [
                          [
                            'Producto',
                            'Código',
                            'Tipo',
                            'Cantidad',
                            'Motivo',
                            'Responsable',
                            'Fecha',
                          ],
                          ...movements.map((m) => [
                            m.product_name,
                            m.sku,
                            m.kind === 'IN' ? 'Entrada' : 'Salida',
                            m.quantity,
                            m.note,
                            m.actor_name ?? 'Sistema',
                            date(m.created_at),
                          ]),
                        ])
                      }
                    >
                      Exportar movimientos
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Tipo</th>
                          <th className="numeric">Unidades</th>
                          <th>Motivo</th>
                          <th>Responsable</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements.map((m) => (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.product_name}</strong>
                              <small className="stock-minimum">{m.sku}</small>
                            </td>
                            <td>
                              <span
                                className={`status-tag ${m.kind === 'IN' ? 'status-ok' : 'status-low'}`}
                              >
                                {m.kind === 'IN' ? 'Entrada' : 'Salida'}
                              </span>
                            </td>
                            <td className="numeric">{number(m.quantity)}</td>
                            <td>{m.note}</td>
                            <td>{m.actor_name ?? 'Sistema'}</td>
                            <td>{date(m.created_at)}</td>
                          </tr>
                        ))}
                        {!movements.length && (
                          <tr>
                            <td colSpan={6} className="empty">
                              Todavía no hay movimientos.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Almacén · Inventario y pedidos</span>
            <span>Moneda: COP</span>
          </footer>
        </main>
      </div>
    </>
  );
}
function Login({ demo, onLogin }: { demo: boolean; onLogin: (session: Session) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(email: string, password: string) {
    setBusy(true);
    setError('');
    try {
      onLogin(await api<Session>('/auth/login', 'POST', { email, password }));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void login(String(data.get('email')), String(data.get('password')));
  }
  return (
    <div className="login-layout">
      <section className="login-intro">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={44} height={44} />
          Almacén
        </div>
        <div>
          <p className="eyebrow">TU NEGOCIO, EN ORDEN</p>
          <h1>
            Conoce lo que tienes.
            <br />
            Registra lo que vendes.
          </h1>
          <p>Productos, pedidos y movimientos en un solo lugar.</p>
          <div className="login-feature">
            01 <span>Inventario con historial</span>
          </div>
          <div className="login-feature">
            02 <span>Pedidos y reportes de ventas</span>
          </div>
          <div className="login-feature">
            03 <span>Acceso según tu responsabilidad</span>
          </div>
        </div>
        <small>Almacén · Gestión de productos generales</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow">BIENVENIDO</p>
          <h2>Inicia sesión</h2>
          <p>Accede a tu espacio de trabajo.</p>
          <form onSubmit={submit}>
            <label>
              Correo
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="tu@negocio.com"
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button primary login-submit">
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          {demo && (
            <div className="demo-accounts">
              <strong>Explora la demostración</strong>
              <p>Las cuentas de ejemplo permiten probar los dos roles.</p>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() => login('admin@almacen.local', 'AprendeInventario2026!')}
              >
                Entrar como administrador demo
              </button>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() => login('operador@almacen.local', 'AprendeInventario2026!')}
              >
                Entrar como operador demo
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
