use crate::models::{
    Compromiso, DispensadorDia, Gasto, GastoCategoria, Ingreso, MensajeManana, PrediccionML,
    Presupuesto, ResumenMes,
};
use chrono::{Duration, Local, NaiveDate};
use sqlx::{sqlite::SqlitePoolOptions, Row, SqlitePool};
use tauri::{AppHandle, Manager, State};

// Importamos el contenedor dinámico del pool desde la raíz (lib.rs)
use crate::DbState;

/// Función auxiliar interna para extraer de forma segura el pool activo
/// desde el cerrojo asíncrono compartido (RwLock).
async fn obtener_pool(state: &State<'_, DbState>) -> Result<SqlitePool, String> {
    let guard = state.pool.read().await;
    guard
        .clone()
        .ok_or_else(|| "No hay ninguna base de datos activa".to_string())
}

/// Inicializa las tablas base necesarias si el archivo SQLite es nuevo.
pub async fn inicializar_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            descripcion TEXT NOT NULL, 
            monto REAL NOT NULL, 
            categoria TEXT NOT NULL, 
            fecha TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ingresos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            descripcion TEXT NOT NULL, 
            monto REAL NOT NULL, 
            fecha TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS presupuesto (
            id INTEGER PRIMARY KEY,
            anio INTEGER NOT NULL,
            mes INTEGER NOT NULL,
            monto REAL NOT NULL,
            UNIQUE(anio, mes)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS compromisos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            monto REAL NOT NULL,
            tipo TEXT NOT NULL,
            dia_mes INTEGER,
            fecha TEXT,
            activo INTEGER DEFAULT 1
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS config (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ahorros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        monto REAL NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'efectivo',
        rendimiento REAL NOT NULL DEFAULT 0.0,
        fecha_registro TEXT NOT NULL,
        descripcion TEXT,
        perfil_id TEXT NOT NULL DEFAULT 'personal'
    )",
    )
    .execute(pool)
    .await?;

    let _ =
        sqlx::query("ALTER TABLE ahorros ADD COLUMN perfil_id TEXT NOT NULL DEFAULT 'personal'")
            .execute(pool)
            .await;

    Ok(())
}
// ── COMANDOS DE MUTACIÓN DE INTERFAZ ──────────────────────────────────────────
#[tauri::command]
pub async fn eliminar_ingreso(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let pool = obtener_pool(&state).await?;
    sqlx::query("DELETE FROM ingresos WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn cambiar_perfil(
    nombre_perfil: String,
    handle: AppHandle,
    state: State<'_, DbState>,
) -> Result<(), String> {
    if nombre_perfil.is_empty()
        || !nombre_perfil
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Nombre de perfil inválido".into());
    }
    let app_dir = handle.path().app_data_dir().map_err(|e| e.to_string())?;

    // Normalización de nombres de archivo (minúsculas y guiones bajos)
    let nombre_archivo = format!(
        "perfil_{}.db",
        nombre_perfil.to_lowercase().replace(' ', "_")
    );
    let nueva_ruta = app_dir.join(nombre_archivo);
    let db_url = format!("sqlite://{}?mode=rwc", nueva_ruta.display());

    // Bloqueamos el estado global para escritura segura en caliente
    let mut pool_guard = state.pool.write().await;

    // Conexión al nuevo archivo de base de datos SQLite
    let nuevo_pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| e.to_string())?;

    // Verificamos o creamos el esquema de tablas en la nueva DB
    inicializar_db(&nuevo_pool)
        .await
        .map_err(|e| e.to_string())?;

    // Guardamos la nueva referencia como el pool activo
    // Cambiar solo después de abrir y migrar correctamente; las lecturas previas terminan con su pool.
    *pool_guard = Some(nuevo_pool);

    println!(
        "Backend sincronizado exitosamente al archivo: {}",
        nueva_ruta.display()
    );
    Ok(())
}

