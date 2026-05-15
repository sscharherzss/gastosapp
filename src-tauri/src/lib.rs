mod models;
mod commands;

use sqlx::sqlite::SqlitePoolOptions;
use commands::gastos::inicializar_db;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .expect("no se pudo obtener el directorio de datos");
            std::fs::create_dir_all(&app_dir).ok();
            let db_url = format!("sqlite://{}?mode=rwc",
                app_dir.join("gastos.db").display());

            tauri::async_runtime::block_on(async {
                let pool = SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect(&db_url)
                    .await
                    .expect("error conectando a SQLite");
                inicializar_db(&pool).await
                    .expect("error creando tablas");
                app.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::gastos::agregar_gasto,
            commands::gastos::listar_gastos,
            commands::gastos::eliminar_gasto,
            commands::gastos::agregar_ingreso,
            commands::gastos::listar_ingresos,
            commands::gastos::obtener_resumen_mes,
            commands::gastos::guardar_presupuesto,
            commands::gastos::obtener_presupuesto,
            commands::gastos::obtener_dispensador_dia,
            commands::gastos::obtener_prediccion_ml,
            commands::gastos::agregar_compromiso,
            commands::gastos::listar_compromisos,
            commands::gastos::eliminar_compromiso,
            commands::gastos::obtener_mensaje_manana,
            commands::gastos::guardar_config,
            commands::gastos::obtener_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}