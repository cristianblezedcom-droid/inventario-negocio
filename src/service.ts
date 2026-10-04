import { createHash } from 'node:crypto';
import type { Database, Queryable } from './database.ts';
import type { User, Product, Movement, Order, OrderLine, Report } from './types.ts';
import { AppError, object, text, integer } from './errors.ts';

function productValues(value: unknown) {
  const input = object(value);
  const sku = text(input.sku, 'Código', 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(sku))
    throw new AppError('El código admite letras, números, guiones y guiones bajos.');
  return {
    sku,
    name: text(input.name, 'Nombre'),
    category: text(input.category, 'Categoría', 40),
    price_cents: integer(input.price_cents, 'Precio en centavos', 0, 1_000_000_000),
    min_stock: integer(input.min_stock, 'Existencias mínimas'),
  };
}
async function audit(
  tx: Queryable,
  actor: User,
  action: string,
  entity: string,
  id: number,
  details: unknown = {},
) {
  await tx.query(
    'INSERT INTO audit_log (actor_id,action,entity,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
    [actor.id, action, entity, id, JSON.stringify(details)],
  );
}
async function getProduct(tx: Queryable, id: number, lock = false): Promise<Product> {
  integer(id, 'Identificador', 1);
  const product = (
    await tx.query<Product>(`SELECT * FROM products WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])
  ).rows[0];
  if (!product) throw new AppError('El producto no existe.', 404);
  return product;
}
export function createService(db: Database) {
  async function orderDetail(tx: Queryable, id: number): Promise<Order> {
    const order = (
      await tx.query<Order>(
        `SELECT o.*,u.name AS actor_name FROM orders o JOIN users u ON u.id=o.actor_id WHERE o.id=$1`,
        [id],
      )
    ).rows[0];
    if (!order) throw new AppError('El pedido no existe.', 404);
    order.total_cents = Number(order.total_cents);
    order.lines = (
      await tx.query<OrderLine>(
        'SELECT product_id,sku,name,quantity,price_cents FROM order_lines WHERE order_id=$1 ORDER BY id',
        [id],
      )
    ).rows;
    return order;
  }
  return {
    listProducts: async () =>
      (await db.query<Product>('SELECT * FROM products ORDER BY name,id')).rows,
    async createProduct(value: unknown, actor: User) {
      const values = productValues(value);
      const stock = integer(object(value).initial_stock ?? 0, 'Existencias iniciales');
      return db.transaction(async (tx) => {
        const product = (
          await tx.query<Product>(
            'INSERT INTO products (sku,name,category,price_cents,min_stock,stock) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [values.sku, values.name, values.category, values.price_cents, values.min_stock, stock],
          )
        ).rows[0];
        if (stock)
          await tx.query(
            'INSERT INTO movements (product_id,kind,quantity,note,actor_id) VALUES ($1,$2,$3,$4,$5)',
            [product.id, 'IN', stock, 'Existencias iniciales', actor.id],
          );
        await audit(tx, actor, 'create', 'product', product.id, values);
        return product;
      });
    },
    async updateProduct(id: number, value: unknown, actor: User) {
      const values = productValues(value);
      return db.transaction(async (tx) => {
        const before = await getProduct(tx, id, true);
        const product = (
          await tx.query<Product>(
            'UPDATE products SET sku=$2,name=$3,category=$4,price_cents=$5,min_stock=$6 WHERE id=$1 RETURNING *',
            [id, values.sku, values.name, values.category, values.price_cents, values.min_stock],
          )
        ).rows[0];
        await audit(tx, actor, 'update', 'product', id, {
          before: {
            sku: before.sku,
            name: before.name,
            category: before.category,
            price_cents: before.price_cents,
            min_stock: before.min_stock,
          },
          after: values,
        });
        return product;
      });
    },
    async setProductActive(id: number, active: unknown, actor: User) {
      if (typeof active !== 'boolean') throw new AppError('El estado no es válido.');
      return db.transaction(async (tx) => {
        await getProduct(tx, id, true);
        const product = (
          await tx.query<Product>('UPDATE products SET active=$2 WHERE id=$1 RETURNING *', [
            id,
            active,
          ])
        ).rows[0];
        await audit(tx, actor, active ? 'restore' : 'archive', 'product', id);
        return product;
      });
    },
    async recordMovement(id: number, value: unknown, actor: User) {
      const input = object(value);
      if (!['IN', 'OUT'].includes(input.kind as string))
        throw new AppError('Elige una entrada o una salida.');
      const quantity = integer(input.quantity, 'Cantidad', 1);
      const note = text(input.note, 'Motivo', 160);
      return db.transaction(async (tx) => {
        const product = await getProduct(tx, id, true);
        if (!product.active)
          throw new AppError('Restaura el producto antes de registrar movimientos.', 409);
        const change = input.kind === 'IN' ? quantity : -quantity;
        if (product.stock + change < 0)
          throw new AppError(`Solo hay ${product.stock} unidades disponibles.`, 409);
        if (product.stock + change > 1_000_000)
          throw new AppError('Se supera el máximo de existencias.', 409);
        await tx.query('UPDATE products SET stock=stock+$2 WHERE id=$1', [id, change]);
        await tx.query(
          'INSERT INTO movements (product_id,kind,quantity,note,actor_id) VALUES ($1,$2,$3,$4,$5)',
          [id, input.kind, quantity, note, actor.id],
        );
        await audit(tx, actor, 'movement', 'product', id, { kind: input.kind, quantity, note });
        return getProduct(tx, id);
      });
    },
    listMovements: async () =>
      (
        await db.query<Movement>(
          `SELECT m.*,p.name AS product_name,p.sku,u.name AS actor_name FROM movements m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.actor_id ORDER BY m.id DESC LIMIT 500`,
        )
      ).rows,
    async createOrder(value: unknown, key: string, actor: User): Promise<Order> {
      const input = object(value);
      const customer = text(input.customer, 'Cliente', 100);
      const note = typeof input.note === 'string' ? input.note.trim() : '';
      if (note.length > 160) throw new AppError('La nota admite hasta 160 caracteres.');
      if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 50)
        throw new AppError('Un pedido necesita entre 1 y 50 productos.');
      const lines = input.lines
        .map((value) => {
          const line = object(value);
          return {
            product_id: integer(line.product_id, 'Producto', 1),
            quantity: integer(line.quantity, 'Cantidad', 1),
          };
        })
        .sort((a, b) => a.product_id - b.product_id);
      if (new Set(lines.map((line) => line.product_id)).size !== lines.length)
        throw new AppError('Agrupa las unidades de cada producto en una sola línea.');
      if (!/^[A-Za-z0-9_-]{16,80}$/.test(key))
        throw new AppError('El pedido necesita una clave de idempotencia válida.');
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ customer, note, lines }))
        .digest('hex');
      return db.transaction(async (tx) => {
        // Serializa pedidos del mismo usuario para deduplicar reintentos sin carreras.
        await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
        const existing = (
          await tx.query<{ request_hash: string; order_id: number }>(
            'SELECT * FROM idempotency_keys WHERE user_id=$1 AND key=$2',
            [actor.id, key],
          )
        ).rows[0];
        if (existing) {
          if (existing.request_hash !== requestHash)
            throw new AppError('Esta clave ya se usó para un pedido distinto.', 409);
          return orderDetail(tx, existing.order_id);
        }
        const snapshots: OrderLine[] = [];
        let total = 0;
        // Se bloquean productos en orden de id para evitar interbloqueos.
        for (const line of lines) {
          const product = await getProduct(tx, line.product_id, true);
          if (!product.active) throw new AppError(`${product.name} está archivado.`, 409);
          if (product.stock < line.quantity)
            throw new AppError(`${product.name}: solo hay ${product.stock} unidades.`, 409);
          total += product.price_cents * line.quantity;
          snapshots.push({
            ...line,
            sku: product.sku,
            name: product.name,
            price_cents: product.price_cents,
          });
        }
        if (!Number.isSafeInteger(total) || total > 100_000_000_000_000)
          throw new AppError('El total del pedido supera el límite permitido.');
        const order = (
          await tx.query<{ id: number }>(
            'INSERT INTO orders (customer,note,total_cents,actor_id) VALUES ($1,$2,$3,$4) RETURNING id',
            [customer, note, total, actor.id],
          )
        ).rows[0];
        for (const line of snapshots) {
          await tx.query(
            'INSERT INTO order_lines (order_id,product_id,sku,name,quantity,price_cents) VALUES ($1,$2,$3,$4,$5,$6)',
            [order.id, line.product_id, line.sku, line.name, line.quantity, line.price_cents],
          );
          await tx.query('UPDATE products SET stock=stock-$2 WHERE id=$1', [
            line.product_id,
            line.quantity,
          ]);
          await tx.query(
            'INSERT INTO movements (product_id,kind,quantity,note,actor_id,order_id) VALUES ($1,$2,$3,$4,$5,$6)',
            [line.product_id, 'OUT', line.quantity, `Pedido #${order.id}`, actor.id, order.id],
          );
        }
        await tx.query(
          'INSERT INTO idempotency_keys (user_id,key,request_hash,order_id) VALUES ($1,$2,$3,$4)',
          [actor.id, key, requestHash, order.id],
        );
        await audit(tx, actor, 'create', 'order', order.id, { customer, total_cents: total });
        return orderDetail(tx, order.id);
      });
    },
    async cancelOrder(id: number, actor: User) {
      integer(id, 'Pedido', 1);
      return db.transaction(async (tx) => {
        const order = (await tx.query<Order>('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id]))
          .rows[0];
        if (!order) throw new AppError('El pedido no existe.', 404);
        if (order.status === 'cancelled') throw new AppError('El pedido ya está cancelado.', 409);
        const lines = (
          await tx.query<OrderLine>(
            'SELECT * FROM order_lines WHERE order_id=$1 ORDER BY product_id',
            [id],
          )
        ).rows;
        for (const line of lines) {
          const product = await getProduct(tx, line.product_id, true);
          if (product.stock + line.quantity > 1_000_000)
            throw new AppError(
              `No se pueden devolver las unidades de ${line.name}: se supera el máximo.`,
              409,
            );
          await tx.query('UPDATE products SET stock=stock+$2 WHERE id=$1', [
            line.product_id,
            line.quantity,
          ]);
          await tx.query(
            'INSERT INTO movements (product_id,kind,quantity,note,actor_id,order_id) VALUES ($1,$2,$3,$4,$5,$6)',
            [line.product_id, 'IN', line.quantity, `Cancelación pedido #${id}`, actor.id, id],
          );
        }
        await tx.query(
          "UPDATE orders SET status='cancelled',cancelled_at=NOW(),cancelled_by=$2 WHERE id=$1",
          [id, actor.id],
        );
        await audit(tx, actor, 'cancel', 'order', id);
        return orderDetail(tx, id);
      });
    },
    async listOrders() {
      const rows = (
        await db.query<Order>(
          'SELECT o.*,u.name AS actor_name FROM orders o JOIN users u ON u.id=o.actor_id ORDER BY o.id DESC LIMIT 200',
        )
      ).rows;
      return rows.map((order) => ({ ...order, total_cents: Number(order.total_cents) }));
    },
    getOrder: (id: number) => orderDetail(db, integer(id, 'Pedido', 1)),
    async report(): Promise<Report> {
      const [inventory, sales, categories, daily, top] = await Promise.all([
        db.query<{ products: number; units: string; value_cents: string; low_stock: number }>(
          `SELECT COUNT(*)::int AS products,COALESCE(SUM(stock),0)::text AS units,COALESCE(SUM(stock::bigint*price_cents),0)::text AS value_cents,COUNT(*) FILTER(WHERE stock<=min_stock)::int AS low_stock FROM products WHERE active=TRUE`,
        ),
        db.query<{ orders: number; revenue_cents: string }>(
          "SELECT COUNT(*)::int AS orders,COALESCE(SUM(total_cents),0)::text AS revenue_cents FROM orders WHERE status='confirmed'",
        ),
        db.query<{ category: string; units: string; value_cents: string }>(
          'SELECT category,SUM(stock)::text AS units,SUM(stock::bigint*price_cents)::text AS value_cents FROM products WHERE active=TRUE GROUP BY category ORDER BY category',
        ),
        db.query<{ day: string; total_cents: string; orders: number }>(
          "SELECT (created_at AT TIME ZONE 'UTC')::date::text AS day,SUM(total_cents)::text AS total_cents,COUNT(*)::int AS orders FROM orders WHERE status='confirmed' AND created_at>NOW()-INTERVAL '30 days' GROUP BY day ORDER BY day",
        ),
        db.query<{ name: string; quantity: string; total_cents: string }>(
          "SELECT l.name,SUM(l.quantity)::text AS quantity,SUM(l.quantity::bigint*l.price_cents)::text AS total_cents FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.status='confirmed' GROUP BY l.product_id,l.name ORDER BY SUM(l.quantity) DESC LIMIT 5",
        ),
      ]);
      return {
        ...inventory.rows[0],
        ...sales.rows[0],
        units: Number(inventory.rows[0].units),
        value_cents: Number(inventory.rows[0].value_cents),
        revenue_cents: Number(sales.rows[0].revenue_cents),
        categories: categories.rows.map((row) => ({
          ...row,
          units: Number(row.units),
          value_cents: Number(row.value_cents),
        })),
        daily_sales: daily.rows.map((row) => ({ ...row, total_cents: Number(row.total_cents) })),
        top_products: top.rows.map((row) => ({
          ...row,
          quantity: Number(row.quantity),
          total_cents: Number(row.total_cents),
        })),
      };
    },
    listAudit: async () =>
      (
        await db.query(
          'SELECT a.*,u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200',
        )
      ).rows,
  };
}
