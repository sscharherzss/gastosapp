use tauri::{State, AppHandle, Manager};
use sqlx::{SqlitePool, Row, sqlite::SqlitePoolOptions};
use crate::models::{
    Compromiso, DispensadorDia, PrediccionML, CompromisoPendiente, 
    MensajeManana, GastoCategoria, Gasto, Ingreso, ResumenMes, Presupuesto
};
use chrono::{Local, NaiveDate, Duration};

// Importamos el contenedor dinámico del pool desde la raíz (lib.rs)
use crate::DbState;

/// Función auxiliar interna para extraer de forma segura el pool activo 
/// desde el cerrojo asíncrono compartido (RwLock).
async fn obtener_pool(state: &State<'_, DbState>) -> Result<SqlitePool, String> {
    let guard = state.pool.read().await;
    guard.clone().ok_or_else(|| "No hay ninguna base de datos activa".to_string())
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
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS ingresos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            descripcion TEXT NOT NULL, 
            monto REAL NOT NULL, 
            fecha TEXT NOT NULL
        )"
    ).execute(pool).await?;

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
            activo INTEGER DEFAULT 1
        )"
    ).execute(pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS config (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        )"
    ).execute(pool).await?;

    Ok(())
}

// ── COMANDOS DE MUTACIÓN DE INTERFAZ ──────────────────────────────────────────

#[tauri::command]
pub async fn cambiar_perfil(nombre_perfil: String, handle: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    let app_dir = handle.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    
    // Normalización de nombres de archivo (minúsculas y guiones bajos)
    let nombre_archivo = format!("perfil_{}.db", nombre_perfil.to_lowercase().replace(' ', "_"));
    let nueva_ruta = app_dir.join(nombre_archivo);
    let db_url = format!("sqlite://{}?mode=rwc", nueva_ruta.display());

    // Bloqueamos el estado global para escritura segura en caliente
    let mut pool_guard = state.pool.write().await;

    // Si había un pool previo, liberamos sus conexiones físicas cerrándolo limpiamente
    if let Some(antiguo_pool) = pool_guard.take() {
        antiguo_pool.close().await;
    }

    // Conexión al nuevo archivo de base de datos SQLite
    let nuevo_pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .map_err(|e| e.to_string())?;

    // Verificamos o creamos el esquema de tablas en la nueva DB
    inicializar_db(&nuevo_pool).await
        .map_err(|e| e.to_string())?;

    // Guardamos la nueva referencia como el pool activo
    *pool_guard = Some(nuevo_pool);

    println!("Backend sincronizado exitosamente al archivo: {}", nueva_ruta.display());
    Ok(())
}

