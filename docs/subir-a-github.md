# Publicar el repositorio en GitHub

El código está preparado para un repositorio llamado **inventario-negocio**. La cuenta conectada a este chat es **yhancamilom-stack**; puedes usar otra cuenta si lo prefieres.

## 1. Crear el repositorio vacío

En [GitHub: nuevo repositorio](https://github.com/new), introduce `inventario-negocio`. Para mostrarlo en el perfil, elige **Public**. La descripción sugerida es:

> Inventario y pedidos con React, TypeScript, PostgreSQL, permisos, transacciones, pruebas y reportes.

No agregues README, licencia ni .gitignore desde GitHub: este proyecto ya los incluye.

## 2. Publicar con Git

Abre una terminal dentro de la carpeta del proyecto. Si no existe `.git`, ejecuta `git init -b main`, `git add .` y `git commit -m "Completar inventario y pedidos"` antes de continuar.

```powershell
git remote add origin https://github.com/yhancamilom-stack/inventario-negocio.git
git push -u origin main
```

Git puede pedir que inicies sesión en tu navegador. Si eliges otra cuenta o nombre, cambia la URL por la que muestra tu repositorio.

El usuario y correo del autor de commits son los que tengas configurados en Git; pueden ser diferentes de tu usuario de GitHub. Si necesitas ajustarlos, usa `git config user.name "TU NOMBRE"` y `git config user.email "TU CORREO O CORREO NOREPLY"` dentro de este repositorio.

## 3. Comprobar y destacar

En la pestaña **Actions**, verifica el flujo **Build y pruebas**. Ejecuta el build, las pruebas de comportamiento, los flujos de navegador y otra ejecución contra PostgreSQL 17.

En la descripción del repositorio, agrega los temas `react`, `typescript`, `postgresql`, `inventory-management`, `nodejs`, `playwright`. Fija el repositorio en tu perfil.

## Demo pública

GitHub aloja el código. GitHub Pages sirve sitios estáticos y no ejecuta este servidor Node ni su base de datos. La demo completa necesita un servicio para Node y PostgreSQL. Consulta [despliegue](despliegue.md) para la configuración preparada.

No hay una URL pública de demo creada todavía. Cuando la tengas, añádela al README y al campo Website del repositorio.
