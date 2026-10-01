# API Rust

API Axum + Tokio para la PWA, con PostgreSQL de Neon y R2 para comprobantes. Incluye contenedor de producción para Cloud Run; los comprobantes se diseñan para carga directa a R2, evitando que archivos grandes atraviesen la API.

La base se inicializa con:

```sh
sqlx database create
sqlx migrate run
cargo run
```

Configure las variables según `.env.example`. En producción guárdelas en Secret Manager y despliegue con `deploy-cloud-run.sh`. Ubique el servicio detrás de Cloudflare Access y acepte únicamente el encabezado de identidad inyectado por ese proxy. `DEV_AUTH_USER_ID` es exclusivamente para el servidor local.

`GET /v1/health` permite el chequeo de plataforma. La exportación Siigo se ofrece desde `GET /v1/exports/siigo.csv`: UTF-8, punto y coma y descarga en streaming.
