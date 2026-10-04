import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Product, User } from '../src/types.ts';
import { api } from './api.ts';
import { Dialog } from './Dialog.tsx';
import { filterProducts, money, number, status, exportCsv } from './utils.ts';

interface Props {
  products: Product[];
  user: User;
  refresh: (message: string) => Promise<void>;
}
export function Products({ products, user, refresh }: Props) {
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    stock: '',
    minimum: '',
    maximum: '',
    archived: false,
  });
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [movement, setMovement] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof filters, value: string | boolean) =>
    setFilters((before) => ({ ...before, [key]: value }));
  const filtered = filterProducts(products, filters);
  const categories = [...new Set(products.map((product) => product.category))].sort();
  return (
    <>
      <section className="panel" aria-labelledby="catalog-title">
        <div className="panel-heading">
          <div>
            <h2 id="catalog-title">
              Tus productos{' '}
              <span className="count">{products.filter((product) => product.active).length}</span>
            </h2>
            <p>Consulta existencias y registra cada movimiento.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button secondary"
              onClick={() =>
                exportCsv('inventario.csv', [
                  ['Código', 'Nombre', 'Categoría', 'Precio COP', 'Existencias', 'Mínimo'],
                  ...filtered.map((product) => [
                    product.sku,
                    product.name,
                    product.category,
                    product.price_cents / 100,
                    product.stock,
                    product.min_stock,
                  ]),
                ])
              }
            >
              Exportar CSV
            </button>
            {user.role === 'admin' && (
              <button className="button primary" onClick={() => setEditing('new')}>
                + Nuevo producto
              </button>
            )}
          </div>
        </div>
        <div className="toolbar">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar por nombre o código"
              type="search"
              placeholder="Buscar por nombre o código…"
              value={filters.search}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <label className="filter-label">
            <select
              aria-label="Filtrar por categoría"
              value={filters.category}
              onChange={(event) => update('category', event.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="filter-label">
            <select
              aria-label="Filtrar por existencias"
              value={filters.stock}
              onChange={(event) => update('stock', event.target.value)}
            >
              <option value="">Todas las existencias</option>
              <option value="low">Por reponer</option>
              <option value="empty">Agotados</option>
            </select>
          </label>
        </div>
        <div className="extra-filters">
          <label>
            Precio mínimo
            <input
              aria-label="Precio mínimo"
              type="number"
              min="0"
              step="0.01"
              placeholder="Sin mínimo"
              value={filters.minimum}
              onChange={(event) => update('minimum', event.target.value)}
            />
          </label>
          <label>
            Precio máximo
            <input
              aria-label="Precio máximo"
              type="number"
              min="0"
              step="0.01"
              placeholder="Sin máximo"
              value={filters.maximum}
              onChange={(event) => update('maximum', event.target.value)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={filters.archived}
              onChange={(event) => update('archived', event.target.checked)}
            />{' '}
            Ver archivados
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="numeric">Precio unitario</th>
                <th className="numeric">Unidades</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const [label, className] = status(product);
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="product-cell">
                        <span className="product-monogram" aria-hidden="true">
                          {product.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((word) => word[0])
                            .join('')
                            .toUpperCase()}
                        </span>
                        <div>
                          <strong>{product.name}</strong>
                          <small>{product.sku}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="category-tag">{product.category}</span>
                    </td>
                    <td className="numeric">{money(product.price_cents)}</td>
                    <td className="numeric">
                      <strong>{number(product.stock)}</strong>
                      <small className="stock-minimum">Mín. {number(product.min_stock)}</small>
                    </td>
                    <td>
                      <span className={`status-tag ${className}`}>{label}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {user.role === 'admin' && (
                          <button
                            className="action-button"
                            aria-label={`Editar ${product.name}`}
                            onClick={() => setEditing(product)}
                          >
                            Editar
                          </button>
                        )}
                        {product.active && (
                          <button
                            className="action-button movement"
                            aria-label={`Registrar movimiento de ${product.name}`}
                            onClick={() => setMovement(product)}
                          >
                            Movimiento
                          </button>
                        )}
                        {user.role === 'admin' && (
                          <button
                            className="action-button"
                            aria-label={`${product.active ? 'Archivar' : 'Restaurar'} ${product.name}`}
                            onClick={() => {
                              setError('');
                              setArchiving(product);
                            }}
                          >
                            {product.active ? 'Archivar' : 'Restaurar'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="empty">
                    {products.length
                      ? 'No hay productos que coincidan con tus filtros.'
                      : 'Registra tu primer producto.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="panel-footer">
          <span>
            Mostrando {filtered.length} de{' '}
            {products.filter((product) => product.active !== filters.archived).length} productos
          </span>
          <span>Los movimientos conservan el historial</span>
        </div>
      </section>
      {editing && (
        <ProductForm
          product={editing === 'new' ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh('Producto guardado.');
          }}
        />
      )}
      {movement && (
        <MovementForm
          product={movement}
          onClose={() => setMovement(null)}
          onSaved={async () => {
            setMovement(null);
            await refresh('Movimiento registrado.');
          }}
        />
      )}
      {archiving && (
        <Dialog
          title={archiving.active ? 'Archivar producto' : 'Restaurar producto'}
          locked={busy}
          onClose={() => setArchiving(null)}
        >
          <p className="dialog-description">
            {archiving.active
              ? `${archiving.name} dejará de aparecer en el catálogo activo. Sus movimientos y pedidos se conservarán.`
              : `${archiving.name} volverá a estar disponible para pedidos y movimientos.`}
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button disabled={busy} className="button secondary" onClick={() => setArchiving(null)}>
              Volver
            </button>
            <button
              disabled={busy}
              className="button primary"
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/products/${archiving.id}/active`, 'PATCH', {
                    active: !archiving.active,
                  });
                  setArchiving(null);
                  await refresh('Estado del producto actualizado.');
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product?: Product;
  categories: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const value = {
      name: data.get('name'),
      sku: data.get('sku'),
      category: data.get('category'),
      price_cents: Math.round(Number(data.get('price')) * 100),
      min_stock: Number(data.get('minimum')),
      ...(product ? {} : { initial_stock: Number(data.get('initial')) }),
    };
    try {
      await api(product ? `/products/${product.id}` : '/products', product ? 'PUT' : 'POST', value);
      await onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose} locked={busy}>
      <p className="dialog-description">Registra los datos que identifican tu producto.</p>
      <form onSubmit={submit}>
        <label>
          Nombre
          <input autoFocus name="name" required maxLength={80} defaultValue={product?.name} />
        </label>
        <div className="form-grid">
          <label>
            Código
            <input
              name="sku"
              required
              maxLength={30}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
              defaultValue={product?.sku}
            />
          </label>
          <label>
            Categoría
            <input
              name="category"
              required
              maxLength={40}
              list="categories"
              defaultValue={product?.category}
            />
            <datalist id="categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Precio unitario (COP)
            <input
              name="price"
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              required
              defaultValue={product ? product.price_cents / 100 : 0}
            />
          </label>
          <label>
            Mínimo de unidades
            <input
              name="minimum"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              defaultValue={product?.min_stock ?? 5}
            />
          </label>
        </div>
        {!product && (
          <label>
            Unidades iniciales
            <input
              name="initial"
              type="number"
              min="0"
              max="1000000"
              step="1"
              required
              defaultValue={0}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={busy} className="button primary">
            {busy ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function MovementForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/products/${product.id}/movements`, 'POST', {
        kind: data.get('kind'),
        quantity: Number(data.get('quantity')),
        note: data.get('note'),
      });
      await onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Registrar movimiento" onClose={onClose} locked={busy}>
      <p className="dialog-description">
        {product.name} · {number(product.stock)} unidades disponibles
      </p>
      <form onSubmit={submit}>
        <label>
          Tipo de movimiento
          <select name="kind">
            <option value="IN">Entrada de mercancía</option>
            <option value="OUT">Salida de mercancía</option>
          </select>
        </label>
        <label>
          Cantidad de unidades
          <input
            autoFocus
            name="quantity"
            type="number"
            min="1"
            max="1000000"
            step="1"
            required
            defaultValue={1}
          />
        </label>
        <label>
          Motivo
          <input name="note" required maxLength={160} placeholder="Compra a proveedor o venta" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button disabled={busy} className="button primary">
            {busy ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
