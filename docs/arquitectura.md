# Arquitectura y decisiones

## Capas

La interfaz React representa productos, pedidos, reportes y usuarios. `client/api.ts` centraliza las peticiones. `src/server.ts` valida la sesión, origen, token CSRF y permisos antes de llamar a la lógica de negocio. `src/service.ts` conserva reglas y transacciones. `src/database.ts` selecciona PostgreSQL externo o PGlite y aplica migraciones.

## Modelo de datos

- `users`: nombre, correo único, hash de contraseña, rol y estado.
- `sessions`: hash del token, usuario, token CSRF y expiración.
- `products`: código único, categoría, precio en centavos, existencias, mínimo y estado.
- `orders`: cliente, total, estado y responsable.
- `order_lines`: cantidades y datos históricos del producto vendido.
- `movements`: entradas/salidas, motivo, responsable y pedido asociado.
- `idempotency_keys`: clave por usuario, huella de petición y pedido resultante.
- `audit_log`: acciones y cambios relevantes con responsable.
- `schema_migrations`: versiones de esquema aplicadas.

## Crear un pedido

1. La interfaz prepara un borrador y una clave única.
2. El servidor exige sesión y token CSRF.
3. Valida el cliente, las líneas, cantidades y clave.
4. Dentro de una transacción, bloquea el usuario y busca un reintento existente.
5. Bloquea productos por orden de identificador y verifica estado y unidades.
6. Calcula precios en el servidor y guarda el pedido y las líneas.
7. Descuenta unidades, registra movimientos y guarda clave y auditoría.
8. Confirma todo; un fallo revierte todos los cambios.

Una repetición con la misma clave y contenido devuelve el pedido creado. Cambiar el contenido manteniendo la clave genera un conflicto. El bloqueo por usuario simplifica la deduplicación de reintentos; una aplicación de mayor volumen podría usar coordinación más específica por clave.

## Cancelar

Bloquea el pedido, comprueba que siga confirmado, bloquea sus productos y devuelve las unidades. Registra entradas, cambia el estado y guarda auditoría en la misma transacción. Dos cancelaciones no devuelven unidades dos veces.

## Autenticación y autorización

Las contraseñas se derivan mediante scrypt con sal aleatoria. Se compara el hash en tiempo constante. Los tokens de sesión son aleatorios y se guarda su hash. Las cookies son HttpOnly y SameSite=Strict; en producción también Secure. Las escrituras autenticadas necesitan un token CSRF, además de la cookie.

La interfaz oculta controles según el rol y el servidor verifica la autorización de cada ruta. Los cambios de rol, estado o contraseña eliminan las sesiones existentes. Una regla transaccional impide retirar al último administrador activo.

## Datos y límites

Precios individuales hasta 1 000 000 000 centavos, existencias hasta 1 000 000 unidades y pedidos de hasta 50 productos distintos. El total de un pedido debe ser un entero seguro y estar por debajo del límite definido. La información se guarda en PostgreSQL; los reportes convierten agregados a números para mostrarlos en la demo.

PGlite ejecuta PostgreSQL dentro del proceso y serializa transacciones en su única conexión. El adaptador `pg` utiliza un pool y transacciones por conexión en el servidor externo. GitHub Actions tiene un trabajo separado con PostgreSQL 17 para verificar ese adaptador y la concurrencia del motor externo.

## Lecturas oficiales

- [React: aprender](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [PGlite](https://pglite.dev/docs/)
- [PostgreSQL: bloqueos explícitos](https://www.postgresql.org/docs/current/explicit-locking.html)
- [node-postgres: transacciones](https://node-postgres.com/features/transactions)
