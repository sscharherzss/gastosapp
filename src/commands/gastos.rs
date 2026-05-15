use sqlx::{SqlitePool, Row};
use tauri::State;
use crate::models::{Gasto, Ingreso};


// ──────────────────────────────────────────
// Structs de respuesta
// ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct ResumenMes {
    pub total_gastos: f64,
    pub total_ingresos: f64,
    pub total_ahorrado: f64,
    pub gastos_por_categoria: Vec<GastoCategoria>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GastoCategoria {
    pub categoria: String,
    pub total: f64,
}

// ──────────────────────────────────────────
// Inicializar base de datos
// ──────────────────────────────────────────

pub async fn inicializar_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS gastos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            descripcion TEXT    NOT NULL,
            monto       REAL    NOT NULL,
            categoria   TEXT    NOT NULL,
            fecha       TEXT    NOT NULL
        )"
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ingresos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            descripcion TEXT NOT NULL,
            monto       REAL NOT NULL,
            fecha       TEXT NOT NULL
        )"
    )
    pub async fn inicializar_db(db: &SqlitePool) -> Result<(), Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descripcion TEXT NOT NULL,
            monto REAL NOT NULL,
            categoria TEXT NOT NULL,
            fecha TEXT NOT NULL
        )"
    ).execute(db).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ingresos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            descripcion TEXT NOT NULL,
            monto REAL NOT NULL,
            fecha TEXT NOT NULL
        )"
    ).execute(db).await?;

    // ── NUEVAS TABLAS ──────────────────────────────────────
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS presupuesto (
            id INTEGER PRIMARY KEY,
            anio INTEGER NOT NULL,
            mes INTEGER NOT NULL,
            monto REAL NOT NULL,
            UNIQUE(anio, mes)
        )"
    ).execute(db).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS compromisos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            monto REAL NOT NULL,
            tipo TEXT NOT NULL,
            dia_mes INTEGER,
            fecha TEXT,
            activo INTEGER NOT NULL DEFAULT 1
        )"
    ).execute(db).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )"
    ).execute(db).await?;

    Ok(())
}
    .execute(pool)
    .await?;

    Ok(())
}

// ──────────────────────────────────────────
// Comandos de GASTOS
// ──────────────────────────────────────────

#[tauri::command]
pub async fn agregar_gasto(
    descripcion: String,
    monto: f64,
    categoria: String,
    db: State<'_, SqlitePool>,
) -> Result<i64, String> {
    let id = sqlx::query(
        "INSERT INTO gastos (descripcion, monto, categoria, fecha)
         VALUES (?, ?, ?, date('now'))"
    )
    .bind(&descripcion)
    .bind(monto)
    .bind(&categoria)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    Ok(id)
}

#[tauri::command]
pub async fn listar_gastos(
    anio: i32,
    mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<Vec<Gasto>, String> {
    let mes_str = format!("{:04}-{:02}", anio, mes);

    let filas = sqlx::query(
        "SELECT id, descripcion, monto, categoria, fecha
         FROM gastos
         WHERE strftime('%Y-%m', fecha) = ?
         ORDER BY fecha DESC"
    )
    .bind(&mes_str)
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let gastos = filas.iter().map(|row| Gasto {
        id:          row.get("id"),
        descripcion: row.get("descripcion"),
        monto:       row.get("monto"),
        categoria:   row.get("categoria"),
        fecha:       row.get("fecha"),
    }).collect();

    Ok(gastos)
}

#[tauri::command]
pub async fn eliminar_gasto(
    id: i64,
    db: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM gastos WHERE id = ?")
        .bind(id)
        .execute(&*db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ──────────────────────────────────────────
// Comandos de INGRESOS
// ──────────────────────────────────────────

#[tauri::command]
pub async fn agregar_ingreso(
    descripcion: String,
    monto: f64,
    db: State<'_, SqlitePool>,
) -> Result<i64, String> {
    let id = sqlx::query(
        "INSERT INTO ingresos (descripcion, monto, fecha)
         VALUES (?, ?, date('now'))"
    )
    .bind(&descripcion)
    .bind(monto)
    .execute(&*db)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    Ok(id)
}

#[tauri::command]
pub async fn listar_ingresos(
    anio: i32,
    mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<Vec<Ingreso>, String> {
    let mes_str = format!("{:04}-{:02}", anio, mes);

    let filas = sqlx::query(
        "SELECT id, descripcion, monto, fecha
         FROM ingresos
         WHERE strftime('%Y-%m', fecha) = ?
         ORDER BY fecha DESC"
    )
    .bind(&mes_str)
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let ingresos = filas.iter().map(|row| Ingreso {
        id:          row.get("id"),
        descripcion: row.get("descripcion"),
        monto:       row.get("monto"),
        fecha:       row.get("fecha"),
    }).collect();

    Ok(ingresos)
}

// ──────────────────────────────────────────
// Resumen del mes (para gráficos)
// ──────────────────────────────────────────

#[tauri::command]
pub async fn obtener_resumen_mes(
    anio: i32,
    mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<ResumenMes, String> {
    let mes_str = format!("{:04}-{:02}", anio, mes);

    // Total gastos
    let fila_gastos = sqlx::query(
        "SELECT COALESCE(SUM(monto), 0.0) as total
         FROM gastos WHERE strftime('%Y-%m', fecha) = ?"
    )
    .bind(&mes_str)
    .fetch_one(&*db)
    .await
    .map_err(|e| e.to_string())?;
    let total_gastos: f64 = fila_gastos.get("total");

    // Total ingresos
    let fila_ingresos = sqlx::query(
        "SELECT COALESCE(SUM(monto), 0.0) as total
         FROM ingresos WHERE strftime('%Y-%m', fecha) = ?"
    )
    .bind(&mes_str)
    .fetch_one(&*db)
    .await
    .map_err(|e| e.to_string())?;
    let total_ingresos: f64 = fila_ingresos.get("total");

    // Gastos por categoría (para gráfico de pastel)
    let filas_cat = sqlx::query(
        "SELECT categoria, SUM(monto) as total
         FROM gastos WHERE strftime('%Y-%m', fecha) = ?
         GROUP BY categoria ORDER BY total DESC"
    )
    .bind(&mes_str)
    .fetch_all(&*db)
    .await
    .map_err(|e| e.to_string())?;

    let gastos_por_categoria = filas_cat.iter().map(|row| GastoCategoria {
        categoria: row.get("categoria"),
        total:     row.get("total"),
    }).collect();

    Ok(ResumenMes {
        total_gastos,
        total_ingresos,
        total_ahorrado: total_ingresos - total_gastos,
        gastos_por_categoria,
    })
}