// ── SECCIÓN: GASTOS ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn agregar_gasto(descripcion: String, monto: f64, categoria: String, state: State<'_, DbState>) -> Result<(), String> {
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
pub async fn listar_gastos(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<Vec<Gasto>, String> {
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
pub async fn agregar_ingreso(descripcion: String, monto: f64, state: State<'_, DbState>) -> Result<(), String> {
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
pub async fn listar_ingresos(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<Vec<Ingreso>, String> {
    let pool = obtener_pool(&state).await?;
    let prefijo_fecha = format!("{:04}-{:02}%", anio, mes);

    let filas = sqlx::query("SELECT id, descripcion, monto, fecha FROM ingresos WHERE fecha LIKE ? ORDER BY id DESC")
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
pub async fn obtener_resumen_mes(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<ResumenMes, String> {
    let pool = obtener_pool(&state).await?;
    let prefijo_fecha = format!("{:04}-{:02}%", anio, mes);

    let fila_g: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha LIKE ?")
        .bind(&prefijo_fecha)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    
    let fila_i: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM ingresos WHERE fecha LIKE ?")
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
pub async fn guardar_presupuesto(anio: i32, mes: i32, monto: f64, state: State<'_, DbState>) -> Result<(), String> {
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
pub async fn obtener_presupuesto(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<Option<Presupuesto>, String> {
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
pub async fn obtener_dispensador_dia(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<DispensadorDia, String> {
    let pool = obtener_pool(&state).await?;
    
    // Obtener presupuesto base asignado del mes
    let r_pres: (Option<f64>,) = sqlx::query_as("SELECT monto FROM presupuesto WHERE anio = ? AND mes = ?")
        .bind(anio).bind(mes).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let presupuesto_mes = r_pres.0.unwrap_or(0.0);

    // Obtener los gastos consolidados del mes en curso
    let prefijo_mes = format!("{:04}-{:02}%", anio, mes);
    let r_gastado: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha LIKE ?")
        .bind(&prefijo_mes).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let gastado_mes = r_gastado.0.unwrap_or(0.0);

    // Obtener el acumulado consumido específicamente el día de hoy
    let hoy_str = Local::now().format("%Y-%m-%d").to_string();
    let r_hoy: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha = ?")
        .bind(&hoy_str).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let gastado_hoy = r_hoy.0.unwrap_or(0.0);

    // Cálculo temporal
    let dt_hoy = Local::now().naive_local().date();
    let prox_mes = if mes == 12 { NaiveDate::from_ymd_opt(anio + 1, 1, 1).unwrap() } 
                   else { NaiveDate::from_ymd_opt(anio, (mes + 1) as u32, 1).unwrap() };
    let dias_restantes = (prox_mes - dt_hoy).num_days() as i32;
    let dias_reales = dias_restantes.max(1);

    // Saldo neto restante del presupuesto libre
    let disponible_mes = (presupuesto_mes - (gastado_mes - gastado_hoy)).max(0.0);
    let limite_hoy = disponible_mes / dias_reales as f64;

    let porcentaje_hoy = if limite_hoy > 0.0 { (gastado_hoy / limite_hoy) * 100.0 } else { 0.0 };
    let alerta = if porcentaje_hoy > 100.0 { "excedido".to_string() }
                 else if porcentaje_hoy > 85.0 { "advertencia".to_string() }
                 else { "ok".to_string() };

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
pub async fn agregar_compromiso(nombre: String, monto: f64, tipo: String, dia_mes: Option<i32>, fecha: Option<String>, state: State<'_, DbState>) -> Result<(), String> {
    let pool = obtener_pool(&state).await?;
    sqlx::query("INSERT INTO compromisos (nombre, monto, tipo, dia_mes, fecha) VALUES (?, ?, ?, ?, ?)")
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
    let filas = sqlx::query("SELECT id, nombre, monto, tipo, dia_mes, fecha, activo FROM compromisos")
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

// ── SECCIÓN: MOTOR DE PROYECCIONES DE APRENDIZAJE MACHINE LEARNING ────────────

#[tauri::command]
pub async fn obtener_prediccion_ml(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<PrediccionML, String> {
    let pool = obtener_pool(&state).await?;
    
    // 1. Obtener presupuesto asignado
    let r_p: (Option<f64>,) = sqlx::query_as("SELECT monto FROM presupuesto WHERE anio = ? AND mes = ?")
        .bind(anio).bind(mes).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let presupuesto = r_p.0.unwrap_or(0.0);

    // 2. Analizar el comportamiento del mes en base a los registros actuales
    let prefijo = format!("{:04}-{:02}%", anio, mes);
    let filas_g = sqlx::query("SELECT monto, fecha FROM gastos WHERE fecha LIKE ?")
        .bind(&prefijo).fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut sumatoria = 0.0;
    let mut recuento_dias = 0;
    let mut ultimo_dia_visto = 0;

    for r in &filas_g {
        let m: f64 = r.get("monto");
        let f: String = r.get("fecha");
        sumatoria += m;
        if let Some(d_parse) = f.split('-').nth(2).and_then(|s| s.parse::<i32>().ok()) {
            if d_parse > ultimo_dia_visto {
                ultimo_dia_visto = d_parse;
                recuento_dias += 1;
            }
        }
    }

    let promedio_diario = if recuento_dias > 0 { sumatoria / recuento_dias as f64 } else { 0.0 };

    // Calcular días faltantes para cerrar el ciclo
    let hoy = Local::now().naive_local().date();
    let fin_mes = if mes == 12 { NaiveDate::from_ymd_opt(anio + 1, 1, 1).unwrap() } 
                  else { NaiveDate::from_ymd_opt(anio, (mes + 1) as u32, 1).unwrap() };
    let dias_restantes = (fin_mes - hoy).num_days();

    // Proyección lineal simple por comportamiento diario regular
    let mut proyeccion_mes = sumatoria + (promedio_diario * dias_restantes as f64);

    // 3. Evaluar e inyectar los compromisos estáticos pendientes en el ciclo activo
    let filas_c = sqlx::query("SELECT nombre, monto, tipo, dia_mes, fecha FROM compromisos WHERE activo = 1")
        .fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut compromisos_pendientes = Vec::new();
    for r in filas_c {
        let tipo: String = r.get("tipo");
        let nombre: String = r.get("nombre");
        let monto: f64 = r.get("monto");

        let vencimiento = match tipo.as_str() {
            "recurrente" => {
                let d = r.get::<Option<i32>, _>("dia_mes").unwrap_or(1);
                NaiveDate::from_ymd_opt(anio, mes as u32, d.min(28) as u32)
            }
            "impuesto" | "cumple" => {
                if let Some(f_str) = r.get::<Option<String>, _>("fecha") {
                    let p: Vec<&str> = f_str.split('-').collect();
                    if p.len() == 2 {
                        let m_p: u32 = p[0].parse().unwrap_or(mes as u32);
                        let d_p: u32 = p[1].parse().unwrap_or(1);
                        NaiveDate::from_ymd_opt(anio, m_p, d_p)
                    } else { None }
                } else { None }
            }
            _ => None,
        };

        if let Some(fv) = vencimiento {
            if fv >= hoy && fv < fin_mes {
                let delta = (fv - hoy).num_days() as i32;
                compromisos_pendientes.push(CompromisoPendiente {
                    nombre: nombre.clone(),
                    monto,
                    dias_para_vencer: delta,
                    tipo: tipo.clone(),
                });
                proyeccion_mes += monto;
            }
        }
    }

    let diferencia_vs_presupuesto = presupuesto - proyeccion_mes;
    let confianza = if recuento_dias > 5 { (80.0 + (recuento_dias as f64 * 0.6)).min(98.0) } else { 50.0 };

    // Reutilizar categorías actuales como desglose dummy ponderado
    let filas_cat = sqlx::query("SELECT categoria, SUM(monto) as total FROM gastos WHERE fecha LIKE ? GROUP BY categoria")
        .bind(&prefijo).fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut desglose_proyectado = Vec::new();
    for r in filas_cat {
        let t_act: f64 = r.get("total");
        let factor = if sumatoria > 0.0 { t_act / sumatoria } else { 0.0 };
        desglose_proyectado.push(GastoCategoria {
            categoria: r.get("categoria"),
            total: t_act + (promedio_diario * dias_restantes as f64 * factor),
        });
    }

    Ok(PrediccionML {
        proyeccion_mes,
        diferencia_vs_presupuesto,
        confianza,
        promedio_diario,
        compromisos_pendientes,
        desglose_proyectado,
    })
}

// ── SECCIÓN: NOTIFICACIONES AL USUARIO Y SALUDOS CONTEXTUALES ────────────────

#[tauri::command]
pub async fn obtener_mensaje_manana(anio: i32, mes: i32, state: State<'_, DbState>) -> Result<MensajeManana, String> {
    let pool = obtener_pool(&state).await?;
    
    // 1. Obtener los datos del dispensador de hoy
    let disp = obtener_dispensador_dia(anio, mes, state).await?;

    // 2. Calcular cuánto se gastó exactamente el día de ayer
    let ayer_str = (Local::now() - Duration::days(1)).format("%Y-%m-%d").to_string();
    let r_ayer: (Option<f64>,) = sqlx::query_as("SELECT SUM(monto) FROM gastos WHERE fecha = ?")
        .bind(&ayer_str)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let gastado_ayer = r_ayer.0.unwrap_or(0.0);

    // 3. Obtener los compromisos activos que vencen en los próximos 7 días
    let hoy = Local::now().naive_local().date();
    let en_una_semana = hoy + Duration::days(7);
    let filas_c = sqlx::query("SELECT nombre, monto, tipo, dia_mes, fecha FROM compromisos WHERE activo = 1")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut compromisos_esta_semana = Vec::new();
    for r in filas_c {
        let tipo: String = r.get("tipo");
        let nombre: String = r.get("nombre");
        let monto: f64 = r.get("monto");

        let vencimiento = match tipo.as_str() {
            "recurrente" => {
                let d = r.get::<Option<i32>, _>("dia_mes").unwrap_or(1);
                NaiveDate::from_ymd_opt(anio, mes as u32, d.min(28) as u32)
            }
            "impuesto" | "cumple" => {
                if let Some(f_str) = r.get::<Option<String>, _>("fecha") {
                    let p: Vec<&str> = f_str.split('-').collect();
                    if p.len() == 2 {
                        let m_p: u32 = p[0].parse().unwrap_or(mes as u32);
                        let d_p: u32 = p[1].parse().unwrap_or(1);
                        NaiveDate::from_ymd_opt(anio, m_p, d_p)
                    } else { None }
                } else { None }
            }
            _ => None,
        };

        if let Some(fv) = vencimiento {
            if fv >= hoy && fv <= en_una_semana {
                let delta = (fv - hoy).num_days() as i32;
                compromisos_esta_semana.push(CompromisoPendiente {
                    nombre: nombre.clone(),
                    monto,
                    dias_para_vencer: delta,
                    tipo: tipo.clone(),
                });
            }
        }
    }

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
        "Aún no defines tu presupuesto mensual. Registra uno en el dispensador para guiarte.".to_string()
    } else if disp.alerta == "excedido" {
        format!("¡Alerta de control! Has superado el límite sugerido diario por ${:.2} hoy.", (disp.gastado_hoy - disp.limite_hoy).abs())
    } else if disp.porcentaje_hoy > 75.0 {
        "Atención: Te queda menos del 25% del cupo diario disponible para gastos.".to_string()
    } else {
        format!("Vas bien. Tienes un margen de seguridad saludable de ${:.2} para el resto del día.", (disp.limite_hoy - disp.gastado_hoy).max(0.0))
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
pub async fn guardar_config(clave: String, valor: String, state: State<'_, DbState>) -> Result<(), String> {
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
pub async fn obtener_config(clave: String, state: State<'_, DbState>) -> Result<Option<String>, String> {
    let pool = obtener_pool(&state).await?;
    let fila = sqlx::query("SELECT valor FROM config WHERE clave = ?")
        .bind(clave)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(fila.map(|r| r.get("valor")))
}