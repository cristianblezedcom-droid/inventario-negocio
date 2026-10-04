import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Order, Product, User } from '../src/types.ts';
import { Dialog } from './Dialog.tsx';
import { api } from './api.ts';
import { money, date, exportCsv } from './utils.ts';
export function Orders({
  orders,
  products,
  user,
  refresh,
}: {
  orders: Order[];
  products: Product[];
  user: User;
  refresh: (message: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Pedidos recientes</h2>
            <p>Cada pedido guarda su precio y descuenta las unidades.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button secondary"
              onClick={() =>
                exportCsv('pedidos.csv', [
                  ['Pedido', 'Cliente', 'Estado', 'Total COP', 'Responsable', 'Fecha'],
                  ...orders.map((order) => [
                    order.id,
                    order.customer,
                    order.status === 'confirmed' ? 'Confirmado' : 'Cancelado',
                    order.total_cents / 100,
                    order.actor_name,
                    date(order.created_at),
                  ]),
                ])
              }
            >
              Exportar pedidos
            </button>
            <button className="button primary" onClick={() => setCreating(true)}>
              + Nuevo pedido
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th className="numeric">Total</th>
                <th>Responsable</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.customer}</td>
                  <td>
                    <span
                      className={`status-tag ${order.status === 'confirmed' ? 'status-ok' : 'status-empty'}`}
                    >
                      {order.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
                    </span>
                  </td>
                  <td className="numeric">{money(order.total_cents)}</td>
                  <td>{order.actor_name}</td>
                  <td>{date(order.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="action-button"
                        onClick={async () => {
                          try {
                            setDetail(await api<Order>(`/orders/${order.id}`));
                          } catch (error) {
                            setError((error as Error).message);
                          }
                        }}
                      >
                        Ver pedido #{order.id}
                      </button>
                      {user.role === 'admin' && order.status === 'confirmed' && (
                        <button
                          className="action-button"
                          onClick={() => {
                            setError('');
                            setCancelling(order);
                          }}
                        >
                          Cancelar pedido #{order.id}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!orders.length && (
                <tr>
                  <td className="empty" colSpan={7}>
                    Todavía no hay pedidos. Registra el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel-footer">Se muestran hasta 200 pedidos recientes</div>
      </section>
      {creating && (
        <OrderForm
          products={products.filter((product) => product.active && product.stock > 0)}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await refresh('Pedido confirmado. Existencias actualizadas.');
          }}
        />
      )}
      {detail && (
        <Dialog title={`Pedido #${detail.id}`} onClose={() => setDetail(null)}>
          <p className="dialog-description">
            {detail.customer} · {date(detail.created_at)}
          </p>
          <div className="order-lines">
            {detail.lines?.map((line) => (
              <div className="order-line" key={line.product_id}>
                <div>
                  <strong>{line.name}</strong>
                  <small>
                    {line.sku} · {line.quantity} × {money(line.price_cents)}
                  </small>
                </div>
                <strong>{money(line.quantity * line.price_cents)}</strong>
              </div>
            ))}
          </div>
          <p className="order-total">
            Total <strong>{money(detail.total_cents)}</strong>
          </p>
          {detail.note && <p>{detail.note}</p>}
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setDetail(null)}>
              Cerrar detalle
            </button>
          </div>
        </Dialog>
      )}
      {cancelling && (
        <Dialog
          title={`Cancelar pedido #${cancelling.id}`}
          locked={busy}
          onClose={() => setCancelling(null)}
        >
          <p className="dialog-description">
            Se devolverán las unidades al inventario y se conservará el pedido con estado cancelado.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              disabled={busy}
              className="button secondary"
              onClick={() => setCancelling(null)}
            >
              Volver
            </button>
            <button
              disabled={busy}
              className="button danger"
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/orders/${cancelling.id}/cancel`, 'POST', {});
                  setCancelling(null);
                  await refresh('Pedido cancelado. Unidades devueltas al inventario.');
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Cancelando…' : 'Confirmar cancelación'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function OrderForm({
  products,
  onClose,
  onSaved,
}: {
  products: Product[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [lines, setLines] = useState<{ product_id: number; quantity: number }[]>([]);
  const [selected, setSelected] = useState(String(products[0]?.id ?? ''));
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const total = lines.reduce(
    (sum, line) =>
      sum + products.find((product) => product.id === line.product_id)!.price_cents * line.quantity,
    0,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) {
      setError('Añade al menos un producto.');
      return;
    }
    const data = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await api(
        '/orders',
        'POST',
        { customer: data.get('customer'), note: data.get('note'), lines },
        key,
      );
      await onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function add() {
    const product = products.find((product) => product.id === Number(selected));
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1) {
      setError('Elige un producto y una cantidad válida.');
      return;
    }
    const existing = lines.find((line) => line.product_id === product.id);
    if ((existing?.quantity ?? 0) + quantity > product.stock) {
      setError(`Solo hay ${product.stock} unidades de ${product.name}.`);
      return;
    }
    setError('');
    setLines((before) =>
      existing
        ? before.map((line) =>
            line.product_id === product.id ? { ...line, quantity: line.quantity + quantity } : line,
          )
        : [...before, { product_id: product.id, quantity }],
    );
  }
  return (
    <Dialog title="Nuevo pedido" onClose={onClose} locked={busy}>
      <p className="dialog-description">Los precios se guardan al confirmar el pedido.</p>
      <form onSubmit={submit}>
        <label>
          Cliente
          <input
            autoFocus
            name="customer"
            required
            maxLength={100}
            placeholder="Nombre del cliente"
          />
        </label>
        <label>
          Nota del pedido
          <input name="note" maxLength={160} placeholder="Opcional" />
        </label>
        <div className="form-grid">
          <label>
            Producto del pedido
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.stock} disponibles)
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidades del pedido
            <input
              type="number"
              min="1"
              max="1000000"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={!products.length || busy}
          onClick={add}
        >
          Añadir al pedido
        </button>
        {!products.length && (
          <p className="form-error">No hay productos activos con existencias.</p>
        )}
        <div className="order-lines">
          {lines.map((line) => {
            const product = products.find((product) => product.id === line.product_id)!;
            return (
              <div className="order-line" key={line.product_id}>
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {line.quantity} × {money(product.price_cents)}
                  </small>
                </div>
                <div>
                  <strong>{money(product.price_cents * line.quantity)}</strong>
                  <button
                    type="button"
                    disabled={busy}
                    className="close-button"
                    aria-label={`Quitar ${product.name} del pedido`}
                    onClick={() =>
                      setLines((before) =>
                        before.filter((item) => item.product_id !== line.product_id),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="order-total">
          Total <strong>{money(total)}</strong>
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={busy || !lines.length} className="button primary">
            {busy ? 'Confirmando…' : 'Confirmar pedido'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
