use sqlx::{SqlitePool, Row};
use tauri::State;
use crate::models::{Compromiso, DispensadorDia, PrediccionML, CompromisoPendiente, MensajeManana, GastoCategoria};
use serde::{Deserialize, Serialize};
use chrono::{Local, Datelike, NaiveDate, Duration};

#[derive(Debug, Serialize, Deserialize)]
pub struct ResumenMes {
    pub total_gastos: f64,
    pub total_ingresos: f64,
    pub total_ahorrado: f64,
    pub gastos_por_categoria: Vec<GastoCategoria>,
}


pub async fn inicializar_db(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("CREATE TABLE IF NOT EXISTS gastos (id INTEGER PRIMARY KEY AUTOINCREMENT, descripcion TEXT NOT NULL, monto REAL NOT NULL, categoria TEXT NOT NULL, fecha TEXT NOT NULL)").execute(pool).await?;
    sqlx::query("CREATE TABLE IF NOT EXISTS ingresos (id INTEGER PRIMARY KEY AUTOINCREMENT, descripcion TEXT NOT NULL, monto REAL NOT NULL, fecha TEXT NOT NULL)").execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS presupuesto (
            id INTEGER PRIMARY KEY,
            anio INTEGER NOT NULL,
            mes INTEGER NOT NULL,
            monto REAL NOT NULL,
            UNIQUE(anio, mes)
        )"
    ).execute(pool).await?;

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
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )"
    ).execute(pool).await?;

    Ok(())
}

#[tauri::command]
pub async fn agregar_gasto(descripcion: String, monto: f64, categoria: String, db: State<'_, SqlitePool>) -> Result<i64, String> {
    let id = sqlx::query("INSERT INTO gastos (descripcion, monto, categoria, fecha) VALUES (?, ?, ?, date('now'))")
        .bind(&descripcion).bind(monto).bind(&categoria)
        .execute(&*db).await.map_err(|e| e.to_string())?.last_insert_rowid();
    Ok(id)
}

#[tauri::command]
pub async fn listar_gastos(anio: i32, mes: i32, db: State<'_, SqlitePool>) -> Result<Vec<serde_json::Value>, String> {
    let mes_str = format!("{:04}-{:02}", anio, mes);
    let filas = sqlx::query("SELECT id, descripcion, monto, categoria, fecha FROM gastos WHERE strftime('%Y-%m', fecha) = ? ORDER BY fecha DESC")
        .bind(&mes_str).fetch_all(&*db).await.map_err(|e| e.to_string())?;
    Ok(filas.iter().map(|r| serde_json::json!({
        "id": r.get::<i64,_>("id"), "descripcion": r.get::<String,_>("descripcion"),
        "monto": r.get::<f64,_>("monto"), "categoria": r.get::<String,_>("categoria"),
        "fecha": r.get::<String,_>("fecha")
    })).collect())
}

