# Primera lectura · Interfaz, servidor y SQL

Ya conoces variables, funciones y algo de HTML/CSS. El proyecto está completo, pero puedes estudiarlo por partes. No necesitas leer todos los archivos en una sesión.

## 1. Usa una operación pequeña

Entra como administrador de demostración. Crea **Libreta de práctica**, código **PRA-001**, categoría **Papelería**, precio **5000**, mínimo **2**, unidades iniciales **5**. Registra una salida de **2**: deben quedar **3**. Intenta retirar **4**: el servidor rechazará el cambio.

## 2. Un objeto representa un producto

En `src/types.ts`, `Product` describe su forma: `name`, `sku`, `stock`, `min_stock`, etc. TypeScript comprueba que utilices los datos con el tipo adecuado; estas comprobaciones no sustituyen la validación del servidor.

Busca `status` en `client/utils.ts`:

```ts
if (product.stock === 0) return ['Agotado', 'status-empty'];
if (product.stock <= product.min_stock) return ['Por reponer', 'status-low'];
return ['Disponible', 'status-ok'];
```

La función recibe un objeto y devuelve el texto y su clase visual. Si hay tres unidades y el mínimo es tres, ¿qué devuelve?

## 3. Un componente dibuja la pantalla

`client/Products.tsx` contiene componentes de React. `Products` recibe productos y permisos, mantiene filtros con `useState` y genera filas con `map`. `MovementForm` se encarga del formulario de entradas y salidas.

Las propiedades llevan datos a un componente; el estado guarda valores que cambian. Un evento modifica el estado y React actualiza la pantalla. El código que parece HTML dentro de TypeScript se llama JSX.

## 4. La interfaz envía una petición

Busca `submit` dentro de `MovementForm`. Lee el formulario y llama a `api` con un objeto:

```ts
{ kind: 'OUT', quantity: 2, note: 'Venta de práctica' }
```

`client/api.ts` usa `fetch`. Convierte el objeto a JSON, manda el token CSRF y lee el resultado. La cookie de sesión se envía automáticamente; JavaScript no puede leerla porque es HttpOnly.

## 5. El servidor decide si está permitido

En `src/server.ts`, busca `'/movements'`. Antes de registrar el cambio, verifica la sesión y el token CSRF. Para editar productos también exige que el usuario sea administrador.

El servidor llama a `recordMovement` en `src/service.ts`. Esta función valida los datos, bloquea el producto, comprueba unidades y guarda el cambio dentro de una transacción.

## 6. Una transacción conserva la coherencia

El descuento y el registro del movimiento deben ocurrir juntos. Si uno falla, la transacción se revierte. En PostgreSQL, `FOR UPDATE` bloquea la fila durante la operación para coordinar escrituras concurrentes.

Los parámetros SQL se pasan por separado del texto de la consulta: `$1`, `$2`, etc. No se construye SQL pegando nombres o valores del formulario.

## Tu primer ejercicio

En `client/utils.ts`, cambia **Disponible** por **Existencias suficientes**. Ejecuta `npm run build` y recarga la aplicación. Los estados Agotado y Por reponer deben conservarse.

Después modifica el color de `.status-ok` en `public/styles.css` y vuelve a construir. Distingue el cambio de **comportamiento/texto** del cambio de **apariencia**.

Ejecuta `npm test` y lee la prueba de salida válida y salida imposible en `test/app.test.ts`. Comprueba que verifica tanto las unidades como el historial.

Explícalo con tus palabras: ¿por qué no basta con validar en el formulario? ¿Por qué editar un producto no debe sobrescribir sus unidades? ¿Qué evita una transacción?