// ── SECCIÓN: GASTOS ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn agregar_gasto(
    descripcion: String,
    monto: f64,
    categoria: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    validar_movimiento(&descripcion, monto)?;
    let pool = obtener_pool(&state).await?;
    let fecha = Local::now().format("%Y-%m-%d").to_string();

    sqlx::query("INSERT INTO gastos (descripcion, monto, categoria, fecha) VALUES (?, ?, ?, ?)")
        .bind(descripcion)
        .bind(monto)
        .bind(categoria)
        .bind(fecha)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn listar_gastos(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<Vec<Gasto>, String> {
    let pool = obtener_pool(&state).await?;
    let prefijo_fecha = format!("{:04}-{:02}%", anio, mes);

    let filas = sqlx::query("SELECT id, descripcion, monto, categoria, fecha FROM gastos WHERE fecha LIKE ? ORDER BY fecha DESC")
        .bind(prefijo_fecha)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut resultado = Vec::new();
    for r in filas {
        resultado.push(Gasto {
            id: r.get("id"),
            descripcion: r.get("descripcion"),
            monto: r.get("monto"),
            categoria: r.get("categoria"),
            fecha: r.get("fecha"),
        });
    }
    Ok(resultado)
}

#[tauri::command]
pub async fn eliminar_gasto(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let pool = obtener_pool(&state).await?;
    sqlx::query("DELETE FROM gastos WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── SECCIÓN: INGRESOS ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn agregar_ingreso(
    descripcion: String,
    monto: f64,
    state: State<'_, DbState>,
) -> Result<(), String> {
    validar_movimiento(&descripcion, monto)?;
    let pool = obtener_pool(&state).await?;
    let fecha = Local::now().format("%Y-%m-%d").to_string();

    sqlx::query("INSERT INTO ingresos (descripcion, monto, fecha) VALUES (?, ?, ?)")
        .bind(descripcion)
        .bind(monto)
        .bind(fecha)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn listar_ingresos(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<Vec<Ingreso>, String> {
    let pool = obtener_pool(&state).await?;
    let prefijo_fecha = format!("{:04}-{:02}%", anio, mes);

    let filas = sqlx::query(
        "SELECT id, descripcion, monto, fecha FROM ingresos WHERE fecha LIKE ? ORDER BY id DESC",
    )
    .bind(prefijo_fecha)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut resultado = Vec::new();
    for r in filas {
        resultado.push(Ingreso {
            id: r.get("id"),
            descripcion: r.get("descripcion"),
            monto: r.get("monto"),
            fecha: r.get("fecha"),
        });
    }
    Ok(resultado)
}

// ── SECCIÓN: RESUMEN Y ESTADÍSTICAS ───────────────────────────────────────────

#[tauri::command]
pub async fn obtener_resumen_mes(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<ResumenMes, String> {
    let pool = obtener_pool(&state).await?;
    let prefijo_fecha = format!("{:04}-{:02}%", anio, mes);

    let fila_g: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha LIKE ?")
        .bind(&prefijo_fecha)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let fila_i: (Option<f64>,) =
        sqlx::query_as("SELECT SUM(monto) FROM ingresos WHERE fecha LIKE ?")
            .bind(&prefijo_fecha)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    let total_gastos = fila_g.0.unwrap_or(0.0);
    let total_ingresos = fila_i.0.unwrap_or(0.0);
    let total_ahorrado = total_ingresos - total_gastos;

    let filas_cat = sqlx::query("SELECT categoria, SUM(monto) as total FROM gastos WHERE fecha LIKE ? GROUP BY categoria ORDER BY total DESC")
        .bind(&prefijo_fecha)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut gastos_por_categoria = Vec::new();
    for r in filas_cat {
        gastos_por_categoria.push(GastoCategoria {
            categoria: r.get("categoria"),
            total: r.get("total"),
        });
    }

    Ok(ResumenMes {
        total_gastos,
        total_ingresos,
        total_ahorrado,
        gastos_por_categoria,
    })
}

// ── SECCIÓN: PRESUPUESTO ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn guardar_presupuesto(
    anio: i32,
    mes: i32,
    monto: f64,
    state: State<'_, DbState>,
) -> Result<(), String> {
    validar_movimiento("Presupuesto", monto)?;
    crate::forecast::limites_mes(anio, mes)?;
    let pool = obtener_pool(&state).await?;
    sqlx::query("INSERT INTO presupuesto (anio, mes, monto) VALUES (?, ?, ?) ON CONFLICT(anio, mes) DO UPDATE SET monto = excluded.monto")
        .bind(anio)
        .bind(mes)
        .bind(monto)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn obtener_presupuesto(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<Option<Presupuesto>, String> {
    let pool = obtener_pool(&state).await?;
    let fila = sqlx::query("SELECT anio, mes, monto FROM presupuesto WHERE anio = ? AND mes = ?")
        .bind(anio)
        .bind(mes)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(r) = fila {
        Ok(Some(Presupuesto {
            anio: r.get("anio"),
            mes: r.get("mes"),
            monto: r.get("monto"),
        }))
    } else {
        Ok(None)
    }
}

// ── SECCIÓN: DISPENSADOR INTELIGENTE DEL DÍA ───────────────────────────────────

#[tauri::command]
pub async fn obtener_dispensador_dia(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<DispensadorDia, String> {
    let pool = obtener_pool(&state).await?;

    // Obtener presupuesto base asignado del mes
    let r_pres: Option<(Option<f64>,)> =
        sqlx::query_as("SELECT monto FROM presupuesto WHERE anio = ? AND mes = ?")
            .bind(anio)
            .bind(mes)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;
    let presupuesto_mes = r_pres.and_then(|row| row.0).unwrap_or(0.0);

    // Obtener los gastos consolidados del mes en curso
    let prefijo_mes = format!("{:04}-{:02}%", anio, mes);
    let r_gastado: (Option<f64>,) =
        sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha LIKE ?")
            .bind(&prefijo_mes)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;
    let gastado_mes = r_gastado.0.unwrap_or(0.0);

    // Obtener el acumulado consumido específicamente el día de hoy
    let hoy_str = Local::now().format("%Y-%m-%d").to_string();
    let r_hoy: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha = ?")
        .bind(&hoy_str)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let gastado_hoy = r_hoy.0.unwrap_or(0.0);

    let dt_hoy = Local::now().date_naive();
    let (inicio, prox_mes) = crate::forecast::limites_mes(anio, mes)?;
    let dias_restantes = if dt_hoy >= prox_mes {
        0
    } else {
        (prox_mes - dt_hoy.max(inicio)).num_days() as i32
    };
    let gastado_hoy = if dt_hoy >= inicio && dt_hoy < prox_mes {
        gastado_hoy
    } else {
        0.0
    };
    let pendiente: f64 = predecir_con_pool(&pool, anio, mes)
        .await?
        .compromisos_pendientes
        .iter()
        .map(|c| c.monto)
        .sum();
    let disponible_mes = (presupuesto_mes - (gastado_mes - gastado_hoy) - pendiente).max(0.0);
    let limite_hoy = if dias_restantes > 0 {
        disponible_mes / dias_restantes as f64
    } else {
        0.0
    };
    let porcentaje_hoy = if limite_hoy > 0.0 {
        gastado_hoy / limite_hoy * 100.0
    } else if gastado_hoy > 0.0 {
        100.0
    } else {
        0.0
    };
    let alerta = if presupuesto_mes <= 0.0 {
        "sin_presupuesto"
    } else if gastado_mes + pendiente > presupuesto_mes || gastado_hoy > limite_hoy {
        "excedido"
    } else if porcentaje_hoy >= 85.0 {
        "advertencia"
    } else {
        "ok"
    }
    .to_string();

    Ok(DispensadorDia {
        presupuesto_mes,
        gastado_mes,
        dias_restantes,
        limite_hoy,
        gastado_hoy,
        porcentaje_hoy,
        alerta,
    })
}

// ── SECCIÓN: COMPROMISOS FINANCIEROS ──────────────────────────────────────────

#[tauri::command]
pub async fn agregar_compromiso(
    nombre: String,
    monto: f64,
    tipo: String,
    dia_mes: Option<i32>,
    fecha: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    validar_movimiento(&nombre, monto)?;
    match tipo.as_str() {
        "recurrente" if dia_mes.map_or(false, |d| (1..=31).contains(&d)) => {}
        "impuesto" | "cumple"
            if fecha.as_ref().map_or(false, |f| {
                NaiveDate::parse_from_str(&format!("2000-{}", f), "%Y-%m-%d").is_ok()
            }) => {}
        _ => return Err("Indica un día del 1 al 31 o una fecha MM-DD válida".into()),
    }
    let pool = obtener_pool(&state).await?;
    sqlx::query(
        "INSERT INTO compromisos (nombre, monto, tipo, dia_mes, fecha) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(nombre)
    .bind(monto)
    .bind(tipo)
    .bind(dia_mes)
    .bind(fecha)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn listar_compromisos(state: State<'_, DbState>) -> Result<Vec<Compromiso>, String> {
    let pool = obtener_pool(&state).await?;
    let filas =
        sqlx::query("SELECT id, nombre, monto, tipo, dia_mes, fecha, activo FROM compromisos")
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

    let mut res = Vec::new();
    for r in filas {
        res.push(Compromiso {
            id: r.get("id"),
            nombre: r.get("nombre"),
            monto: r.get("monto"),
            tipo: r.get("tipo"),
            dia_mes: r.get("dia_mes"),
            fecha: r.get("fecha"),
            activo: r.get::<i32, _>("activo") == 1,
        });
    }
    Ok(res)
}

#[tauri::command]
pub async fn eliminar_compromiso(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let pool = obtener_pool(&state).await?;
    sqlx::query("DELETE FROM compromisos WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn actualizar_compromiso(
    id: i64,
    nombre: String,
    monto: f64,
    tipo: String,
    dia_mes: Option<i32>,
    fecha: Option<String>,
    state: State<'_, DbState>,
) -> Result<(), String> {
    validar_movimiento(&nombre, monto)?;
    match tipo.as_str() {
        "recurrente" if dia_mes.is_some_and(|d| (1..=31).contains(&d)) => {}
        "impuesto" | "cumple"
            if fecha.as_ref().is_some_and(|f| {
                NaiveDate::parse_from_str(&format!("2000-{}", f), "%Y-%m-%d").is_ok()
            }) => {}
        _ => return Err("Indica un día del 1 al 31 o una fecha MM-DD válida".into()),
    }
    let pool = obtener_pool(&state).await?;
    sqlx::query("UPDATE compromisos SET nombre=?, monto=?, tipo=?, dia_mes=?, fecha=? WHERE id=?")
        .bind(nombre)
        .bind(monto)
        .bind(tipo)
        .bind(dia_mes)
        .bind(fecha)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── EDITAR GASTOS ─────────────────────────────────────────────────────────────
#[tauri::command]
pub async fn actualizar_gasto(
    id: i64,
    descripcion: String,
    monto: f64,
    categoria: String,
    fecha: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let db = obtener_pool(&state).await?;
    validar_movimiento(&descripcion, monto)?;
    NaiveDate::parse_from_str(&fecha, "%Y-%m-%d").map_err(|_| "Fecha inválida")?;
    sqlx::query(
        "UPDATE gastos SET descripcion = ?, monto = ?, categoria = ?, fecha = ?
    WHERE id = ?",
    )
    .bind(&descripcion)
    .bind(monto)
    .bind(&categoria)
    .bind(&fecha)
    .bind(id)
    .execute(&db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
// ── EDITAR INGRESOS ───────────────────────────────────────────────────────────
#[tauri::command]
pub async fn actualizar_ingreso(
    id: i64,
    descripcion: String,
    monto: f64,
    fecha: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let db = obtener_pool(&state).await?;
    validar_movimiento(&descripcion, monto)?;
    NaiveDate::parse_from_str(&fecha, "%Y-%m-%d").map_err(|_| "Fecha inválida")?;
    sqlx::query(
        "UPDATE ingresos SET descripcion = ?, monto = ?, fecha = ?
    WHERE id = ?",
    )
    .bind(&descripcion)
    .bind(monto)
    .bind(&fecha)
    .bind(id)
    .execute(&db)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── SECCIÓN: MOTOR DE PROYECCIONES DE APRENDIZAJE MACHINE LEARNING ────────────

#[tauri::command]
pub async fn obtener_prediccion_ml(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<PrediccionML, String> {
    let pool = obtener_pool(&state).await?;
    predecir_con_pool(&pool, anio, mes).await
}

async fn predecir_con_pool(pool: &SqlitePool, anio: i32, mes: i32) -> Result<PrediccionML, String> {
    let (inicio, fin) = crate::forecast::limites_mes(anio, mes)?;
    let desde = inicio
        .checked_sub_months(chrono::Months::new(6))
        .ok_or("Fecha fuera de rango")?;
    let filas = sqlx::query("SELECT id, descripcion, monto, categoria, fecha FROM gastos WHERE fecha >= ? AND fecha < ?")
        .bind(desde.to_string()).bind(fin.to_string()).fetch_all(pool).await.map_err(|e| e.to_string())?;
    let gastos: Vec<Gasto> = filas
        .iter()
        .map(|r| Gasto {
            id: r.get("id"),
            descripcion: r.get("descripcion"),
            monto: r.get("monto"),
            categoria: r.get("categoria"),
            fecha: r.get("fecha"),
        })
        .collect();
    let filas = sqlx::query(
        "SELECT id,nombre,monto,tipo,dia_mes,fecha,activo FROM compromisos WHERE activo=1",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let compromisos: Vec<Compromiso> = filas
        .iter()
        .map(|r| Compromiso {
            id: r.get("id"),
            nombre: r.get("nombre"),
            monto: r.get("monto"),
            tipo: r.get("tipo"),
            dia_mes: r.get("dia_mes"),
            fecha: r.get("fecha"),
            activo: true,
        })
        .collect();
    let presupuesto: Option<(f64,)> =
        sqlx::query_as("SELECT monto FROM presupuesto WHERE anio=? AND mes=?")
            .bind(anio)
            .bind(mes)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    crate::forecast::calcular(
        &gastos,
        &compromisos,
        presupuesto.map(|p| p.0),
        anio,
        mes,
        Local::now().date_naive(),
    )
}

// ── SECCIÓN: NOTIFICACIONES AL USUARIO Y SALUDOS CONTEXTUALES ────────────────

#[tauri::command]
pub async fn obtener_mensaje_manana(
    anio: i32,
    mes: i32,
    state: State<'_, DbState>,
) -> Result<MensajeManana, String> {
    let pool = obtener_pool(&state).await?;

    // 1. Obtener los datos del dispensador de hoy
    let disp = obtener_dispensador_dia(anio, mes, state).await?;

    // 2. Calcular cuánto se gastó exactamente el día de ayer
    let ayer_str = (Local::now() - Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let r_ayer: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha = ?")
        .bind(&ayer_str)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let gastado_ayer = r_ayer.0.unwrap_or(0.0);

    let compromisos_esta_semana = predecir_con_pool(&pool, anio, mes)
        .await?
        .compromisos_pendientes
        .into_iter()
        .filter(|c| c.dias_para_vencer <= 7)
        .collect();

    // 4. Intentar recuperar el nombre del usuario desde la tabla de configuración
    let fila_user = sqlx::query("SELECT valor FROM config WHERE clave = 'nombre_usuario'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let nombre_usuario = fila_user
        .map(|r| r.get::<String, _>("valor"))
        .unwrap_or_else(|| "Usuario".to_string());

    // 5. Redactar el mensaje dinámico basado en la salud del dispensador
    let msg = if disp.presupuesto_mes == 0.0 {
        "Aún no defines tu presupuesto mensual. Registra uno en el dispensador para guiarte."
            .to_string()
    } else if disp.alerta == "excedido" {
        format!(
            "¡Alerta de control! Has superado el límite sugerido diario por ${:.2} hoy.",
            (disp.gastado_hoy - disp.limite_hoy).abs()
        )
    } else if disp.porcentaje_hoy > 75.0 {
        "Atención: Te queda menos del 25% del cupo diario disponible para gastos.".to_string()
    } else {
        format!(
            "Vas bien. Tienes un margen de seguridad saludable de ${:.2} para el resto del día.",
            (disp.limite_hoy - disp.gastado_hoy).max(0.0)
        )
    };

    Ok(MensajeManana {
        mensaje: msg,
        limite_hoy: disp.limite_hoy,
        gastado_ayer,
        nombre_usuario,
        compromisos_esta_semana,
    })
}

// ── SECCIÓN: PARÁMETROS DE CONFIGURACIÓN INTERNA ─────────────────────────────

#[tauri::command]
pub async fn guardar_config(
    clave: String,
    valor: String,
    state: State<'_, DbState>,
) -> Result<(), String> {
    let pool = obtener_pool(&state).await?;
    sqlx::query("INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
        .bind(clave)
        .bind(valor)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn obtener_config(
    clave: String,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let pool = obtener_pool(&state).await?;
    let fila = sqlx::query("SELECT valor FROM config WHERE clave = ?")
        .bind(clave)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(fila.map(|r| r.get("valor")))
}
fn validar_movimiento(descripcion: &str, monto: f64) -> Result<(), String> {
    if descripcion.trim().is_empty() || !monto.is_finite() || monto <= 0.0 {
        return Err("Escribe una descripción y un monto mayor que cero".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn listar_ahorros(
    state: State<'_, DbState>,
) -> Result<Vec<crate::models::Ahorro>, String> {
    let pool = obtener_pool(&state).await?;
    let filas = sqlx::query("SELECT id,nombre,monto,tipo,rendimiento,fecha_registro,descripcion FROM ahorros ORDER BY id DESC")
        .fetch_all(&pool).await.map_err(|e|e.to_string())?;
    Ok(filas
        .iter()
        .map(|r| crate::models::Ahorro {
            id: r.get("id"),
            nombre: r.get("nombre"),
            monto: r.get("monto"),
            tipo: r.get("tipo"),
            rendimiento: r.get("rendimiento"),
            fecha_registro: r.get("fecha_registro"),
            descripcion: r.get("descripcion"),
        })
        .collect())
}
#[tauri::command]
pub async fn agregar_ahorro(
    nombre: String,
    monto: f64,
    state: State<'_, DbState>,
) -> Result<(), String> {
    validar_movimiento(&nombre, monto)?;
    let pool = obtener_pool(&state).await?;
    sqlx::query("INSERT INTO ahorros (nombre,monto,fecha_registro) VALUES (?,?,?)")
        .bind(nombre.trim())
        .bind(monto)
        .bind(Local::now().format("%Y-%m-%d").to_string())
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn eliminar_ahorro(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let pool = obtener_pool(&state).await?;
    sqlx::query("DELETE FROM ahorros WHERE id=?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn migracion_idempotente_y_proyeccion_desde_sqlite() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        inicializar_db(&pool).await.unwrap();
        sqlx::query("INSERT INTO gastos(descripcion,monto,categoria,fecha) VALUES ('Internet',100,'Vivienda','2026-01-10')").execute(&pool).await.unwrap();
        inicializar_db(&pool).await.unwrap();
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM gastos")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total.0, 1);
        let prediccion = predecir_con_pool(&pool, 2026, 1).await.unwrap();
        assert_eq!(prediccion.proyeccion_mes, 100.0);
        assert!(predecir_con_pool(&pool, 2026, 0).await.is_err());
    }
    #[test]
    fn rechaza_montos_invalidos() {
        for monto in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert!(validar_movimiento("Gasto", monto).is_err());
        }
        assert!(validar_movimiento("  ", 1.0).is_err());
        assert!(validar_movimiento("Gasto", 0.01).is_ok());
    }
}