#[tauri::command]
pub async fn eliminar_gasto(id: i64, db: State<'_, SqlitePool>) -> Result<(), String> {
    sqlx::query("DELETE FROM gastos WHERE id = ?").bind(id).execute(&*db).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn agregar_ingreso(descripcion: String, monto: f64, db: State<'_, SqlitePool>) -> Result<i64, String> {
    let id = sqlx::query("INSERT INTO ingresos (descripcion, monto, fecha) VALUES (?, ?, date('now'))")
        .bind(&descripcion).bind(monto)
        .execute(&*db).await.map_err(|e| e.to_string())?.last_insert_rowid();
    Ok(id)
}

#[tauri::command]
pub async fn listar_ingresos(anio: i32, mes: i32, db: State<'_, SqlitePool>) -> Result<Vec<serde_json::Value>, String> {
    let mes_str = format!("{:04}-{:02}", anio, mes);
    let filas = sqlx::query("SELECT id, descripcion, monto, fecha FROM ingresos WHERE strftime('%Y-%m', fecha) = ? ORDER BY fecha DESC")
        .bind(&mes_str).fetch_all(&*db).await.map_err(|e| e.to_string())?;
    Ok(filas.iter().map(|r| serde_json::json!({
        "id": r.get::<i64,_>("id"), "descripcion": r.get::<String,_>("descripcion"),
        "monto": r.get::<f64,_>("monto"), "fecha": r.get::<String,_>("fecha")
    })).collect())
}

#[tauri::command]
pub async fn obtener_resumen_mes(anio: i32, mes: i32, db: State<'_, SqlitePool>) -> Result<ResumenMes, String> {
    let mes_str = format!("{:04}-{:02}", anio, mes);
    let total_gastos: f64 = sqlx::query("SELECT COALESCE(SUM(monto), 0.0) as total FROM gastos WHERE strftime('%Y-%m', fecha) = ?")
        .bind(&mes_str).fetch_one(&*db).await.map_err(|e| e.to_string())?.get("total");
    let total_ingresos: f64 = sqlx::query("SELECT COALESCE(SUM(monto), 0.0) as total FROM ingresos WHERE strftime('%Y-%m', fecha) = ?")
        .bind(&mes_str).fetch_one(&*db).await.map_err(|e| e.to_string())?.get("total");
    let filas_cat = sqlx::query("SELECT categoria, SUM(monto) as total FROM gastos WHERE strftime('%Y-%m', fecha) = ? GROUP BY categoria ORDER BY total DESC")
        .bind(&mes_str).fetch_all(&*db).await.map_err(|e| e.to_string())?;
    Ok(ResumenMes {
        total_gastos,
        total_ingresos,
        total_ahorrado: total_ingresos - total_gastos,
        gastos_por_categoria: filas_cat.iter().map(|r| GastoCategoria {
            categoria: r.get("categoria"), total: r.get("total")
        }).collect(),
    })
}



// ── PRESUPUESTO ───────────────────────────────────────────

#[tauri::command]
pub async fn guardar_presupuesto(
    anio: i32, mes: i32, monto: f64,
    db: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO presupuesto (anio, mes, monto) VALUES (?, ?, ?)
         ON CONFLICT(anio, mes) DO UPDATE SET monto = excluded.monto"
    )
    .bind(anio).bind(mes).bind(monto)
    .execute(&*db).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn obtener_presupuesto(
    anio: i32, mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<f64, String> {
    let row = sqlx::query(
        "SELECT monto FROM presupuesto WHERE anio = ? AND mes = ?"
    )
    .bind(anio).bind(mes)
    .fetch_optional(&*db).await.map_err(|e| e.to_string())?;

    Ok(row.map(|r| r.get::<f64, _>("monto")).unwrap_or(0.0))
}

// ── DISPENSADOR DIARIO ────────────────────────────────────

#[tauri::command]
pub async fn obtener_dispensador_dia(
    anio: i32, mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<DispensadorDia, String> {
    let hoy = Local::now();
    let dia_actual = hoy.day() as i32;
    let dias_en_mes = dias_en_mes(anio, mes);
    let dias_restantes = (dias_en_mes - dia_actual + 1).max(1);

    let mes_str = format!("{:04}-{:02}", anio, mes);
    let hoy_str = format!("{:04}-{:02}-{:02}", anio, mes, dia_actual);

    let presupuesto: f64 = sqlx::query(
        "SELECT COALESCE(monto, 0.0) as monto FROM presupuesto WHERE anio=? AND mes=?"
    )
    .bind(anio).bind(mes)
    .fetch_optional(&*db).await.map_err(|e| e.to_string())?
    .map(|r| r.get::<f64, _>("monto")).unwrap_or(0.0);

    let gastado_mes: f64 = sqlx::query(
        "SELECT COALESCE(SUM(monto), 0.0) as total FROM gastos WHERE strftime('%Y-%m', fecha) = ?"
    )
    .bind(&mes_str)
    .fetch_one(&*db).await.map_err(|e| e.to_string())?
    .get("total");

    let gastado_hoy: f64 = sqlx::query(
        "SELECT COALESCE(SUM(monto), 0.0) as total FROM gastos WHERE fecha = ?"
    )
    .bind(&hoy_str)
    .fetch_one(&*db).await.map_err(|e| e.to_string())?
    .get("total");

    let restante_mes = (presupuesto - gastado_mes).max(0.0);
    let limite_hoy = (restante_mes / dias_restantes as f64).max(0.0);
    let porcentaje_hoy = if limite_hoy > 0.0 {
        (gastado_hoy / limite_hoy * 100.0).min(200.0)
    } else { 0.0 };

    let alerta = if porcentaje_hoy >= 100.0 {
        "excedido".to_string()
    } else if porcentaje_hoy >= 80.0 {
        "advertencia".to_string()
    } else {
        "ok".to_string()
    };

    Ok(DispensadorDia {
        presupuesto_mes: presupuesto,
        gastado_mes,
        dias_restantes,
        limite_hoy,
        gastado_hoy,
        porcentaje_hoy,
        alerta,
    })
}

// ── PREDICCIÓN ML (regresión lineal simple) ───────────────

#[tauri::command]
pub async fn obtener_prediccion_ml(
    anio: i32, mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<PrediccionML, String> {
    let hoy = Local::now();
    let dia_actual = hoy.day() as i32;
    let dias_en_mes = dias_en_mes(anio, mes);
    let mes_str = format!("{:04}-{:02}", anio, mes);

    // Gastos por día del mes actual
    let filas = sqlx::query(
        "SELECT CAST(strftime('%d', fecha) AS INTEGER) as dia,
                COALESCE(SUM(monto), 0.0) as total
         FROM gastos WHERE strftime('%Y-%m', fecha) = ?
         GROUP BY dia ORDER BY dia"
    )
    .bind(&mes_str)
    .fetch_all(&*db).await.map_err(|e| e.to_string())?;

    // Regresión lineal: y = a + b*x  (x=día, y=gasto acumulado)
    let mut gastos_por_dia: Vec<(i32, f64)> = filas.iter()
        .map(|r| (r.get::<i32, _>("dia"), r.get::<f64, _>("total")))
        .collect();

    let gastado_total: f64 = gastos_por_dia.iter().map(|(_, v)| v).sum();
    let promedio_diario = if dia_actual > 1 {
        gastado_total / (dia_actual - 1) as f64
    } else { 0.0 };

    // Proyección simple: gasto acumulado + promedio * días restantes
    let dias_restantes = (dias_en_mes - dia_actual + 1).max(0);
    let proyeccion_mes = gastado_total + promedio_diario * dias_restantes as f64;

    let presupuesto: f64 = sqlx::query(
        "SELECT COALESCE(monto, 0.0) as monto FROM presupuesto WHERE anio=? AND mes=?"
    )
    .bind(anio).bind(mes)
    .fetch_optional(&*db).await.map_err(|e| e.to_string())?
    .map(|r| r.get::<f64, _>("monto")).unwrap_or(0.0);

    let confianza = (40.0 + dia_actual as f64 * 2.0).min(95.0);
    let diferencia = proyeccion_mes - presupuesto;

    // Desglose proyectado por categoría
    let cats = sqlx::query(
        "SELECT categoria, COALESCE(SUM(monto), 0.0) as total
         FROM gastos WHERE strftime('%Y-%m', fecha) = ?
         GROUP BY categoria"
    )
    .bind(&mes_str)
    .fetch_all(&*db).await.map_err(|e| e.to_string())?;

    let desglose: Vec<GastoCategoria> = cats.iter().map(|r| {
        let acum: f64 = r.get("total");
        let proy = if dia_actual > 1 {
            acum / (dia_actual - 1) as f64 * dias_en_mes as f64
        } else { acum };
        GastoCategoria { categoria: r.get("categoria"), total: proy }
    }).collect();

    // Compromisos pendientes este mes
    let hoy_naive = hoy.naive_local().date();
    let compromisos = obtener_compromisos_pendientes_interno(
        anio, mes, hoy_naive, &db
    ).await?;

    Ok(PrediccionML {
        proyeccion_mes,
        diferencia_vs_presupuesto: diferencia,
        confianza,
        promedio_diario,
        compromisos_pendientes: compromisos,
        desglose_proyectado: desglose,
    })
}

// ── COMPROMISOS ───────────────────────────────────────────

#[tauri::command]
pub async fn agregar_compromiso(
    nombre: String, monto: f64, tipo: String,
    dia_mes: Option<i32>, fecha: Option<String>,
    db: State<'_, SqlitePool>,
) -> Result<i64, String> {
    let id = sqlx::query(
        "INSERT INTO compromisos (nombre, monto, tipo, dia_mes, fecha) VALUES (?,?,?,?,?)"
    )
    .bind(&nombre).bind(monto).bind(&tipo).bind(dia_mes).bind(&fecha)
    .execute(&*db).await.map_err(|e| e.to_string())?
    .last_insert_rowid();
    Ok(id)
}

#[tauri::command]
pub async fn listar_compromisos(
    db: State<'_, SqlitePool>,
) -> Result<Vec<Compromiso>, String> {
    let filas = sqlx::query(
        "SELECT id, nombre, monto, tipo, dia_mes, fecha, activo
         FROM compromisos WHERE activo = 1 ORDER BY tipo, nombre"
    )
    .fetch_all(&*db).await.map_err(|e| e.to_string())?;

    Ok(filas.iter().map(|r| Compromiso {
        id: r.get("id"),
        nombre: r.get("nombre"),
        monto: r.get("monto"),
        tipo: r.get("tipo"),
        dia_mes: r.get("dia_mes"),
        fecha: r.get("fecha"),
        activo: r.get::<i32, _>("activo") == 1,
    }).collect())
}

#[tauri::command]
pub async fn eliminar_compromiso(
    id: i64, db: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query("UPDATE compromisos SET activo = 0 WHERE id = ?")
        .bind(id).execute(&*db).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── MENSAJE DE MAÑANA ─────────────────────────────────────

#[tauri::command]
pub async fn obtener_mensaje_manana(
    anio: i32, mes: i32,
    db: State<'_, SqlitePool>,
) -> Result<MensajeManana, String> {
    let hoy = Local::now();
    let nombre: String = sqlx::query(
        "SELECT valor FROM configuracion WHERE clave = 'nombre_usuario'"
    )
    .fetch_optional(&*db).await.map_err(|e| e.to_string())?
    .map(|r| r.get("valor")).unwrap_or_else(|| "amigo/a".to_string());

    let dispensador = obtener_dispensador_dia(anio, mes, db.clone()).await?;

    let ayer_str = format!("{}", (hoy - Duration::days(1)).format("%Y-%m-%d"));
    let gastado_ayer: f64 = sqlx::query(
        "SELECT COALESCE(SUM(monto), 0.0) as total FROM gastos WHERE fecha = ?"
    )
    .bind(&ayer_str)
    .fetch_one(&*db).await.map_err(|e| e.to_string())?
    .get("total");

    let hoy_naive = hoy.naive_local().date();
    let compromisos_semana = obtener_compromisos_pendientes_interno(anio, mes, hoy_naive, &db)
        .await?
        .into_iter()
        .filter(|c| c.dias_para_vencer <= 7)
        .collect::<Vec<_>>();

    let emoji = if dispensador.gastado_mes < dispensador.presupuesto_mes * 0.5 {
        "🟢"
    } else if dispensador.gastado_mes < dispensador.presupuesto_mes * 0.8 {
        "🟡"
    } else { "🔴" };

    let fmt_cop = |v: f64| format!("${:.0}", v)
        .chars().rev().enumerate()
        .map(|(i, c)| if i > 0 && i % 3 == 0 && c.is_ascii_digit() {
            format!(".{}", c)
        } else { c.to_string() })
        .collect::<Vec<_>>().into_iter().rev().collect::<String>();

    let mensaje = format!(
        "Buenos días, {}! {} Hoy puedes gastar máximo {}. Ayer gastaste {}. Te quedan {} días de mes.",
        nombre, emoji,
        fmt_cop(dispensador.limite_hoy),
        fmt_cop(gastado_ayer),
        dispensador.dias_restantes
    );

    Ok(MensajeManana {
        nombre_usuario: nombre,
        limite_hoy: dispensador.limite_hoy,
        gastado_ayer,
        compromisos_esta_semana: compromisos_semana,
        mensaje,
    })
}

// ── CONFIGURACIÓN ─────────────────────────────────────────

#[tauri::command]
pub async fn guardar_config(
    clave: String, valor: String,
    db: State<'_, SqlitePool>,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO configuracion (clave, valor) VALUES (?,?)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor"
    )
    .bind(&clave).bind(&valor)
    .execute(&*db).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn obtener_config(
    clave: String, db: State<'_, SqlitePool>,
) -> Result<Option<String>, String> {
    let row = sqlx::query("SELECT valor FROM configuracion WHERE clave = ?")
        .bind(&clave)
        .fetch_optional(&*db).await.map_err(|e| e.to_string())?;
    Ok(row.map(|r| r.get("valor")))
}

// ── HELPERS INTERNOS ──────────────────────────────────────

fn dias_en_mes(anio: i32, mes: i32) -> i32 {
    let siguiente = if mes == 12 {
        NaiveDate::from_ymd_opt(anio + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(anio, (mes + 1) as u32, 1)
    };
    let primero = NaiveDate::from_ymd_opt(anio, mes as u32, 1).unwrap();
    (siguiente.unwrap() - primero).num_days() as i32
}

async fn obtener_compromisos_pendientes_interno(
    anio: i32, mes: i32,
    hoy: NaiveDate,
    db: &SqlitePool,
) -> Result<Vec<CompromisoPendiente>, String> {
    let filas = sqlx::query(
        "SELECT nombre, monto, tipo, dia_mes, fecha FROM compromisos WHERE activo = 1"
    )
    .fetch_all(db).await.map_err(|e| e.to_string())?;

    let mut pendientes: Vec<CompromisoPendiente> = Vec::new();
    for r in filas {
        let tipo: String = r.get("tipo");
        let nombre: String = r.get("nombre");
        let monto: f64 = r.get("monto");

        let fecha_venc = match tipo.as_str() {
            "recurrente" => {
                let dia: i32 = r.get::<Option<i32>, _>("dia_mes").unwrap_or(1);
                NaiveDate::from_ymd_opt(anio, mes as u32, dia.min(28) as u32)
            }
            "impuesto" | "cumple" => {
                if let Some(f) = r.get::<Option<String>, _>("fecha") {
                    // Formato MM-DD
                    let partes: Vec<&str> = f.split('-').collect();
                    if partes.len() == 2 {
                        let m: u32 = partes[0].parse().unwrap_or(mes as u32);
                        let d: u32 = partes[1].parse().unwrap_or(1);
                        NaiveDate::from_ymd_opt(anio, m, d)
                    } else { None }
                } else { None }
            }
            _ => None,
        };

        if let Some(fv) = fecha_venc {
            let dias = (fv - hoy).num_days() as i32;
            if dias >= 0 && dias <= 45 {
                pendientes.push(CompromisoPendiente {
                    nombre, monto, dias_para_vencer: dias, tipo,
                });
            }
        }
    }
    pendientes.sort_by_key(|c| c.dias_para_vencer);
    Ok(pendientes)
}