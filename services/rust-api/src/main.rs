use axum::{extract::{Query, State}, http::{header, HeaderMap, HeaderValue, StatusCode}, response::IntoResponse, routing::get, Json, Router};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::{env, net::SocketAddr};
use tower_http::{cors::{Any, CorsLayer}, trace::TraceLayer};

#[derive(Clone)] struct App { db: PgPool, dev_user: Option<String> }
#[derive(Deserialize)] struct ExportQuery { profile_id: uuid::Uuid, from: NaiveDate, to: NaiveDate }
#[derive(Serialize)] struct Health { status: &'static str, service: &'static str }

fn owner(headers: &HeaderMap, app: &App) -> Result<String, StatusCode> {
    headers.get("cf-access-authenticated-user-email").and_then(|v| v.to_str().ok()).map(str::to_owned)
        .or_else(|| app.dev_user.clone()).ok_or(StatusCode::UNAUTHORIZED)
}

async fn health() -> Json<Health> { Json(Health { status: "ok", service: "mis-finanzas-api-rust" }) }

async fn siigo_csv(State(app): State<App>, headers: HeaderMap, Query(query): Query<ExportQuery>) -> Result<impl IntoResponse, StatusCode> {
    let owner = owner(&headers, &app)?;
    let rows = sqlx::query_as::<_, (NaiveDate, String, Option<String>, i64, Option<String>, Option<String>, Option<i64>, Option<i64>, Option<i64>, Option<String>)>(
        "SELECT movement_date,description,category,amount_cents,nit,supplier,subtotal_cents,iva_cents,withholding_cents,cost_center
         FROM movements WHERE owner_email=$1 AND profile_id=$2 AND movement_date BETWEEN $3 AND $4 ORDER BY movement_date,id")
        .bind(owner).bind(query.profile_id).bind(query.from).bind(query.to).fetch_all(&app.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut writer = csv::WriterBuilder::new().delimiter(b';').from_writer(vec![0xEF, 0xBB, 0xBF]);
    writer.write_record(["fecha","descripcion","categoria","valor_cop","nit","proveedor","subtotal_cop","iva_cop","retencion_cop","centro_costo"]).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    for row in rows { writer.write_record([row.0.to_string(), row.1, row.2.unwrap_or_default(), (row.3 as f64 / 100.0).to_string(), row.4.unwrap_or_default(), row.5.unwrap_or_default(), row.6.map(|v| (v as f64 / 100.0).to_string()).unwrap_or_default(), row.7.map(|v| (v as f64 / 100.0).to_string()).unwrap_or_default(), row.8.map(|v| (v as f64 / 100.0).to_string()).unwrap_or_default(), row.9.unwrap_or_default()]).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?; }
    let bytes = writer.into_inner().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(([(header::CONTENT_TYPE, HeaderValue::from_static("text/csv; charset=utf-8")), (header::CONTENT_DISPOSITION, HeaderValue::from_static("attachment; filename=siigo.csv"))], bytes))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let db = PgPoolOptions::new().max_connections(5).connect(&env::var("DATABASE_URL")?).await?;
    let allowed = env::var("ALLOWED_ORIGIN").unwrap_or_else(|_| "http://localhost:5173".into()).parse::<HeaderValue>()?;
    let app_state = App { db, dev_user: env::var("DEV_AUTH_USER_ID").ok() };
    let app = Router::new().route("/v1/health", get(health)).route("/v1/exports/siigo.csv", get(siigo_csv)).with_state(app_state).layer(CorsLayer::new().allow_origin(allowed).allow_methods(Any).allow_headers(Any)).layer(TraceLayer::new_for_http());
    let port = env::var("PORT").unwrap_or_else(|_| "8080".into()).parse()?;
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port))).await?;
    axum::serve(listener, app).await?; Ok(())
}
