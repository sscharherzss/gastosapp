# Mis Finanzas

Aplicación personal de gastos como PWA instalable para Android, iPhone/iPad y navegador. Conserva los datos en el navegador para uso local; no requiere Cloudflare, servidor ni base de datos externa.

## Funciones

- Registra, edita y elimina ingresos, gastos, compromisos y ahorros por perfil.
- Calcula presupuesto, saldo, pagos pendientes y proyecciones a partir del historial disponible.
- Incluye tema claro/oscuro, interfaz móvil, uso sin conexión y exportación mensual de gastos e ingresos a CSV.
- El CSV se descarga desde el encabezado del mes, usa formato compatible con Excel y contiene el perfil activo.

## Ejecutar la PWA

```sh
npm install
npm run dev
npm run build
```

Sin configuración adicional, la PWA usa `localStorage` en el navegador y funciona sin conexión. La publicación se realiza con GitHub Pages mediante `.github/workflows/deploy-pwa.yaml`.

## Servicios y arquitectura

- [PWA compilada](dist/)
- [API Rust opcional para una futura sincronización](services/rust-api/)
- [Migración PostgreSQL para Neon](services/rust-api/migrations/0001_initial.sql)
- [Cliente web de la API](packages/web-api-client/)
- [Plantilla contable genérica de Colombia](packages/accounting-template/generic-colombia.json)
- [Arquitectura](docs/architecture.md)
- [Guía de despliegue](docs/deployment.md)

Para probar la API Rust:

```sh
cd services/rust-api
cp .env.example .env
cargo run
```

La guía de despliegue explica cómo publicarla desde GitHub Pages. La API Rust queda aislada y no se ejecuta en esta versión local.

También está lista la integración opcional con [Firebase Hosting y Firestore](docs/firebase.md), que publica la PWA bajo `/gastos`.

## Migración desde Tauri

La aplicación activa ya no requiere Tauri, SQLite local ni empaquetados APK/IPA para funcionar. La carpeta `src-tauri/` se conserva como respaldo del proyecto anterior y no forma parte de los comandos de construcción de esta PWA. Para instalarla en Android o iPhone/iPad, publique `dist/` mediante HTTPS y use la opción de instalación del navegador.
