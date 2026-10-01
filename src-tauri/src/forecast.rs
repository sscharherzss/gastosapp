//! Aprendizaje estadístico local: recurrencias mensuales y media diaria ponderada.
//! No transmite datos ni representa una probabilidad calibrada.
use crate::models::{Compromiso, CompromisoPendiente, Gasto, GastoCategoria, PrediccionML};
use chrono::{Datelike, Duration, NaiveDate};
use std::collections::{BTreeMap, BTreeSet};

pub fn limites_mes(anio: i32, mes: i32) -> Result<(NaiveDate, NaiveDate), String> {
    let inicio = NaiveDate::from_ymd_opt(anio, mes as u32, 1).ok_or("Mes inválido")?;
    let fin = if mes == 12 {
        NaiveDate::from_ymd_opt(anio + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(anio, (mes + 1) as u32, 1)
    }
    .ok_or("Mes inválido")?;
    Ok((inicio, fin))
}
fn clave(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}
fn mediana(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(f64::total_cmp);
    let n = xs.len();
    if n % 2 == 0 {
        (xs[n / 2 - 1] + xs[n / 2]) / 2.0
    } else {
        xs[n / 2]
    }
}
pub fn calcular(
    gastos: &[Gasto],
    compromisos: &[Compromiso],
    presupuesto: Option<f64>,
    anio: i32,
    mes: i32,
    hoy: NaiveDate,
) -> Result<PrediccionML, String> {
    let (inicio, fin) = limites_mes(anio, mes)?;
    let dias = (fin - inicio).num_days();
    let transcurridos = if hoy < inicio {
        0
    } else if hoy >= fin {
        dias
    } else {
        i64::from(hoy.day())
    };
    let restantes = dias - transcurridos;
    let indice = anio * 12 + mes - 1;
    let registros: Vec<_> = gastos
        .iter()
        .filter_map(|g| {
            NaiveDate::parse_from_str(&g.fecha, "%Y-%m-%d")
                .ok()
                .map(|d| (g, d))
        })
        .filter(|(g, d)| *d <= hoy && *d < fin && g.monto.is_finite() && g.monto > 0.0)
        .collect();
    let actuales: Vec<_> = registros.iter().filter(|(_, d)| *d >= inicio).collect();
    let mut historia: BTreeMap<String, BTreeMap<i32, Vec<(&Gasto, NaiveDate)>>> = BTreeMap::new();
    let mut meses = BTreeSet::new();
    for (g, d) in &registros {
        let i = d.year() * 12 + d.month() as i32 - 1;
        if (indice - 6..indice).contains(&i) {
            meses.insert(i);
            historia
                .entry(clave(&g.descripcion))
                .or_default()
                .entry(i)
                .or_default()
                .push((g, *d));
        }
    }
    // Una transacción por mes, al menos dos de los últimos tres meses y montos estables.
    let mut patrones: BTreeMap<String, (String, f64, u32, String)> = BTreeMap::new();
    for (k, ms) in &historia {
        let recientes: Vec<_> = ms.iter().filter(|(i, _)| **i >= indice - 3).collect();
        if recientes.len() < 2
            || recientes.iter().any(|(_, gs)| gs.len() != 1)
            || !ms.contains_key(&(indice - 1))
        {
            continue;
        }
        let montos: Vec<_> = recientes.iter().map(|(_, gs)| gs[0].0.monto).collect();
        let monto = mediana(montos.clone());
        if montos.iter().any(|m| (m - monto).abs() / monto > 0.30) {
            continue;
        }
        let fechas: Vec<_> = recientes
            .iter()
            .map(|(_, gs)| gs[0].1.day() as f64)
            .collect();
        let dia = mediana(fechas.clone()) as u32;
        if fechas.iter().any(|d| (d - dia as f64).abs() > 7.0) {
            continue;
        }
        let g = recientes.last().unwrap().1[0].0;
        patrones.insert(
            k.clone(),
            (g.descripcion.clone(), monto, dia, g.categoria.clone()),
        );
    }
    let ultimo = (fin - Duration::days(1)).day();
    let mut esperados: BTreeMap<String, (String, f64, NaiveDate, String, String)> = BTreeMap::new();
    for (k, (nombre, monto, dia, cat)) in &patrones {
        esperados.insert(
            k.clone(),
            (
                nombre.clone(),
                *monto,
                NaiveDate::from_ymd_opt(anio, mes as u32, (*dia).min(ultimo)).unwrap(),
                "aprendido".into(),
                cat.clone(),
            ),
        );
    }
    for c in compromisos.iter().filter(|c| c.activo) {
        let fecha = match c.tipo.as_str() {
            "recurrente" => c
                .dia_mes
                .filter(|d| (1..=31).contains(d))
                .and_then(|d| NaiveDate::from_ymd_opt(anio, mes as u32, (d as u32).min(ultimo))),
            "cumple" | "impuesto" => c.fecha.as_ref().and_then(|f| {
                NaiveDate::parse_from_str(&format!("{}-{}", anio, f), "%Y-%m-%d").ok()
            }),
            _ => None,
        };
        if let Some(f) = fecha.filter(|f| *f >= inicio && *f < fin) {
            esperados.insert(
                clave(&c.nombre),
                (
                    c.nombre.clone(),
                    c.monto,
                    f,
                    c.tipo.clone(),
                    "Compromisos".into(),
                ),
            );
        }
    }
    let mut categorias: BTreeMap<String, f64> = BTreeMap::new();
    let mut variables: BTreeMap<String, f64> = BTreeMap::new();
    for (g, _) in &actuales {
        *categorias.entry(g.categoria.clone()).or_default() += g.monto;
        if !esperados.contains_key(&clave(&g.descripcion)) {
            *variables.entry(g.categoria.clone()).or_default() += g.monto;
        }
    }
    let mut pendientes = Vec::new();
    if hoy < fin {
        for (k, (nombre, monto, fecha, tipo, cat)) in &esperados {
            let pagado: f64 = actuales
                .iter()
                .filter(|(g, _)| clave(&g.descripcion) == *k)
                .map(|(g, _)| g.monto)
                .sum();
            let falta = (monto - pagado).max(0.0);
            if falta > 0.01 {
                pendientes.push(CompromisoPendiente {
                    nombre: nombre.clone(),
                    monto: falta,
                    dias_para_vencer: (*fecha - hoy).num_days() as i32,
                    tipo: tipo.clone(),
                });
                *categorias.entry(cat.clone()).or_default() += falta;
            }
        }
    }
    // Media de tasas por mes; los meses recientes tienen más peso. Los ceros
    // cuentan únicamente dentro de meses donde existe historial registrado.
    let mut historico: BTreeMap<String, f64> = BTreeMap::new();
    let peso_total: f64 = meses.iter().map(|i| (7 - (indice - i)) as f64).sum();
    for (g, d) in &registros {
        let i = d.year() * 12 + d.month() as i32 - 1;
        if !meses.contains(&i) || esperados.contains_key(&clave(&g.descripcion)) {
            continue;
        }
        let (a, b) = limites_mes(d.year(), d.month() as i32)?;
        *historico.entry(g.categoria.clone()).or_default() +=
            g.monto / (b - a).num_days() as f64 * (7 - (indice - i)) as f64 / peso_total;
    }
    let cats: BTreeSet<_> = variables.keys().chain(historico.keys()).cloned().collect();
    let mut promedio = 0.0;
    for cat in cats {
        let actual = variables.get(&cat).copied().unwrap_or(0.0) / transcurridos.max(1) as f64;
        let tasa = if meses.is_empty() {
            actual
        } else {
            let peso_actual = transcurridos as f64 / (transcurridos as f64 + 14.0);
            actual * peso_actual + historico.get(&cat).copied().unwrap_or(0.0) * (1.0 - peso_actual)
        };
        promedio += tasa;
        *categorias.entry(cat).or_default() += tasa * restantes as f64;
    }
    pendientes.sort_by_key(|p| p.dias_para_vencer);
    let proyeccion_mes = categorias.values().sum();
    Ok(PrediccionML {
        presupuesto_definido: presupuesto.is_some(),
        proyeccion_mes,
        diferencia_vs_presupuesto: presupuesto.unwrap_or(0.0) - proyeccion_mes,
        confianza: (meses.len() as f64 / 6.0 * 100.0).min(100.0),
        promedio_diario: promedio,
        compromisos_pendientes: pendientes,
        desglose_proyectado: categorias
            .into_iter()
            .map(|(categoria, total)| GastoCategoria { categoria, total })
            .collect(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    fn gasto(nombre: &str, monto: f64, fecha: &str) -> Gasto {
        Gasto {
            id: 1,
            descripcion: nombre.into(),
            monto,
            categoria: "Vivienda".into(),
            fecha: fecha.into(),
        }
    }
    fn hoy() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 3, 15).unwrap()
    }
    #[test]
    fn aprende_y_conserva_vencidos() {
        let gs = vec![
            gasto("Internet", 100.0, "2026-01-10"),
            gasto("internet", 100.0, "2026-02-10"),
        ];
        let p = calcular(&gs, &[], Some(80.0), 2026, 3, hoy()).unwrap();
        assert_eq!(p.proyeccion_mes, 100.0);
        assert_eq!(p.compromisos_pendientes[0].dias_para_vencer, -5);
        assert_eq!(p.diferencia_vs_presupuesto, -20.0);
    }
    #[test]
    fn descuenta_pago_sin_duplicarlo() {
        let gs = vec![
            gasto("Internet", 100.0, "2026-01-10"),
            gasto("Internet", 100.0, "2026-02-10"),
            gasto(" Internet ", 100.0, "2026-03-10"),
        ];
        let c = Compromiso {
            id: 1,
            nombre: "Internet".into(),
            monto: 100.0,
            tipo: "recurrente".into(),
            dia_mes: Some(10),
            fecha: None,
            activo: true,
        };
        let p = calcular(&gs, &[c], Some(200.0), 2026, 3, hoy()).unwrap();
        assert_eq!(p.proyeccion_mes, 100.0);
        assert!(p.compromisos_pendientes.is_empty());
    }
    #[test]
    fn pago_parcial_y_dia_31() {
        let c = Compromiso {
            id: 1,
            nombre: "Arriendo".into(),
            monto: 100.0,
            tipo: "recurrente".into(),
            dia_mes: Some(31),
            fecha: None,
            activo: true,
        };
        let p = calcular(
            &[gasto("Arriendo", 40.0, "2026-02-10")],
            &[c],
            None,
            2026,
            2,
            NaiveDate::from_ymd_opt(2026, 2, 20).unwrap(),
        )
        .unwrap();
        assert_eq!(p.proyeccion_mes, 100.0);
        assert_eq!(p.compromisos_pendientes[0].monto, 60.0);
        assert_eq!(p.compromisos_pendientes[0].dias_para_vencer, 8);
        assert!(!p.presupuesto_definido);
    }
    #[test]
    fn pasado_no_proyecta_y_futuro_no_es_negativo() {
        let gs = vec![gasto("Mercado", 200.0, "2026-02-10")];
        assert_eq!(
            calcular(&gs, &[], None, 2026, 2, hoy())
                .unwrap()
                .proyeccion_mes,
            200.0
        );
        assert!(
            calcular(&gs, &[], None, 2026, 4, hoy())
                .unwrap()
                .proyeccion_mes
                >= 0.0
        );
        assert!(calcular(&[], &[], None, 2026, 13, hoy()).is_err());
    }
    #[test]
    fn sin_historial_no_inventa_confianza() {
        let p = calcular(&[], &[], None, 2026, 3, hoy()).unwrap();
        assert_eq!(p.confianza, 0.0);
        assert_eq!(p.proyeccion_mes, 0.0);
    }
    #[test]
    fn compras_frecuentes_no_son_mensualidades() {
        let gs = vec![
            gasto("Cafe", 10.0, "2026-01-01"),
            gasto("Cafe", 10.0, "2026-01-02"),
            gasto("Cafe", 10.0, "2026-02-01"),
            gasto("Cafe", 10.0, "2026-02-02"),
        ];
        let p = calcular(&gs, &[], None, 2026, 3, hoy()).unwrap();
        assert!(p.compromisos_pendientes.is_empty());
        assert!(p.proyeccion_mes > 0.0);
    }
}
