# Ejecutar y desplegar

## Demo local

```powershell
npm ci
npm run build
npm start
```

Abre `http://127.0.0.1:4317`. Sin `DATABASE_URL`, usa PostgreSQL integrado mediante PGlite y guarda datos en `data/postgres`. Es una instancia de una sola conexión y un solo proceso, adecuada para esta demo local.

## Servidor PostgreSQL

Copia `.env.example` a `.env`, elige `POSTGRES_PASSWORD`, inicia `docker compose up -d postgres` y configura `DATABASE_URL` con el usuario, contraseña, host y base de datos de ese servidor. Arranca con `npm start`: el mismo esquema y consultas se usan en ambos motores. La migración crea tablas nuevas una sola vez.

Las pruebas de integración pueden apuntar a una **base exclusiva para pruebas**:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://USUARIO:CLAVE@HOST:5432/BASE_SOLO_PRUEBAS'
npm test
```

Las pruebas vacían las tablas de esa base. Nunca uses una base de negocio para `TEST_DATABASE_URL`.

## Servicio público con HTTPS

El Dockerfile está listo para construir la imagen del servidor y la interfaz:

```text
docker build -t almacen .
```

En el servicio que ejecute el contenedor configura las variables indicadas en `.env.production.example` usando su gestor de secretos:

- `NODE_ENV=production`
- `DEMO_MODE=false`
- `DATABASE_URL` del servidor PostgreSQL; usa los parámetros TLS requeridos por tu proveedor.
- `APP_ORIGIN` con el origen HTTPS exacto, sin barra final.
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` para el primer administrador.
- `HOST=0.0.0.0` y `PORT` asignado por el servicio.

El servicio debe terminar HTTPS y reenviar al puerto del contenedor. El proceso crea el primer administrador solo si la tabla de usuarios está vacía. Las cookies en producción llevan `Secure`. La aplicación rechaza el arranque en producción si se habilita la demo, falta PostgreSQL o falta el origen HTTPS.

Usa una base nueva para el servicio público. Las cuentas de demo creadas localmente no se deben reutilizar allí. Los ejemplos de contraseña en la documentación son únicamente de la demo y de CI.

La ruta `GET /api/health` sirve como comprobación de salud. El límite de login de la aplicación usa la dirección del socket y memoria del proceso; detrás de un proxy o varias réplicas, configura además el límite de intentos en ese proxy.

## Estado de validación

El build, las pruebas con PostgreSQL integrado y los flujos de navegador se ejecutaron localmente. El flujo de GitHub Actions contiene una ejecución adicional con PostgreSQL 17. El despliegue público y la construcción Docker no se han ejecutado en este equipo; Docker está instalado pero su motor no está activo.
