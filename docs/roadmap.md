# Plan para aprender con el proyecto completo

La implementación funcional está terminada: React/TypeScript, PostgreSQL, inventario, pedidos, sesiones, permisos, reportes y pruebas. Estudia por etapas y realiza cambios pequeños que puedas explicar.

## 1 · JavaScript que ya conoces

Lee `client/utils.ts`: objetos, condicionales, `filter` y `reduce`. Cambia un texto de estado y agrega una categoría de ejemplo. Predice el resultado antes de ejecutar.

## 2 · TypeScript

Lee `src/types.ts`. Explica por qué `quantity` es un número y `role` solo admite dos valores. Introduce temporalmente un tipo incorrecto y observa el error de `npm run build`; después corrígelo.

## 3 · React

Lee `Products` y `MovementForm`. Identifica propiedades, estado y eventos. Añade un botón para limpiar filtros. Escribe una prueba del filtro que use la misma entrada del ejercicio.

## 4 · API y permisos

Sigue una salida desde el formulario hasta `recordMovement`. Entra como operador y explica por qué puede registrar una salida pero no editar el precio. La restricción debe comprobarse también en el servidor.

## 5 · SQL y transacciones

Lee la migración y dibuja las relaciones entre producto, pedido y línea de pedido. Explica el efecto de `FOR UPDATE`, `COMMIT` y `ROLLBACK`. Revisa la prueba de la última unidad comprada por dos usuarios.

## 6 · Pruebas

Lee el caso de reintentos de un pedido. Añade una prueba que confirme que una entrada negativa se rechaza sin cambiar el historial. Cambia una regla de forma deliberada, comprueba que una prueba falla y restaura la regla.

## 7 · Git y presentación

Publica el repositorio siguiendo la guía. Realiza tus mejoras en una rama y abre un pull request. Explica el problema, cambio y validación. Actualiza el README con una decisión propia y el resultado de tu mejora.

## Mejoras futuras posibles

Paginación y filtros de historial en el servidor, pruebas de acceso adicionales, importación CSV con vista previa, notificaciones de mínimos y múltiples tiendas. Son extensiones posibles, no funcionalidades necesarias para ejecutar esta versión.

El despliegue público permanece pendiente de elegir y configurar un servicio de alojamiento. El código, Dockerfile y variables están preparados; publicar el código en GitHub no publica automáticamente la aplicación.
