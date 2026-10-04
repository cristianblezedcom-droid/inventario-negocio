CREATE TABLE users (
  id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','operator')),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);
CREATE TABLE products (
  id SERIAL PRIMARY KEY, sku VARCHAR(30) NOT NULL UNIQUE, name VARCHAR(80) NOT NULL,
  category VARCHAR(40) NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 0 AND 1000000000),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 1000000),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK(min_stock BETWEEN 0 AND 1000000),
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY, customer VARCHAR(100) NOT NULL, note VARCHAR(160) NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
  total_cents BIGINT NOT NULL CHECK(total_cents >= 0), actor_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), cancelled_at TIMESTAMPTZ, cancelled_by INTEGER REFERENCES users(id)
);
CREATE TABLE order_lines (
  id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
  sku VARCHAR(30) NOT NULL, name VARCHAR(80) NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0), UNIQUE(order_id, product_id)
);
CREATE TABLE movements (
  id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
  kind TEXT NOT NULL CHECK(kind IN ('IN','OUT')), quantity INTEGER NOT NULL CHECK(quantity > 0),
  note VARCHAR(160) NOT NULL, actor_id INTEGER REFERENCES users(id), order_id INTEGER REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX movements_product_id ON movements(product_id);
CREATE INDEX orders_created_at ON orders(created_at);
CREATE INDEX order_lines_product_id ON order_lines(product_id);
CREATE TABLE idempotency_keys (
  user_id INTEGER NOT NULL REFERENCES users(id), key VARCHAR(80) NOT NULL,
  request_hash TEXT NOT NULL, order_id INTEGER NOT NULL REFERENCES orders(id),
  PRIMARY KEY(user_id, key)
);
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL,
  entity TEXT NOT NULL, entity_id INTEGER NOT NULL, details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
