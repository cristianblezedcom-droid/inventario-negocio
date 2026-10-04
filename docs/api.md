# API

Base local: `http://127.0.0.1:4317/api`. Cuerpos JSON con `Content-Type: application/json`. Errores: `{ "error": "mensaje" }`.

| Método    | Ruta                      | Acceso                                     |
| --------- | ------------------------- | ------------------------------------------ |
| GET       | `/health`                 | Público                                    |
| GET       | `/config`                 | Público, indica si la demo está habilitada |
| POST      | `/auth/login`             | Público con límite de intentos             |
| GET       | `/auth/me`                | Sesión                                     |
| POST      | `/auth/logout`            | Sesión + CSRF                              |
| GET       | `/products`               | Ambos roles                                |
| POST      | `/products`               | Administrador                              |
| PUT       | `/products/:id`           | Administrador                              |
| PATCH     | `/products/:id/active`    | Administrador                              |
| POST      | `/products/:id/movements` | Ambos roles                                |
| GET       | `/movements`              | Ambos roles, últimos 500                   |
| GET       | `/orders`                 | Ambos roles, últimos 200                   |
| POST      | `/orders`                 | Ambos roles, clave de idempotencia         |
| GET       | `/orders/:id`             | Ambos roles                                |
| POST      | `/orders/:id/cancel`      | Administrador                              |
| GET       | `/report`                 | Ambos roles                                |
| GET, POST | `/users`                  | Administrador                              |
| PATCH     | `/users/:id`              | Administrador                              |
| GET       | `/audit`                  | Administrador, últimas 200 operaciones     |

## Sesión

Envía `{ "email": "admin@almacen.local", "password": "AprendeInventario2026!" }` al login de la demo. Devuelve `{ "user": {...}, "csrf": "..." }` y establece la cookie HttpOnly `session`.

Cada escritura autenticada requiere la cookie y el encabezado `X-CSRF-Token` del login o de `/auth/me`. Las credenciales anteriores son públicas de demostración.

## Producto

```json
{
  "sku": "PRA-001",
  "name": "Libreta de práctica",
  "category": "Papelería",
  "price_cents": 500000,
  "min_stock": 2,
  "initial_stock": 5
}
```

`price_cents` es un entero en centavos. Editar conserva las existencias. Para archivar o restaurar, envía `{ "active": false }` o `{ "active": true }` a `/products/:id/active`.

## Movimiento

```json
{ "kind": "OUT", "quantity": 2, "note": "Venta de práctica" }
```

`kind` es `IN` o `OUT`; cantidad entera positiva y motivo obligatorio. Devuelve el producto actualizado.

## Pedido

```json
{
  "customer": "Cliente de ejemplo",
  "note": "Retiro en tienda",
  "lines": [{ "product_id": 1, "quantity": 2 }]
}
```

Envía `Idempotency-Key` con una clave de 16–80 caracteres (letras, números, guiones o guiones bajos). Un UUID es válido. La clave debe ser nueva para un pedido diferente. El servidor calcula el precio y total, y guarda las líneas históricas. Una repetición idéntica devuelve el mismo pedido.

La cancelación recibe `{}` y devuelve el pedido con estado `cancelled`. Las cancelaciones repetidas se rechazan sin devolver unidades de nuevo.

## Usuario

Crear: `{ "name": "Empleado", "email": "empleado@example.com", "password": "CONTRASENA-DE-12-O-MAS-CARACTERES", "role": "operator" }`.

Editar: `{ "role": "operator", "active": true, "password": "" }`. La contraseña vacía conserva la actual. Una contraseña nueva debe tener 12–128 caracteres. Cambios de permisos, estado o contraseña invalidan sesiones.

## Respuestas

`200` consulta/cambio correcto; `201` creación; `400` datos inválidos; `401` sin sesión; `403` permisos/origen/CSRF; `404` registro inexistente; `409` código duplicado, existencias, reintento incompatible o cancelación repetida; `413` cuerpo superior a 32 KiB; `415` contenido incompatible; `429` límite de login; `500` error interno.
